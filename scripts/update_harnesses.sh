#!/usr/bin/env bash
set -euo pipefail

# Backward-compatible wrapper that installs all harnesses.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/manage_harnesses.sh" install all
