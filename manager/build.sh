#!/bin/bash
# Fetch Manager Build Script
# Builds the Go TUI manager for multiple platforms

set -e

echo "🐕 Building Fetch Manager..."

cd "$(dirname "$0")"

# Version info for ldflags injection
VERSION="v4.1.1"
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

LDFLAGS="-s -w"
LDFLAGS="${LDFLAGS} -X 'github.com/fetch/manager/internal/components.version=${VERSION}'"
LDFLAGS="${LDFLAGS} -X 'github.com/fetch/manager/internal/components.buildDate=${BUILD_DATE}'"
LDFLAGS="${LDFLAGS} -X 'github.com/fetch/manager/internal/components.gitCommit=${COMMIT}'"

# Tidy dependencies
go mod tidy

# Build for current platform
echo "Building for current platform..."
go build -ldflags "${LDFLAGS}" -o fetch-manager .

# Build for ARM64 (Linux)
echo "Building for Linux ARM64..."
GOOS=linux GOARCH=arm64 go build -ldflags "${LDFLAGS}" -o fetch-manager-arm64 .

echo "✅ Build complete!"
echo ""
echo "Binaries:"
echo "  - fetch-manager       (current platform)"
echo "  - fetch-manager-arm64 (Linux ARM64)"
