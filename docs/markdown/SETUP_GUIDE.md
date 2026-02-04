# 🐕 Fetch - Complete Setup & Usage Guide

A step-by-step guide to setting up and using Fetch, your AI-powered WhatsApp coding assistant.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Running the TUI Manager](#running-the-tui-manager)
4. [WhatsApp Authentication](#whatsapp-authentication)
5. [Using Fetch via WhatsApp](#using-fetch-via-whatsapp)
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
nano .env
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

The TUI features a horizontal layout with the ASCII dog mascot on the left and menu on the right:

| Option | Description |
|--------|-------------|
| **🔧 Setup** | First-time configuration wizard |
| **▶️ Start** | Launch Bridge & Kennel containers |
| **⏹️ Stop** | Stop all running services |
| **⚙️ Configure** | Edit `.env` settings |
| **🤖 Select Model** | Choose AI model from OpenRouter |
| **📜 Logs** | View container logs |
| **📚 Documentation** | Open docs in browser |
| **ℹ️ Version** | Neofetch-style system information |
| **🚪 Exit** | Quit the manager |

### Keyboard Controls

| Key | Action |
|-----|--------|
| `↑`/`k` | Move up |
| `↓`/`j` | Move down |
| `Enter`/`Space` | Select |
| `Esc` | Go back |
| `q` | Quit |
| `v` | Version screen (neofetch style) |
| `r` | Refresh (in logs) |
| `o` | Open in browser (QR screen) |
| `Tab` | Toggle view (model selector) |

---

## Selecting an AI Model

The TUI includes a model selector that fetches available models from OpenRouter.

### Using the Model Selector

1. Select **🤖 Select Model** from the main menu
2. Wait for models to load from OpenRouter API
3. Use `↑`/`↓` to navigate models
4. Press `Tab` to toggle between **recommended** and **all** models
5. Press `Enter` to select a model
6. **Restart Fetch** to apply the new model

### Recommended Models

| Model | Provider | Best For |
|-------|----------|----------|
| `openai/gpt-4o-mini` | OpenAI | Fast, affordable, good reasoning |
| `openai/gpt-4o` | OpenAI | Best overall quality |
| `anthropic/claude-3-5-sonnet` | Anthropic | Excellent coding |
| `anthropic/claude-3-5-haiku` | Anthropic | Fast, affordable |
| `google/gemini-2.0-flash-exp:free` | Google | Free tier available |
| `deepseek/deepseek-chat` | DeepSeek | Very affordable |

### Manual Configuration

You can also set the model in `.env`:

```dotenv
AGENT_MODEL=openai/gpt-4o-mini
```

---

## WhatsApp Authentication

### First-Time Setup

1. **Start Fetch from the TUI:**
   - Run `./fetch-manager`
   - Select **🚀 Start Fetch**
   - Wait for containers to build (~2-5 minutes first time)

2. **Get the QR Code:**
   - Select **📱 Setup WhatsApp**
   - The screen will display the QR code as ASCII art
   - Press `o` to open the QR URL in your browser

3. **Scan the QR Code:**
   - Open WhatsApp on your phone
   - Go to **Settings → Linked Devices → Link a Device**
   - Scan the QR code

4. **Verify Connection:**
   - The TUI will show: `✅ Authenticated`
   - Or logs will show: `WhatsApp client is ready!`

### Re-Authentication

If your session expires:

```bash
# Stop Fetch
docker compose down

# Clear WhatsApp auth data
sudo rm -rf ./data/.wwebjs_auth

# Start Fetch again
docker compose up -d

# Check the TUI for new QR code
./manager/fetch-manager
```

---

## Using Fetch via WhatsApp

### The @fetch Trigger

**All messages must start with `@fetch`** (case-insensitive):

```
@fetch list projects
@Fetch build a login form
@FETCH what's the status?
```

Messages without `@fetch` are silently ignored for security.

### V2 Intent System

Fetch uses a 3-intent classification system:

| Intent | Description | Example |
|--------|-------------|---------|
| 💬 **Conversation** | Greetings, thanks, chat | `@fetch Hello!` |
| 📁 **Workspace** | Project management | `@fetch list projects` |
| 🚀 **Task** | Complex coding work | `@fetch Build a REST API` |

### Built-in Commands

| Command | Description |
|---------|-------------|
| `@fetch help` | Show available commands |
| `@fetch status` | System status and uptime |
| `@fetch ping` | Quick connectivity test |
| `@fetch list projects` | List available workspaces |
| `@fetch switch to <name>` | Change active workspace |

### Coding Tasks

Tasks are delegated to AI harnesses (Claude, Gemini, or Copilot CLI):

```
@fetch Create a Python script that sorts a list of numbers
```

```
@fetch Review my code in main.py for potential bugs
```

```
@fetch Write unit tests for the UserService class
```

---

## Architecture Overview

<!-- DIAGRAM:architecture -->

### Containers

| Container | Port | Purpose |
|-----------|------|---------|
| `fetch-bridge` | 8765 | WhatsApp connection + Agent + API |
| `fetch-kennel` | — | CLI execution sandbox |

### Data Locations

| Path | Contents |
|------|----------|
| `./data/.wwebjs_auth/` | WhatsApp session |
| `./data/sessions.json` | Agent sessions |
| `./workspace/` | Code written by agents |
| `./.env` | Your configuration |

---

## Security Architecture

Fetch implements a 5-layer security pipeline to protect your system:

<!-- DIAGRAM:security -->

### Security Layers Explained

| Layer | Purpose |
|-------|---------|
| **Owner Verification** | Only your phone number can interact |
| **Trigger Required** | Messages must start with `@fetch` |
| **Safe Patterns** | Commands checked against allowed patterns |
| **Blocked Patterns** | Dangerous operations rejected |
| **Docker Isolation** | CLI runs in sandboxed container |

### What's Protected

- ❌ **No access** to host system files
- ❌ **No access** to secrets outside `.env`
- ❌ **No network** operations from kennel
- ❌ **No sudo** or elevated privileges
- ✅ **Limited** to `/workspace` directory

---

## Troubleshooting

### QR Code Not Appearing

```bash
# Check if bridge is running
docker ps | grep fetch-bridge

# View logs
docker logs fetch-bridge --tail 100

# If "Chromium lock" error:
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
sudo chown -R $USER:$USER ./data
```

### Messages Not Being Received

1. Ensure messages start with `@fetch`
2. Check your phone number in `.env`:
   ```
   OWNER_PHONE_NUMBER=15551234567  # No + or spaces!
   ```
3. Verify container is running:
   ```bash
   docker ps
   ```
4. Check logs for errors:
   ```bash
   docker logs fetch-bridge --tail 50
   ```

### Port 8765 Conflicts

```bash
# Find what's using it
ss -tlnp | grep 8765

# Kill the process or change the port in docker-compose.yml
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

# Rebuild after changes
docker compose up -d --build

# Access documentation
open http://localhost:8765/docs
```

### Health Check

```bash
# Check containers
docker ps

# Check status API
curl http://localhost:8765/status

# Check documentation
curl http://localhost:8765/docs
```

---

## Docker Development Workflow

A guide for developing and reloading Fetch after making code changes.

### Development Architecture

```
┌─────────────────────────────────────────────────┐
│                   Host Machine                   │
├─────────────────────────────────────────────────┤
│  fetch-app/src/        ← Your code changes      │
│  manager/              ← TUI code (Go)          │
│  workspace/            ← Mounted to container   │
│  data/                 ← Persistent sessions    │
└─────────────────────────────────────────────────┘
                          │
                          ▼ docker compose up --build
┌─────────────────────────────────────────────────┐
│              Docker Containers                   │
├─────────────────────────────────────────────────┤
│  fetch-bridge          ← Agent + WhatsApp       │
│  fetch-kennel          ← CLI sandbox            │
└─────────────────────────────────────────────────┘
```

### Development Workflow

#### Step 1: Make Code Changes

Edit files in your editor:

```bash
# Agent/WhatsApp code
code fetch-app/src/

# TUI code
code manager/

# Documentation
code docs/
```

#### Step 2: Rebuild Containers

After changing **TypeScript** code in `fetch-app/`:

```bash
# Rebuild and restart (preserves WhatsApp session)
docker compose up -d --build

# Or rebuild a specific container
docker compose up -d --build fetch-bridge
```

#### Step 3: Verify the Build

```bash
# Watch the build logs
docker compose logs -f --tail 50

# Check container status
docker ps

# Test the status endpoint
curl http://localhost:8765/status
```

### Quick Reload Commands

| Task | Command |
|------|---------|
| Rebuild after TS changes | `docker compose up -d --build` |
| Rebuild bridge only | `docker compose up -d --build fetch-bridge` |
| View live logs | `docker compose logs -f` |
| Restart without rebuild | `docker compose restart` |
| Full reset (⚠️ clears auth) | `docker compose down && docker compose up -d --build` |
| Soft restart (keeps auth) | `docker compose restart fetch-bridge` |

### Hot Reload for TUI (Go)

The TUI runs on your host, not in Docker:

```bash
cd manager

# Rebuild after changes
go build -o fetch-manager .

# Or use air for hot reload
go install github.com/cosmtrek/air@latest
air  # Auto-rebuilds on file changes
```

### Preserving WhatsApp Session

Your WhatsApp session is stored in `./data/.wwebjs_auth/`. To preserve it:

```bash
# ✅ GOOD: Rebuild without losing session
docker compose up -d --build

# ✅ GOOD: Restart without losing session
docker compose restart

# ⚠️ CAUTION: This clears session
docker compose down -v
rm -rf ./data/.wwebjs_auth/
```

### Troubleshooting Development Issues

#### "Chromium Lock" Error

Chrome profile is locked from a previous session:

```bash
# Clear stale lock files
sudo rm -rf ./data/.wwebjs_auth/session/SingletonLock

# Or fresh start (requires re-scanning QR)
rm -rf ./data/.wwebjs_auth
docker compose up -d --build
```

#### Changes Not Appearing

```bash
# Force rebuild with no cache
docker compose build --no-cache
docker compose up -d
```

#### TypeScript Compilation Errors

```bash
# Check build logs
docker compose logs fetch-bridge | grep -i error

# Or build locally first
cd fetch-app
npm run build
```

### Development Environment Tips

1. **Use two terminals:**
   - Terminal 1: `docker compose logs -f` (watch logs)
   - Terminal 2: Edit code, rebuild

2. **Add console.log for debugging:**
   ```typescript
   console.log('[DEBUG]', variable);
   ```
   Then rebuild and watch logs.

3. **Test changes quickly:**
   ```bash
   # One-liner rebuild and follow logs
   docker compose up -d --build && docker compose logs -f
   ```

4. **Use the TUI for common operations:**
   ```bash
   cd manager && ./fetch-manager
   # Use Start/Stop/Logs from the menu
   ```

---

*Fetch - Your Faithful Code Companion* 🐕
