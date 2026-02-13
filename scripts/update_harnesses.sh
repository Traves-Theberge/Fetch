#!/bin/bash
set -e

# Fetch Harness Update Script
# Installs/Updates global CLI tools and rebuilds Docker containers

echo "📦 Updating Fetch Harnesses..."

# 1. Install Global NPM Packages
echo "   Installing AI CLI tools..."
PACKAGES="@anthropic-ai/claude-code @google/gemini-cli opencode-ai@latest @openai/codex"

# Check if we have write access to global node_modules
if [ -w "$(npm root -g)" ]; then
    npm install -g $PACKAGES
else
    echo "   Requesting sudo for global package installation..."
    sudo npm install -g $PACKAGES
fi

# 2. Rebuild Docker Containers
# Ensure we are in the correct directory (project root)
# Script is in scripts/, so go up one level
cd "$(dirname "$0")/.."

if command -v docker >/dev/null 2>&1; then
    echo "🐳 Rebuilding Docker containers..."
    # Check if we need sudo for docker
    if docker info >/dev/null 2>&1; then
        docker compose build
    else
        echo "   Requesting sudo for docker build..."
        sudo docker compose build
    fi
else
    echo "⚠️  Docker not found. Skipping container rebuild."
fi

echo "✅ Harnesses updated!"
