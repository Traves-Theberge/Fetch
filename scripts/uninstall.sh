#!/usr/bin/env bash
# Fetch uninstall script (safe defaults + optional deep cleanup).

set -euo pipefail

DEFAULT_FETCH_HOME="${HOME}/.fetch"
DEFAULT_BIN_DIR="${HOME}/.local/bin"
FETCH_HOME="${FETCH_HOME:-$DEFAULT_FETCH_HOME}"
BIN_DIR="${BIN_DIR:-$DEFAULT_BIN_DIR}"
WITH_DOCKER=0
WITH_DEPS=0
CLEAN_PATH=0
YES=0

usage() {
  cat <<USAGE
Usage: scripts/uninstall.sh [options]

Options:
  --home <path>        Fetch home directory (default: ~/.fetch)
  --bin-dir <path>     CLI bin directory (default: ~/.local/bin)
  --with-docker        Also remove Fetch docker containers/images/volumes
  --with-deps          Also remove global harness npm packages
  --clean-path         Remove PATH entries for the bin dir from shell profiles
  --yes                Non-interactive (skip confirmation prompt)
  -h, --help           Show help

Examples:
  scripts/uninstall.sh
  scripts/uninstall.sh --with-docker --with-deps
USAGE
}

log() { printf "[fetch-uninstall] %s\n" "$*"; }
warn() { printf "[fetch-uninstall] WARNING: %s\n" "$*" >&2; }
fail() { printf "[fetch-uninstall] ERROR: %s\n" "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --home)
      [[ $# -lt 2 ]] && fail "--home requires a value"
      FETCH_HOME="$2"
      shift 2
      ;;
    --bin-dir)
      [[ $# -lt 2 ]] && fail "--bin-dir requires a value"
      BIN_DIR="$2"
      shift 2
      ;;
    --with-docker)
      WITH_DOCKER=1
      shift
      ;;
    --with-deps)
      WITH_DEPS=1
      shift
      ;;
    --clean-path)
      CLEAN_PATH=1
      shift
      ;;
    --yes)
      YES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

REPO_DIR="$FETCH_HOME/repo"
CLI_LINK="$BIN_DIR/fetch"

if [[ "$YES" -ne 1 ]]; then
  cat <<PROMPT
This will uninstall Fetch from:
  - Repo/Home: $FETCH_HOME
  - CLI link:  $CLI_LINK

Optional cleanup:
  - Docker artifacts: $([[ "$WITH_DOCKER" -eq 1 ]] && echo "yes" || echo "no")
  - Harness npm deps: $([[ "$WITH_DEPS" -eq 1 ]] && echo "yes" || echo "no")
  - PATH profile lines: $([[ "$CLEAN_PATH" -eq 1 ]] && echo "yes" || echo "no")
PROMPT
  read -r -p "Continue? [y/N] " ans
  if [[ "${ans,,}" != "y" ]]; then
    log "Cancelled"
    exit 0
  fi
fi

if [[ -f "$REPO_DIR/docker-compose.yml" && -x "$CLI_LINK" ]]; then
  log "Stopping Fetch services"
  "$CLI_LINK" down >/dev/null 2>&1 || true
fi

if [[ -L "$CLI_LINK" ]]; then
  log "Removing CLI symlink: $CLI_LINK"
  rm -f "$CLI_LINK"
elif [[ -e "$CLI_LINK" ]]; then
  warn "$CLI_LINK exists but is not a symlink; leaving it unchanged"
fi

if [[ -d "$FETCH_HOME" ]]; then
  log "Removing Fetch home: $FETCH_HOME"
  rm -rf "$FETCH_HOME"
fi

if [[ "$WITH_DOCKER" -eq 1 ]]; then
  if command -v docker >/dev/null 2>&1; then
    log "Removing Fetch docker artifacts"
    docker rm -f fetch-bridge fetch-kennel fetch-searxng >/dev/null 2>&1 || true
    docker volume rm fetch_searxng_data >/dev/null 2>&1 || true
    docker image rm fetch-bridge fetch-kennel >/dev/null 2>&1 || true
  else
    warn "docker not found; skipped docker artifact cleanup"
  fi
fi

if [[ "$WITH_DEPS" -eq 1 ]]; then
  if command -v npm >/dev/null 2>&1; then
    log "Removing global harness npm packages"
    if [ -w "$(npm root -g 2>/dev/null || echo /nonexistent)" ]; then
      npm uninstall -g @anthropic-ai/claude-code @google/gemini-cli opencode-ai @openai/codex >/dev/null 2>&1 || true
    else
      sudo npm uninstall -g @anthropic-ai/claude-code @google/gemini-cli opencode-ai @openai/codex >/dev/null 2>&1 || true
    fi
  else
    warn "npm not found; skipped harness dependency cleanup"
  fi
fi

if [[ "$CLEAN_PATH" -eq 1 ]]; then
  log "Cleaning PATH entries from shell profiles"
  for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    if [[ -f "$rc" ]]; then
      sed -i "\|$BIN_DIR|d" "$rc" || true
    fi
  done
  if [[ -f "$HOME/.config/fish/config.fish" ]]; then
    sed -i "\|$BIN_DIR|d" "$HOME/.config/fish/config.fish" || true
  fi
fi

cat <<DONE

[fetch-uninstall] Uninstall complete.
Verify:
  command -v fetch || echo "fetch removed"
  test ! -d "$FETCH_HOME" && echo "$FETCH_HOME removed"
DONE
