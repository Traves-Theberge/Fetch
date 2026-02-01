#!/bin/bash
# Fetch - Development Setup Script
# Sets up the development environment locally

set -e

echo "🐕 Fetch Development Setup"
echo "=========================="
echo ""

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ required. Current: $(node -v 2>/dev/null || echo 'not installed')"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# Check Go version
GO_VERSION=$(go version 2>/dev/null | grep -oP 'go\d+\.\d+' | cut -d'o' -f2)
if [ -z "$GO_VERSION" ]; then
    echo "⚠️  Go not installed (optional - needed for Manager TUI)"
else
    echo "✅ Go $GO_VERSION"
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not installed"
    exit 1
fi
echo "✅ Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"

# Setup fetch-app
echo ""
echo "📦 Installing fetch-app dependencies..."
cd fetch-app
npm install
echo "✅ fetch-app dependencies installed"

# Build TypeScript
echo ""
echo "🔨 Building TypeScript..."
npm run build
echo "✅ TypeScript compiled"

# Setup manager (if Go is available)
cd ../manager
if command -v go &> /dev/null; then
    echo ""
    echo "📦 Installing Go dependencies..."
    go mod tidy
    echo "✅ Go dependencies installed"
    
    echo ""
    echo "🔨 Building Manager..."
    go build -o fetch-manager .
    echo "✅ Manager built"
fi

cd ..

# Create directories
echo ""
echo "📁 Creating directories..."
mkdir -p data workspace config/github config/claude
echo "✅ Directories created"

# Copy env template if needed
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "✅ Created .env from template"
fi

echo ""
echo "🎉 Development setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your API keys and phone number"
echo "  2. Run: docker compose up -d"
echo "  3. Scan QR code: docker logs -f fetch-bridge"
echo ""
echo "For local development:"
echo "  cd fetch-app && npm run dev"
echo ""
echo "For Manager TUI:"
echo "  cd manager && ./fetch-manager"
