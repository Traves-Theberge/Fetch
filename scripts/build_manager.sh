#!/bin/bash
set -e

# Go to manager directory
cd "$(dirname "$0")/../manager"

# Read version from root VERSION file
VERSION=$(cat ../VERSION)
COMMIT=$(git rev-parse HEAD)
DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "🏗️  Building Fetch Manager ${VERSION}..."

# Build with ldflags
go build -ldflags "-X github.com/fetch/manager/internal/components.version=${VERSION} -X github.com/fetch/manager/internal/components.gitCommit=${COMMIT} -X github.com/fetch/manager/internal/components.buildDate=${DATE}" -o fetch-manager .

echo "✅ Build complete: manager/fetch-manager"
