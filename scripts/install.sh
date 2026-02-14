#!/usr/bin/env bash
# Fetch bootstrap installer (channel/version aware with checksum verification)

set -euo pipefail

FETCH_REPO_SLUG="${FETCH_REPO_SLUG:-Traves-Theberge/Fetch}"
DEFAULT_MANIFEST_URL="https://raw.githubusercontent.com/${FETCH_REPO_SLUG}/main/release-manifest.json"
DEFAULT_CHANNEL="stable"
DEFAULT_FETCH_HOME="${HOME}/.fetch"
DEFAULT_BIN_DIR="${HOME}/.local/bin"

MANIFEST_URL="${FETCH_MANIFEST_URL:-$DEFAULT_MANIFEST_URL}"
CHANNEL="$DEFAULT_CHANNEL"
VERSION=""
REF=""
FETCH_HOME="${FETCH_HOME:-$DEFAULT_FETCH_HOME}"
BIN_DIR="${BIN_DIR:-$DEFAULT_BIN_DIR}"
REPO_DIR="${REPO_DIR:-}"
SKIP_BUILD=0
WITH_HARNESS_UPDATE=0
ACTIVATED_BACKUP_DIR=""
NEW_INSTALL_ACTIVATED=0
PATH_UPDATED=0
PATH_UPDATE_NOTE=""

usage() {
  cat <<USAGE
Usage: scripts/install.sh [options]

Options:
  --channel <name>        Release channel (default: stable)
  --version <vX.Y.Z>      Install exact version from manifest
  --manifest-url <url>    Override manifest URL
  --ref <git-ref>         Developer mode: install from git ref (skips checksum path)
  --home <path>           Install home (default: ~/.fetch)
  --bin-dir <path>        Binary link directory (default: ~/.local/bin)
  --repo-dir <path>       Override repo path (default: <home>/repo)
  --skip-build            Skip manager build
  --with-harness-update   Run scripts/update_harnesses.sh after install
  -h, --help              Show help
USAGE
}

log() { printf "[fetch-installer] %s\n" "$*"; }
fail() { printf "[fetch-installer] ERROR: %s\n" "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

append_line_if_missing() {
  local file="$1"
  local line="$2"
  local match="$3"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  if grep -Fq "$match" "$file"; then
    return 0
  fi
  printf "\n%s\n" "$line" >> "$file"
  return 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel)
      [[ $# -lt 2 ]] && fail "--channel requires a value"
      CHANNEL="$2"
      shift 2
      ;;
    --version)
      [[ $# -lt 2 ]] && fail "--version requires a value"
      VERSION="$2"
      shift 2
      ;;
    --manifest-url)
      [[ $# -lt 2 ]] && fail "--manifest-url requires a value"
      MANIFEST_URL="$2"
      shift 2
      ;;
    --ref)
      [[ $# -lt 2 ]] && fail "--ref requires a value"
      REF="$2"
      shift 2
      ;;
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
    --repo-dir)
      [[ $# -lt 2 ]] && fail "--repo-dir requires a value"
      REPO_DIR="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --with-harness-update)
      WITH_HARNESS_UPDATE=1
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

if [[ ${EUID:-0} -eq 0 ]]; then
  fail "Run as a normal user. Do not run this installer with sudo/root."
fi

if [[ -z "$REPO_DIR" ]]; then
  REPO_DIR="$FETCH_HOME/repo"
fi

mkdir -p "$FETCH_HOME" "$BIN_DIR"

require_cmd curl
require_cmd tar
require_cmd sha256sum

resolve_from_manifest() {
  local manifest_file="$1"
  python3 - "$manifest_file" "$CHANNEL" "$VERSION" <<'PY'
import json
import sys

manifest_path = sys.argv[1]
channel_arg = sys.argv[2]
version_arg = sys.argv[3]

with open(manifest_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

channel = channel_arg or data.get('defaultChannel', 'stable')
channels = data.get('channels', {})
releases = data.get('releases', {})

if version_arg:
    version = version_arg
else:
    if channel not in channels:
        raise SystemExit(f"Channel not found in manifest: {channel}")
    version = channels[channel]

if version not in releases:
    raise SystemExit(f"Version not found in manifest releases: {version}")

entry = releases[version]
archive = entry.get('archive', {})
url = archive.get('url', '')
sha = archive.get('sha256', '')
git_ref = entry.get('gitRef', '')

if not url:
    raise SystemExit(f"Missing archive.url for {version}")
if not sha:
    raise SystemExit(f"Missing archive.sha256 for {version}")

print(f"VERSION={version}")
print(f"GIT_REF={git_ref}")
print(f"ARCHIVE_URL={url}")
print(f"ARCHIVE_SHA256={sha}")
PY
}

install_from_archive() {
  local version="$1"
  local archive_url="$2"
  local archive_sha="$3"

  local tmp_dir archive_file stage_dir extracted_top backup_dir
  tmp_dir="$(mktemp -d)"
  archive_file="$tmp_dir/fetch-release.tar.gz"
  stage_dir="$tmp_dir/repo"

  log "Downloading release archive: $archive_url"
  curl -fsSL "$archive_url" -o "$archive_file"

  log "Verifying archive checksum"
  local actual
  actual="$(sha256sum "$archive_file" | awk '{print $1}')"
  if [[ "$actual" != "$archive_sha" ]]; then
    fail "Checksum mismatch for release archive (expected $archive_sha, got $actual)"
  fi

  mkdir -p "$stage_dir"
  tar -xzf "$archive_file" -C "$tmp_dir"

  extracted_top="$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d ! -name repo | head -n1)"
  [[ -n "$extracted_top" ]] || fail "Failed to locate extracted release directory"

  rm -rf "$stage_dir"
  mv "$extracted_top" "$stage_dir"

  for p in .env data workspace config; do
    if [[ -e "$REPO_DIR/$p" ]]; then
      if ! cp -a "$REPO_DIR/$p" "$stage_dir/" 2>/dev/null; then
        log "Warning: could not preserve '$p' from existing install (continuing)"
      fi
    fi
  done

  if [[ ! -f "$stage_dir/.env" && -f "$stage_dir/.env.example" ]]; then
    cp "$stage_dir/.env.example" "$stage_dir/.env"
  fi

  backup_dir=""
  if [[ -d "$REPO_DIR" ]]; then
    backup_dir="${REPO_DIR}.bak.$(date +%s)"
    mv "$REPO_DIR" "$backup_dir"
  fi

  if ! mv "$stage_dir" "$REPO_DIR"; then
    if [[ -n "$backup_dir" && -d "$backup_dir" ]]; then
      mv "$backup_dir" "$REPO_DIR" || true
    fi
    fail "Failed to activate new release"
  fi

  if [[ -n "$backup_dir" && -d "$backup_dir" ]]; then
    ACTIVATED_BACKUP_DIR="$backup_dir"
  fi
  NEW_INSTALL_ACTIVATED=1
  rm -rf "$tmp_dir"
  log "Installed Fetch $version"
}

install_from_git_ref() {
  local ref="$1"
  require_cmd git

  if [[ -d "$REPO_DIR/.git" ]]; then
    log "Updating existing git checkout ($ref)"
    git -C "$REPO_DIR" fetch --tags origin
    git -C "$REPO_DIR" checkout "$ref"
    git -C "$REPO_DIR" pull --ff-only origin "$ref" || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    log "Cloning repository"
    git clone "https://github.com/${FETCH_REPO_SLUG}.git" "$REPO_DIR"
    git -C "$REPO_DIR" checkout "$ref"
  fi

  if [[ ! -f "$REPO_DIR/.env" && -f "$REPO_DIR/.env.example" ]]; then
    cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
  fi
}

if [[ -n "$REF" ]]; then
  log "Developer mode install from git ref: $REF"
  install_from_git_ref "$REF"
else
  require_cmd python3
  manifest_file="$(mktemp)"
  trap 'rm -f "$manifest_file"' EXIT

  log "Fetching release manifest: $MANIFEST_URL"
  curl -fsSL "$MANIFEST_URL" -o "$manifest_file"

  eval "$(resolve_from_manifest "$manifest_file")"
  install_from_archive "$VERSION" "$ARCHIVE_URL" "$ARCHIVE_SHA256"
  rm -f "$manifest_file"
  trap - EXIT
fi

post_install_steps() {
  mkdir -p "$REPO_DIR/data" "$REPO_DIR/workspace" "$REPO_DIR/config/github" "$REPO_DIR/config/claude"

  if [[ "$SKIP_BUILD" -eq 0 ]]; then
    if command -v go >/dev/null 2>&1; then
      log "Building manager binary"
      chmod +x "$REPO_DIR/scripts/build_manager.sh"
      (cd "$REPO_DIR" && ./scripts/build_manager.sh)
    else
      log "Go not found; skipped manager build"
    fi
  fi

  if [[ "$WITH_HARNESS_UPDATE" -eq 1 && -x "$REPO_DIR/scripts/update_harnesses.sh" ]]; then
    log "Updating harness dependencies"
    (cd "$REPO_DIR" && ./scripts/update_harnesses.sh)
  fi

  local cli_src="$REPO_DIR/scripts/fetch-cli.sh"
  if [[ ! -f "$cli_src" && -f "$REPO_DIR/fetch-cli.sh" ]]; then
    cli_src="$REPO_DIR/fetch-cli.sh"
  fi

  if [[ ! -f "$cli_src" ]]; then
    log "Missing Fetch CLI script in installed release."
    log "Expected '$REPO_DIR/scripts/fetch-cli.sh' (or legacy '$REPO_DIR/fetch-cli.sh')."
    return 1
  fi

  chmod +x "$cli_src" || return 1
  ln -sf "$cli_src" "$BIN_DIR/fetch" || return 1
  [[ -L "$BIN_DIR/fetch" ]] || return 1
  [[ -e "$BIN_DIR/fetch" ]] || return 1

  "$BIN_DIR/fetch" help >/dev/null 2>&1 || return 1
}

rollback_if_needed() {
  if [[ "$NEW_INSTALL_ACTIVATED" -ne 1 ]]; then
    return 0
  fi
  if [[ -z "$ACTIVATED_BACKUP_DIR" || ! -d "$ACTIVATED_BACKUP_DIR" ]]; then
    return 0
  fi

  log "Post-install step failed; restoring previous installation"
  local failed_dir
  failed_dir="${REPO_DIR}.failed.$(date +%s)"
  if [[ -d "$REPO_DIR" ]]; then
    mv "$REPO_DIR" "$failed_dir" || true
  fi
  mv "$ACTIVATED_BACKUP_DIR" "$REPO_DIR"
  log "Rollback complete"
}

set +e
post_install_steps
POST_INSTALL_RC=$?
set -e
if [[ "$POST_INSTALL_RC" -ne 0 ]]; then
  rollback_if_needed
  fail "Install failed during post-install steps"
fi

if [[ -n "$ACTIVATED_BACKUP_DIR" && -d "$ACTIVATED_BACKUP_DIR" ]]; then
  if ! rm -rf "$ACTIVATED_BACKUP_DIR"; then
    log "Warning: failed to remove backup directory '$ACTIVATED_BACKUP_DIR' (permission issue)."
    log "You can remove it manually later with: sudo rm -rf '$ACTIVATED_BACKUP_DIR'"
  fi
fi

installed_version="unknown"
if [[ -f "$REPO_DIR/VERSION" ]]; then
  installed_version="$(tr -d '[:space:]' < "$REPO_DIR/VERSION")"
fi

path_has_bin=0
case ":${PATH:-}:" in
  *":$BIN_DIR:"*) path_has_bin=1 ;;
esac

if [[ "$path_has_bin" -ne 1 ]]; then
  if [[ -n "${BASH_VERSION:-}" || "${SHELL:-}" == *"bash" ]]; then
    append_line_if_missing "$HOME/.bashrc" "export PATH=\"$BIN_DIR:\$PATH\"" "$BIN_DIR"
    PATH_UPDATED=1
    PATH_UPDATE_NOTE="Updated ~/.bashrc"
  elif [[ -n "${ZSH_VERSION:-}" || "${SHELL:-}" == *"zsh" ]]; then
    append_line_if_missing "$HOME/.zshrc" "export PATH=\"$BIN_DIR:\$PATH\"" "$BIN_DIR"
    PATH_UPDATED=1
    PATH_UPDATE_NOTE="Updated ~/.zshrc"
  elif [[ "${SHELL:-}" == *"fish" ]]; then
    append_line_if_missing "$HOME/.config/fish/config.fish" "fish_add_path $BIN_DIR" "$BIN_DIR"
    PATH_UPDATED=1
    PATH_UPDATE_NOTE="Updated ~/.config/fish/config.fish"
  else
    # Best-effort fallback for unknown shells.
    append_line_if_missing "$HOME/.profile" "export PATH=\"$BIN_DIR:\$PATH\"" "$BIN_DIR"
    PATH_UPDATED=1
    PATH_UPDATE_NOTE="Updated ~/.profile"
  fi
fi

cat <<NEXT

[fetch-installer] Installation complete.
  Repo:    $REPO_DIR
  Version: $installed_version
  CLI:     $BIN_DIR/fetch

Next:
  1) Configure: $REPO_DIR/.env
  2) Validate:  fetch self doctor
  3) Start:     fetch up
  4) TUI:       fetch tui
NEXT

if [[ "$path_has_bin" -ne 1 ]]; then
  if [[ "$PATH_UPDATED" -eq 1 ]]; then
    cat <<PATH_UPDATED_HELP

[fetch-installer] $PATH_UPDATE_NOTE with '$BIN_DIR'.
Open a new shell (or run the command below) before using 'fetch':
  export PATH="$BIN_DIR:\$PATH"
PATH_UPDATED_HELP
  else
    cat <<PATH_HELP

[fetch-installer] '$BIN_DIR' is not on your current PATH.
Add it once, then open a new shell:

  bash: echo 'export PATH="$BIN_DIR:\$PATH"' >> ~/.bashrc
  zsh:  echo 'export PATH="$BIN_DIR:\$PATH"' >> ~/.zshrc
  fish: fish_add_path $BIN_DIR

Or for this shell only:
  export PATH="$BIN_DIR:\$PATH"
PATH_HELP
  fi
fi
