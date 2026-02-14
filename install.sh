#!/usr/bin/env bash
# Legacy entrypoint wrapper.
# Canonical installer now lives at scripts/install.sh.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${ROOT_DIR}/scripts/install.sh" "$@"
