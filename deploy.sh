#!/bin/bash
# Fetch - Build and Deploy Script
# Run this to build and start all services

set -e

echo "🐕 Fetch Build & Deploy Script"
echo "==============================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for .env file
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating from template...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}   Please edit .env with your API keys and phone number${NC}"
    echo ""
fi

# Validate required env vars
source .env 2>/dev/null || true

if [ -z "$OWNER_PHONE_NUMBER" ]; then
    echo -e "${RED}❌ OWNER_PHONE_NUMBER not set in .env${NC}"
    echo "   Edit .env and add your WhatsApp phone number"
    exit 1
fi

if [ -z "$OPENROUTER_API_KEY" ]; then
    echo -e "${YELLOW}⚠️  OPENROUTER_API_KEY not set - orchestration will fail${NC}"
fi

echo "📦 Building Docker images..."
docker compose build

echo ""
echo "🚀 Starting services..."
docker compose up -d

echo ""
echo -e "${GREEN}✅ Fetch is starting!${NC}"
echo ""
echo "📱 To authenticate WhatsApp, run:"
echo "   docker logs -f fetch-bridge"
echo ""
echo "🔍 To check status:"
echo "   docker compose ps"
echo ""
echo "🛑 To stop:"
echo "   docker compose down"
