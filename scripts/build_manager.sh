#!/usr/bin/env bash
set -euo pipefail

# Go to manager directory
cd "$(dirname "$0")/../apps/manager"

# Read version from root VERSION file
VERSION=$(cat ../../VERSION)
COMMIT="unknown"
if git rev-parse HEAD >/dev/null 2>&1; then
  COMMIT=$(git rev-parse HEAD)
elif [[ -f ../../.fetch-install-meta ]]; then
  META_COMMIT="$(awk -F= '/^INSTALL_GIT_REF=/{print $2; exit}' ../../.fetch-install-meta | tr -d '[:space:]')"
  if [[ -n "${META_COMMIT}" ]]; then
    COMMIT="${META_COMMIT}"
  fi
fi
DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "🏗️  Building Fetch Manager ${VERSION}..."

# Build with ldflags
go build -ldflags "-X github.com/fetch/manager/internal/components.version=${VERSION} -X github.com/fetch/manager/internal/components.gitCommit=${COMMIT} -X github.com/fetch/manager/internal/components.buildDate=${DATE}" -o fetch-manager .

echo "✅ Build complete: apps/manager/fetch-manager"
