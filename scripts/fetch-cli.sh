#!/usr/bin/env bash
# Unified local Fetch CLI for service control and self-management.

set -euo pipefail

INVOKED_PATH="${BASH_SOURCE[0]}"
INVOKED_DIR="$(cd "$(dirname "$INVOKED_PATH")" && pwd)"
SCRIPT_PATH="$INVOKED_PATH"
if command -v readlink >/dev/null 2>&1; then
  RESOLVED="$(readlink -f "$SCRIPT_PATH" 2>/dev/null || true)"
  if [[ -n "${RESOLVED:-}" ]]; then
    SCRIPT_PATH="$RESOLVED"
  fi
fi
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FETCH_HOME_DEFAULT="${HOME}/.fetch"
BIN_DIR_DEFAULT="$INVOKED_DIR"
FETCH_REPO_SLUG="${FETCH_REPO_SLUG:-Traves-Theberge/Fetch}"

FETCH_HOME="${FETCH_HOME:-$FETCH_HOME_DEFAULT}"
BIN_DIR="${BIN_DIR:-$BIN_DIR_DEFAULT}"
MANIFEST_URL="${FETCH_MANIFEST_URL:-https://raw.githubusercontent.com/${FETCH_REPO_SLUG}/main/release-manifest.json}"

if [[ -n "${FETCH_REPO_DIR:-}" ]]; then
  REPO_DIR="$FETCH_REPO_DIR"
fi

cd "$REPO_DIR"

help_text() {
  cat <<USAGE
Fetch CLI

Usage:
  fetch <command>

Commands:
  up                 Start Fetch services (docker compose up -d --build)
  down               Stop Fetch services
  restart            Restart Fetch services
  status             Show docker compose status
  logs [svc]         Tail logs (optional service name)
  tui                Launch manager TUI

  self doctor        Validate local environment and install
  self update        Update to latest stable release from manifest
  self update --channel <name>
                     Update from a release channel (stable/beta/nightly)
  self pin <version> Install exact manifest version (example: v0.0.48)
  self version       Show installed version and git commit

  help               Show this help
USAGE
}

need_repo() {
  [[ -f "$REPO_DIR/docker-compose.yml" ]] || {
    echo "[fetch] Not a Fetch repo: $REPO_DIR" >&2
    exit 1
  }
}

run_build() {
  if command -v go >/dev/null 2>&1; then
    chmod +x "$REPO_DIR/scripts/build_manager.sh"
    "$REPO_DIR/scripts/build_manager.sh"
  else
    echo "[fetch] Go not found; skipped manager build"
  fi
}

cmd_up() {
  need_repo
  docker compose up -d --build
}

cmd_down() {
  need_repo
  docker compose down
}

cmd_restart() {
  need_repo
  cmd_down
  cmd_up
}

cmd_status() {
  need_repo
  docker compose ps
}

cmd_logs() {
  need_repo
  if [[ $# -gt 0 ]]; then
    docker compose logs -f "$1"
  else
    docker compose logs -f
  fi
}

cmd_tui() {
  need_repo
  if [[ ! -x "$REPO_DIR/manager/fetch-manager" ]]; then
    echo "[fetch] manager/fetch-manager not found; building first"
    run_build
  fi
  exec "$REPO_DIR/manager/fetch-manager"
}

self_doctor() {
  local missing=0
  echo "[fetch] doctor: checking environment"

  for c in git curl docker tar sha256sum python3; do
    if command -v "$c" >/dev/null 2>&1; then
      echo "  ✅ $c"
    else
      echo "  ❌ $c (missing)"
      missing=1
    fi
  done

  if docker compose version >/dev/null 2>&1; then
    echo "  ✅ docker compose"
  else
    echo "  ❌ docker compose plugin (missing)"
    missing=1
  fi

  if [[ -f "$REPO_DIR/.env" ]]; then
    echo "  ✅ .env"
  else
    echo "  ⚠️  .env missing (copy from .env.example)"
    missing=1
  fi

  if [[ -f "$REPO_DIR/manager/fetch-manager" ]]; then
    echo "  ✅ manager binary"
  else
    echo "  ⚠️  manager binary missing (run: fetch self update)"
    missing=1
  fi

  if [[ $missing -eq 0 ]]; then
    echo "[fetch] doctor: healthy"
    return 0
  fi

  echo "[fetch] doctor: issues found"
  return 1
}

self_update() {
  need_repo
  local channel="stable"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --channel)
        [[ $# -lt 2 ]] && {
          echo "[fetch] --channel requires a value" >&2
          exit 1
        }
        channel="$2"
        shift 2
        ;;
      *)
        echo "[fetch] unknown option for self update: $1" >&2
        exit 1
        ;;
    esac
  done

  echo "[fetch] updating from channel: $channel"
  "$REPO_DIR/scripts/install.sh" \
    --manifest-url "$MANIFEST_URL" \
    --channel "$channel" \
    --home "$FETCH_HOME" \
    --bin-dir "$BIN_DIR" \
    --repo-dir "$REPO_DIR"

  echo "[fetch] update complete"
  self_version
}

self_pin() {
  need_repo
  local version="${1:-}"
  [[ -n "$version" ]] || {
    echo "Usage: fetch self pin <version>" >&2
    exit 1
  }

  echo "[fetch] pinning to version: $version"
  "$REPO_DIR/scripts/install.sh" \
    --manifest-url "$MANIFEST_URL" \
    --version "$version" \
    --home "$FETCH_HOME" \
    --bin-dir "$BIN_DIR" \
    --repo-dir "$REPO_DIR"

  echo "[fetch] pin complete"
  self_version
}

self_version() {
  need_repo
  local version="unknown"
  local commit="unknown"

  if [[ -f "$REPO_DIR/VERSION" ]]; then
    version="$(tr -d '[:space:]' < "$REPO_DIR/VERSION")"
  fi
  if git -C "$REPO_DIR" rev-parse --short HEAD >/dev/null 2>&1; then
    commit="$(git -C "$REPO_DIR" rev-parse --short HEAD)"
  fi

  echo "Fetch version: $version"
  echo "Git commit:   $commit"
  echo "Repo path:    $REPO_DIR"
}

main() {
  local cmd="${1:-help}"
  shift || true

  case "$cmd" in
    up) cmd_up "$@" ;;
    down) cmd_down "$@" ;;
    restart) cmd_restart "$@" ;;
    status) cmd_status "$@" ;;
    logs) cmd_logs "$@" ;;
    tui) cmd_tui "$@" ;;
    self)
      local sub="${1:-}"
      shift || true
      case "$sub" in
        doctor) self_doctor "$@" ;;
        update) self_update "$@" ;;
        pin) self_pin "$@" ;;
        version) self_version "$@" ;;
        *)
          echo "Unknown self command: ${sub:-<empty>}" >&2
          help_text
          exit 1
          ;;
      esac
      ;;
    help|-h|--help) help_text ;;
    *)
      echo "Unknown command: $cmd" >&2
      help_text
      exit 1
      ;;
  esac
}

main "$@"
