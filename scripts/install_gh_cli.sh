#!/usr/bin/env bash
# Install GitHub CLI (gh) on the host machine.

set -euo pipefail

log() { printf "[gh-install] %s\n" "$*"; }
fail() { printf "[gh-install] ERROR: %s\n" "$*" >&2; exit 1; }

if command -v gh >/dev/null 2>&1; then
  log "GitHub CLI already installed: $(gh --version | head -n1)"
  exit 0
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  if command -v brew >/dev/null 2>&1; then
    log "Installing gh via Homebrew"
    brew install gh
    exit 0
  fi
  fail "Homebrew not found. Install from https://github.com/cli/cli#installation"
fi

if [[ "$(uname -s)" != "Linux" ]]; then
  fail "Unsupported OS. Install from https://github.com/cli/cli#installation"
fi

if command -v apt-get >/dev/null 2>&1; then
  log "Installing gh via apt (official GitHub CLI repository)"
  sudo mkdir -p -m 755 /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
  sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y gh
  exit 0
fi

if command -v dnf >/dev/null 2>&1; then
  log "Installing gh via dnf"
  sudo dnf install -y gh
  exit 0
fi

if command -v yum >/dev/null 2>&1; then
  log "Installing gh via yum"
  sudo yum install -y gh
  exit 0
fi

if command -v pacman >/dev/null 2>&1; then
  log "Installing gh via pacman"
  sudo pacman -Sy --noconfirm github-cli
  exit 0
fi

if command -v zypper >/dev/null 2>&1; then
  log "Installing gh via zypper"
  sudo zypper --non-interactive install gh
  exit 0
fi

fail "No supported package manager found. Install manually from https://github.com/cli/cli#installation"
