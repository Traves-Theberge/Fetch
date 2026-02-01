#!/bin/bash
# Fetch Manager Build Script
# Builds the Go TUI manager for multiple platforms

set -e

echo "🐕 Building Fetch Manager..."

cd "$(dirname "$0")"

# Tidy dependencies
go mod tidy

# Build for current platform
echo "Building for current platform..."
go build -o fetch-manager .

# Build for ARM64 (Linux)
echo "Building for Linux ARM64..."
GOOS=linux GOARCH=arm64 go build -o fetch-manager-arm64 .

echo "✅ Build complete!"
echo ""
echo "Binaries:"
echo "  - fetch-manager       (current platform)"
echo "  - fetch-manager-arm64 (Linux ARM64)"
