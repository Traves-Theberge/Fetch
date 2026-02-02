# 🐕 Fetch - Complete Setup & Usage Guide

A step-by-step guide to setting up and using Fetch, your AI-powered WhatsApp coding assistant.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Running the TUI Manager](#running-the-tui-manager)
4. [WhatsApp Authentication](#whatsapp-authentication)
5. [Sending Commands via WhatsApp](#sending-commands-via-whatsapp)
6. [Architecture Overview](#architecture-overview)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Hardware
- **Any Linux machine** (ARM64 or x86_64)
- Internet connection

### Software
Before starting, ensure you have:

| Software | Version | Check Command |
|----------|---------|---------------|
| Docker | 24.0+ | `docker --version` |
| Docker Compose | v2.0+ | `docker compose version` |
| Go | 1.21+ | `go version` |
| Git | 2.0+ | `git --version` |

### CLI Authentication (on your Host machine)

Fetch uses AI CLIs that need to be authenticated **before** starting:

```bash
# GitHub Copilot (REQUIRED if ENABLE_COPILOT=true)
gh auth login
gh extension install github/gh-copilot

# Claude Code (optional)
npm install -g @anthropic-ai/claude-code
claude  # Follow browser login

# Gemini CLI (optional)  
npm install -g @google/gemini-cli
gemini  # Follow browser login
```

---

## Initial Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/Traves-Theberge/Fetch.git
cd Fetch
```

### Step 2: Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit with your settings
nano .env   # or use your preferred editor
```

**Required Settings in `.env`:**

```dotenv
# Your WhatsApp phone number (country code, no + or spaces)
# Example: 15551234567 for USA +1 (555) 123-4567
OWNER_PHONE_NUMBER=YOUR_PHONE_NUMBER_HERE

# OpenRouter API Key (for agent reasoning)
# Get one at: https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx

# Enable at least one CLI
ENABLE_COPILOT=true
ENABLE_CLAUDE=false
ENABLE_GEMINI=false
```

### Step 3: Build the TUI Manager

```bash
cd manager
go build -o fetch-manager .
cd ..
```

---

## Running the TUI Manager

The Go TUI is your control center for Fetch. It provides a beautiful terminal interface.

### Start the Manager

```bash
cd manager
./fetch-manager
```

### TUI Menu Options

```
┌──────────────────────────────────────────┐
│           🐕 FETCH MANAGER               │
│     Your Faithful Code Companion         │
├──────────────────────────────────────────┤
│  > 📱 Setup WhatsApp                     │
│    🚀 Start Fetch                        │
│    🛑 Stop Fetch                         │
│    ⚙️  Configure                         │
│    📜 View Logs                          │
│    🔄 Update                             │
│    ℹ️  Status                            │
│    ❌ Exit                               │
└──────────────────────────────────────────┘
```

| Option | Description |
|--------|-------------|
| **📱 Setup WhatsApp** | View QR code status and WhatsApp connection |
| **🚀 Start Fetch** | Start Docker containers (Bridge + Kennel) |
| **🛑 Stop Fetch** | Stop all Fetch containers |
| **⚙️ Configure** | Edit `.env` settings |
| **📜 View Logs** | See live logs from the bridge |
| **🔄 Update** | Pull latest code from Git |
| **ℹ️ Status** | Check container health |
| **❌ Exit** | Quit the manager |

### Keyboard Controls

| Key | Action |
|-----|--------|
| `↑`/`k` | Move up |
| `↓`/`j` | Move down |
| `Enter`/`Space` | Select |
| `Esc` | Go back |
| `q` | Quit |
| `r` | Refresh (in logs/status) |

---

## WhatsApp Authentication

### First-Time Setup

1. **Start Fetch from the TUI:**
   - Run `./fetch-manager`
   - Select **🚀 Start Fetch**
   - Wait for containers to build (~2-5 minutes first time)

2. **Get the QR Code:**
   
   **Option A: Using the TUI**
   - Select **📱 Setup WhatsApp**
   - The screen will show connection status
   - If pending, a QR URL will be displayed
   
   **Option B: Using Docker Logs**
   ```bash
   docker logs -f fetch-bridge
   ```
   Look for the QR code in the terminal output.

3. **Scan the QR Code:**
   - Open WhatsApp on your phone
   - Go to **Settings → Linked Devices → Link a Device**
   - Scan the QR code displayed

4. **Verify Connection:**
   - The TUI Setup screen will show: `✅ Authenticated`
   - Or logs will show: `WhatsApp client is ready!`

### Re-Authentication

If your session expires or you need to re-link:

```bash
# Stop Fetch
docker compose down

# Clear WhatsApp auth data
sudo rm -rf ./data/.wwebjs_auth

# Start Fetch again
docker compose up -d

# Scan the new QR code
docker logs -f fetch-bridge
```

---

## Sending Commands via WhatsApp

Once authenticated, message Fetch from **your authorized phone number**.

### Basic Commands

| You Send | Fetch Does |
|----------|------------|
| `status` | Shows system status and uptime |
| `help` | Lists available commands |
| `ping` | Quick connectivity test |

### Coding Tasks

Send natural language requests:

```
Create a Python script that sorts a list of numbers
```

```
Review my code in main.py for potential bugs
```

```
Write unit tests for the UserService class
```

### Agent Modes

Fetch has three autonomy modes:

| Mode | Behavior |
|------|----------|
| **Supervised** | Asks before each action |
| **Semi-Auto** | Asks for dangerous operations only |
| **Autonomous** | Executes full tasks independently |

Change mode by messaging:
```
set mode autonomous
```

### Example Conversation

```
You: Create a hello world script in Python

Fetch: 🤔 Planning task...

I'll create a simple Python hello world script.

📝 Creating file: hello.py
───────────────────────────
print("Hello, World!")
───────────────────────────

✅ Task complete! Created hello.py
```

---

## Architecture Overview

### What's Running

```
┌─────────────────────────────────────────────────────┐
│                    Your Machine                      │
│                                                      │
│  ┌─────────────────┐    ┌─────────────────────────┐ │
│  │  Go TUI Manager │    │    Docker Compose       │ │
│  │  (./fetch-mgr)  │    │  ┌────────┐ ┌────────┐  │ │
│  │                 │───▶│  │ Bridge │ │ Kennel │  │ │
│  │  Control Panel  │    │  │ :8765  │ │ (CLIs) │  │ │
│  └─────────────────┘    │  └────────┘ └────────┘  │ │
│                         └─────────────────────────┘ │
└─────────────────────────────────────────────────────┘
                              │
                              ▼
                         WhatsApp
                              │
                              ▼
                        Your Phone
```

### Containers

| Container | Port | Purpose |
|-----------|------|---------|
| `fetch-bridge` | 8765 | WhatsApp connection + Agent brain |
| `fetch-kennel` | - | CLI execution sandbox |

### Data Locations

| Path | Contents |
|------|----------|
| `./data/.wwebjs_auth/` | WhatsApp session data |
| `./data/tasks.json` | Task history |
| `./workspace/` | Code written by agents |
| `./.env` | Your configuration |

---

## Troubleshooting

### QR Code Not Appearing

```bash
# Check if bridge is running
docker ps | grep fetch-bridge

# View bridge logs
docker logs fetch-bridge --tail 100

# If "Chromium lock" error, clear auth:
docker compose down
sudo rm -rf ./data/.wwebjs_auth
docker compose up -d
```

### WhatsApp Disconnected

```bash
# Restart the bridge
docker compose restart fetch-bridge

# Or full restart
docker compose down && docker compose up -d
```

### "Permission Denied" Errors

```bash
# Fix data directory permissions
sudo chmod -R 777 ./data
```

### Messages Not Being Received

1. Check your phone number in `.env`:
   ```
   OWNER_PHONE_NUMBER=15551234567  # No + or spaces!
   ```

2. Verify container is running:
   ```bash
   docker ps
   ```

3. Check logs for errors:
   ```bash
   docker logs fetch-bridge --tail 50
   ```

### CLI Not Working

```bash
# Check if CLI is enabled in .env
cat .env | grep ENABLE

# Verify authentication on host
gh auth status          # For Copilot
claude --version        # For Claude
gemini --version        # For Gemini
```

### Port Conflicts

If port 8765 is in use:
```bash
# Find what's using it
ss -tlnp | grep 8765

# Or change the port in:
# - fetch-app/src/api/status.ts
# - docker-compose.yml
# - manager/internal/status/client.go
```

---

## Quick Reference

### Essential Commands

```bash
# Start everything
cd Fetch && docker compose up -d

# View logs
docker logs -f fetch-bridge

# Stop everything
docker compose down

# Run the TUI
cd manager && ./fetch-manager

# Rebuild after code changes
docker compose up -d --build
```

### Health Check

```bash
# Check containers
docker ps

# Check status API
curl http://localhost:8765/api/status | jq .

# Check WhatsApp state
curl http://localhost:8765/api/health
```

---

## Support

- **Issues**: Open a GitHub issue
- **Logs**: Always include `docker logs fetch-bridge` output
- **Config**: Never share your `.env` file (contains secrets!)

---

*Fetch - Your Faithful Code Companion* 🐕
