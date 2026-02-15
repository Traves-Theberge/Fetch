#!/usr/bin/env bash
# Install host prerequisites for Fetch.

set -euo pipefail

log() { printf "[fetch-prereqs] %s\n" "$*"; }
fail() { printf "[fetch-prereqs] ERROR: %s\n" "$*" >&2; exit 1; }

if [[ "$(uname -s)" != "Linux" ]]; then
  fail "Automatic prerequisite install currently supports Linux only."
fi

install_apt() {
  log "Installing prerequisites via apt"
  sudo apt-get update
  sudo apt-get install -y \
    git curl ca-certificates gnupg lsb-release tar python3 python3-pip \
    nodejs npm golang-go docker.io docker-compose-plugin
  sudo systemctl enable --now docker || true
}

install_dnf() {
  log "Installing prerequisites via dnf"
  sudo dnf install -y \
    git curl ca-certificates gnupg2 tar python3 python3-pip \
    nodejs npm golang docker docker-compose-plugin
  sudo systemctl enable --now docker || true
}

install_yum() {
  log "Installing prerequisites via yum"
  sudo yum install -y \
    git curl ca-certificates gnupg2 tar python3 python3-pip \
    nodejs npm golang docker
  sudo systemctl enable --now docker || true
}

install_pacman() {
  log "Installing prerequisites via pacman"
  sudo pacman -Sy --noconfirm \
    git curl ca-certificates gnupg tar python python-pip \
    nodejs npm go docker docker-compose
  sudo systemctl enable --now docker || true
}

install_zypper() {
  log "Installing prerequisites via zypper"
  sudo zypper --non-interactive install \
    git curl ca-certificates gpg2 tar python3 python3-pip \
    nodejs npm go docker docker-compose
  sudo systemctl enable --now docker || true
}

main() {
  if command -v apt-get >/dev/null 2>&1; then
    install_apt
  elif command -v dnf >/dev/null 2>&1; then
    install_dnf
  elif command -v yum >/dev/null 2>&1; then
    install_yum
  elif command -v pacman >/dev/null 2>&1; then
    install_pacman
  elif command -v zypper >/dev/null 2>&1; then
    install_zypper
  else
    fail "Unsupported package manager. Install prerequisites manually."
  fi

  if groups "$USER" | grep -q '\bdocker\b'; then
    log "User already in docker group"
  else
    sudo usermod -aG docker "$USER" || true
    log "Added $USER to docker group (open a new shell or run: newgrp docker)"
  fi

  log "Prerequisite installation complete"
}

main "$@"
