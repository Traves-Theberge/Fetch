#!/bin/bash
# Fetch Manager Build Script
# Builds the Go TUI manager for Raspberry Pi

set -e

echo "🐕 Building Fetch Manager..."

cd "$(dirname "$0")"

# Tidy dependencies
go mod tidy

# Build for current platform
echo "Building for current platform..."
go build -o fetch-manager .

# Build for Raspberry Pi (ARM64)
echo "Building for Raspberry Pi (ARM64)..."
GOOS=linux GOARCH=arm64 go build -o fetch-manager-arm64 .

echo "✅ Build complete!"
echo ""
echo "Binaries:"
echo "  - fetch-manager       (current platform)"
echo "  - fetch-manager-arm64 (Raspberry Pi)"
