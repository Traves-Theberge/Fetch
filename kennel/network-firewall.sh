#!/bin/bash
# ============================================================================
# Kennel Network Egress Firewall
# ============================================================================
# Blocks all outbound traffic except whitelisted destinations.
# Called from entrypoint.sh at container start.
#
# Environment variables:
#   FIREWALL_ENABLED    - Set to "true" to activate (default: false)
#   FIREWALL_WHITELIST  - Comma-separated list of allowed hosts/IPs
#                         e.g. "api.github.com,api.anthropic.com,api.openai.com"
#   FIREWALL_ALLOW_DNS  - Allow DNS resolution (default: true)
# ============================================================================

set -euo pipefail

FIREWALL_ENABLED="${FIREWALL_ENABLED:-false}"
FIREWALL_WHITELIST="${FIREWALL_WHITELIST:-}"
FIREWALL_ALLOW_DNS="${FIREWALL_ALLOW_DNS:-true}"

# Default whitelist: AI provider APIs + GitHub + package registries
DEFAULT_WHITELIST=(
  # GitHub
  "api.github.com"
  "github.com"
  # Anthropic
  "api.anthropic.com"
  # OpenAI
  "api.openai.com"
  # Google AI
  "generativelanguage.googleapis.com"
  # OpenRouter
  "openrouter.ai"
  # Package registries (needed for npm/pip installs inside container)
  "registry.npmjs.org"
  "pypi.org"
  "files.pythonhosted.org"
)

log() {
  echo "[firewall] $*"
}

resolve_host() {
  local host="$1"
  # Return all IPv4 addresses for the host
  getent ahostsv4 "$host" 2>/dev/null | awk '{print $1}' | sort -u || true
}

apply_firewall() {
  log "Activating egress firewall..."

  # Flush existing OUTPUT rules (idempotent re-apply)
  iptables -F OUTPUT 2>/dev/null || true

  # Allow loopback
  iptables -A OUTPUT -o lo -j ACCEPT

  # Allow established/related connections (responses to allowed outbound)
  iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

  # Allow DNS if enabled (needed to resolve whitelist hosts)
  if [ "$FIREWALL_ALLOW_DNS" = "true" ]; then
    iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
    iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT
    log "DNS resolution allowed (port 53)"
  fi

  # Build combined whitelist from defaults + user-supplied
  local all_hosts=("${DEFAULT_WHITELIST[@]}")

  if [ -n "$FIREWALL_WHITELIST" ]; then
    IFS=',' read -ra user_hosts <<< "$FIREWALL_WHITELIST"
    for host in "${user_hosts[@]}"; do
      host="$(echo "$host" | xargs)" # trim whitespace
      [ -n "$host" ] && all_hosts+=("$host")
    done
  fi

  # Resolve and whitelist each host
  local allowed_count=0
  for host in "${all_hosts[@]}"; do
    local ips
    ips=$(resolve_host "$host")
    if [ -n "$ips" ]; then
      while IFS= read -r ip; do
        iptables -A OUTPUT -d "$ip" -j ACCEPT
        allowed_count=$((allowed_count + 1))
      done <<< "$ips"
      log "Allowed: $host"
    else
      log "Warning: could not resolve $host (skipped)"
    fi
  done

  # Default policy: drop all other outbound traffic
  iptables -A OUTPUT -j DROP

  log "Firewall active — $allowed_count IP rules, all other egress blocked"
}

# ============================================================================
# Main
# ============================================================================

if [ "$FIREWALL_ENABLED" = "true" ]; then
  # Check for iptables capability
  if ! command -v iptables &>/dev/null; then
    log "ERROR: iptables not found — firewall cannot be applied"
    exit 1
  fi

  # NET_ADMIN capability required for iptables
  if ! iptables -L OUTPUT -n &>/dev/null 2>&1; then
    log "WARNING: insufficient privileges for iptables (need NET_ADMIN capability)"
    log "Add 'cap_add: [NET_ADMIN]' to docker-compose.yml to enable firewall"
    exit 0
  fi

  apply_firewall
else
  log "Firewall disabled (set FIREWALL_ENABLED=true to activate)"
fi
