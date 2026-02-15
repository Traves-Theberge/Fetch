#!/usr/bin/env bash
# Install/uninstall harness CLIs on the host.

set -euo pipefail

log() { printf "[harness-manager] %s\n" "$*"; }
warn() { printf "[harness-manager] WARNING: %s\n" "$*" >&2; }
fail() { printf "[harness-manager] ERROR: %s\n" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage:
  scripts/manage_harnesses.sh install <harness|all>
  scripts/manage_harnesses.sh uninstall <harness|all>
  scripts/manage_harnesses.sh status

Harness names:
  github | claude | gemini | opencode | codex | all
EOF
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

load_github_token_from_env_file() {
  local repo_root env_file token
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  env_file="$repo_root/.env"

  [[ -z "${GH_TOKEN:-}" ]] || return 0
  [[ -f "$env_file" ]] || return 0

  token="$(awk -F= '
    /^[[:space:]]*#/ {next}
    /^[[:space:]]*$/ {next}
    {
      line=$0
      sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      key=line
      sub(/=.*/, "", key)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      if (key=="GH_TOKEN") {
        val=line
        sub(/^[^=]*=/, "", val)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
        gsub(/^"|"$/, "", val)
        gsub(/^'\''|'\''$/, "", val)
        print val
        exit
      }
    }
  ' "$env_file")"

  if [[ -n "$token" ]]; then
    export GH_TOKEN="$token"
  fi
}

npm_global_install() {
  local pkg="$1"
  need_cmd npm
  if [[ -w "$(npm root -g)" ]]; then
    npm install -g "$pkg"
  else
    sudo npm install -g "$pkg"
  fi
}

npm_global_uninstall() {
  local pkg="$1"
  if ! command -v npm >/dev/null 2>&1; then
    warn "npm not found; skipping uninstall for $pkg"
    return 0
  fi
  if [[ -w "$(npm root -g)" ]]; then
    npm uninstall -g "$pkg" >/dev/null 2>&1 || true
  else
    sudo npm uninstall -g "$pkg" >/dev/null 2>&1 || true
  fi
}

gh_copilot_install() {
  need_cmd gh
  load_github_token_from_env_file

  if ! gh auth status >/dev/null 2>&1 && [[ -z "${GH_TOKEN:-}" ]]; then
    fail "GitHub auth is required first. Run 'gh auth login' (or set GH_TOKEN in .env), then retry."
  fi

  # Newer gh releases may include "copilot" as a built-in command instead of an extension.
  if gh copilot --help >/dev/null 2>&1; then
    log "GitHub Copilot command already available"
    return 0
  fi

  if gh extension list >/dev/null 2>&1 && gh extension list | awk '{print $1}' | grep -q '^github/gh-copilot$'; then
    log "GitHub Copilot extension already installed"
    return 0
  fi

  gh extension install github/gh-copilot
}

gh_copilot_uninstall() {
  if ! command -v gh >/dev/null 2>&1; then
    warn "gh not found; skipping GitHub Copilot extension uninstall"
    return 0
  fi
  gh extension remove github/gh-copilot >/dev/null 2>&1 || true
}

install_one() {
  case "$1" in
    github)   log "Installing GitHub Copilot extension"; gh_copilot_install ;;
    claude)   log "Installing Claude Code CLI"; npm_global_install "@anthropic-ai/claude-code" ;;
    gemini)   log "Installing Gemini CLI"; npm_global_install "@google/gemini-cli" ;;
    opencode) log "Installing OpenCode CLI"; npm_global_install "opencode-ai@latest" ;;
    codex)    log "Installing Codex CLI"; npm_global_install "@openai/codex" ;;
    *) fail "Unknown harness: $1" ;;
  esac
}

uninstall_one() {
  case "$1" in
    github)   log "Removing GitHub Copilot extension"; gh_copilot_uninstall ;;
    claude)   log "Removing Claude Code CLI"; npm_global_uninstall "@anthropic-ai/claude-code" ;;
    gemini)   log "Removing Gemini CLI"; npm_global_uninstall "@google/gemini-cli" ;;
    opencode) log "Removing OpenCode CLI"; npm_global_uninstall "opencode-ai" ;;
    codex)    log "Removing Codex CLI"; npm_global_uninstall "@openai/codex" ;;
    *) fail "Unknown harness: $1" ;;
  esac
}

print_status() {
  local gh_cli=0 gh_copilot=0
  command -v gh >/dev/null 2>&1 && gh_cli=1
  if [[ $gh_cli -eq 1 ]]; then
    load_github_token_from_env_file
    if gh copilot --help >/dev/null 2>&1; then
      gh_copilot=1
    fi
    if gh extension list >/dev/null 2>&1 && gh extension list | awk '{print $1}' | grep -q '^github/gh-copilot$'; then
      gh_copilot=1
    fi
  fi
  if [[ $gh_cli -eq 0 ]]; then
    echo "github:   gh-cli-missing"
  elif [[ $gh_copilot -eq 1 ]]; then
    echo "github:   installed"
  else
    echo "github:   copilot-missing"
  fi
  command -v claude >/dev/null 2>&1 && echo "claude:   installed" || echo "claude:   missing"
  command -v gemini >/dev/null 2>&1 && echo "gemini:   installed" || echo "gemini:   missing"
  command -v opencode >/dev/null 2>&1 && echo "opencode: installed" || echo "opencode: missing"
  command -v codex >/dev/null 2>&1 && echo "codex:    installed" || echo "codex:    missing"
}

main() {
  local action="${1:-}"
  local target="${2:-}"

  case "$action" in
    install)
      [[ -n "$target" ]] || fail "Missing harness target"
      if [[ "$target" == "all" ]]; then
        for h in github claude gemini opencode codex; do
          install_one "$h"
        done
      else
        install_one "$target"
      fi
      ;;
    uninstall)
      [[ -n "$target" ]] || fail "Missing harness target"
      if [[ "$target" == "all" ]]; then
        for h in github claude gemini opencode codex; do
          uninstall_one "$h"
        done
      else
        uninstall_one "$target"
      fi
      ;;
    status)
      print_status
      ;;
    -h|--help|help|"")
      usage
      ;;
    *)
      fail "Unknown action: $action"
      ;;
  esac
}

main "$@"
