#!/usr/bin/env bash
# Legacy entrypoint wrapper.
# Canonical uninstaller now lives at scripts/uninstall.sh.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${ROOT_DIR}/scripts/uninstall.sh" "$@"
