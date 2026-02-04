# 🧪 Fetch Comprehensive Testing Guide

This guide covers testing all features of Fetch including the TUI, WhatsApp commands, and Zero Trust Bonding.

---

## 📋 Pre-Flight Checklist

Before testing, ensure:

- [ ] Docker containers running: `docker compose ps`
- [ ] TUI installed: `which fetch` (should show `/usr/local/bin/fetch`)
- [ ] WhatsApp authenticated (scan QR if needed)
- [ ] `.env` configured with `OWNER_PHONE_NUMBER` and `OPENROUTER_API_KEY`

```bash
# Quick status check
docker compose ps
curl -s http://localhost:8765/status | jq

# Launch TUI (from anywhere!)
fetch
```

---

## 🖥️ Part 1: TUI Manager Tests

### 1.0 Launching the TUI

```bash
# From anywhere in your terminal:
fetch

# Or from the project directory:
cd /path/to/Fetch/manager
./fetch-manager
```

**Expected:** Splash screen (2 seconds) → Main menu with ASCII dog mascot on left, menu on right

### 1.1 Splash Screen Test

| Test | Expected |
|------|----------|
| Launch `fetch` | Splash screen appears with Fetch logo |
| Wait 2 seconds | Auto-transitions to main menu |

### 1.2 Menu Navigation

| Test | Action | Expected |
|------|--------|----------|
| Navigate down | `↓` or `j` | Cursor moves to next item |
| Navigate up | `↑` or `k` | Cursor moves to previous item |
| Select item | `Enter` or `Space` | Opens selected screen |
| Go back | `Esc` | Returns to previous screen |
| Quick quit | `q` | Exits TUI immediately |
| Version info | `v` (from menu) | Shows neofetch-style info |

### 1.3 Menu Items Test Matrix

| # | Menu Item | Key Test | Expected Result |
|---|-----------|----------|-----------------|
| 1 | 📱 Setup WhatsApp | Select → View QR | Shows QR code or "Already authenticated" |
| 2 | 🔌 Disconnect WhatsApp | Select → Confirm | Logs out WhatsApp session |
| 3 | 🚀 Start Fetch | Select | Runs `docker compose up -d` |
| 4 | 🛑 Stop Fetch | Select | Runs `docker compose down` |
| 5 | ⚙️ Configure | Select | Opens .env editor |
| 6 | 🤖 Select Model | Select | Opens OpenRouter model picker |
| 7 | 📜 View Logs | Select | Shows scrollable container logs |
| 8 | 📚 Documentation | Select | Opens docs URL in browser |
| 9 | ℹ️ Version | Select | Shows version/system info |
| 10 | ❌ Exit | Select | Quits TUI |

---

### 1.4 ⚙️ Configure Screen Tests

**Open:** Main Menu → "⚙️ Configure"

| Test | Action | Expected |
|------|--------|----------|
| View fields | Open screen | Shows all config fields |
| Navigate | `↑`/`↓` | Moves between fields |
| Edit field | `Enter` or `e` | Cursor appears in field |
| Type value | Type text | Characters appear |
| Confirm edit | `Enter` | Value saved to field |
| Cancel edit | `Esc` | Reverts to previous value |
| Save to file | `s` | "✅ Configuration saved!" message |
| Exit | `Esc` (not editing) | Returns to menu |

**Fields to Test:**

| Field | Test Value | Notes |
|-------|------------|-------|
| Owner Phone | `15551234567` | Your WhatsApp number |
| Trusted Numbers | `15559876543,15551112222` | Comma-separated |
| OpenRouter Key | `sk-or-v1-xxx` | Shows as dots (masked) |
| Anthropic Key | `sk-ant-xxx` | Shows as dots (masked) |
| Gemini Key | `xxx` | Shows as dots (masked) |
| Log Level | `debug` | Options: debug, info, warn, error |

**Test Sequence:**
```
1. Open Configure
2. Navigate to "Log Level"
3. Press Enter to edit
4. Type "debug"
5. Press Enter to confirm
6. Press 's' to save
7. Verify "✅ Configuration saved!" appears
8. Press Esc to return to menu
```

---

### 1.5 🤖 Model Selector Tests

**Open:** Main Menu → "🤖 Select Model"

| Test | Action | Expected |
|------|--------|----------|
| Load models | Open screen | Models load from OpenRouter API |
| Navigate | `↑`/`↓` | Scrolls through model list |
| Toggle view | `Tab` | Switches between "Recommended" and "All" |
| Search | Type model name | Filters list |
| Select model | `Enter` | Model saved to .env |
| Exit | `Esc` | Returns to menu |

**Recommended Models to Test:**

| Model | Provider |
|-------|----------|
| `openai/gpt-4o-mini` | OpenAI |
| `anthropic/claude-3-5-sonnet` | Anthropic |
| `google/gemini-2.0-flash-exp:free` | Google |

---

### 1.6 📜 Log Viewer Tests

**Open:** Main Menu → "📜 View Logs"

| Test | Action | Expected |
|------|--------|----------|
| View logs | Open screen | Shows container logs |
| Scroll down | `↓` or `j` | Scrolls log viewport |
| Scroll up | `↑` or `k` | Scrolls up |
| Page down | `Page Down` | Jumps down |
| Page up | `Page Up` | Jumps up |
| Refresh | `r` | Reloads latest logs |
| Exit | `Esc` or `q` | Returns to menu |

---

### 1.7 📱 WhatsApp Setup Tests

**Open:** Main Menu → "📱 Setup WhatsApp"

| State | Expected Display |
|-------|-----------------|
| Not authenticated | QR code displayed (ASCII or URL) |
| QR expired | New QR auto-refreshes every 20s |
| Authenticated | "✅ WhatsApp Connected" message |

**Test Sequence:**
```
1. Open "📱 Setup WhatsApp"
2. If QR shown: Scan with WhatsApp → Linked Devices
3. Wait for "authenticated" status
4. Press Esc to return
5. Status bar should show "WhatsApp: Connected"
```

---

### 1.8 ℹ️ Version Screen Tests

**Open:** Main Menu → "ℹ️ Version" or press `v`

| Element | Expected |
|---------|----------|
| Fetch version | Shows current version (e.g., v2.4.3) |
| Go version | Shows Go runtime version |
| OS/Arch | Shows Linux/amd64 or similar |
| Docker status | Shows if Docker is available |
| Container status | Shows Bridge/Kennel running state |

---

### 1.9 Status Bar Tests

The status bar at the bottom should always show:

| Element | Expected |
|---------|----------|
| Left side | Current screen name |
| Center | Key hints (↑↓ Navigate, Enter Select, etc.) |
| Right side | Docker status (🟢 Running / 🔴 Stopped) |

---

### 1.10 Keyboard Shortcuts Summary

| Key | Context | Action |
|-----|---------|--------|
| `↑`/`k` | Everywhere | Navigate up |
| `↓`/`j` | Everywhere | Navigate down |
| `Enter` | Menu | Select item |
| `Enter` | Config | Edit field / Confirm edit |
| `Space` | Menu | Select item |
| `Esc` | Everywhere | Go back / Cancel |
| `q` | Menu | Quit TUI |
| `v` | Menu | Version screen |
| `s` | Config | Save file |
| `r` | Logs | Refresh |
| `Tab` | Models | Toggle view |
| `d` | Whitelist | Delete selected |

---

## 🧪 TUI Test Checklist

Run through this checklist to verify the TUI is working:

### Basic Navigation
- [ ] `fetch` command launches TUI
- [ ] Splash screen appears and transitions
- [ ] Can navigate menu with arrow keys
- [ ] Can select items with Enter
- [ ] Can go back with Esc
- [ ] Can quit with q

### Configuration
- [ ] Configure screen opens
- [ ] Can navigate between fields
- [ ] Can edit field values
- [ ] Masked fields show dots (API keys)
- [ ] Save works (shows confirmation)
- [ ] Changes persist after reopening

### Docker Control
- [ ] "Start Fetch" launches containers
- [ ] "Stop Fetch" stops containers
- [ ] Status bar updates accordingly

### WhatsApp
- [ ] QR code displays when not authenticated
- [ ] QR refreshes automatically
- [ ] Shows "Connected" when authenticated

### Logs
- [ ] Log viewer shows container output
- [ ] Can scroll through logs
- [ ] Refresh loads new logs

### Models
- [ ] Model list loads from OpenRouter
- [ ] Can toggle between Recommended/All
- [ ] Can select and save a model

---

## 🐛 TUI Troubleshooting

### TUI won't start
```bash
# Check if fetch is installed
which fetch

# Rebuild if needed
cd /path/to/Fetch/manager
go build -o fetch-manager .
sudo cp fetch-manager /usr/local/bin/fetch
```

### Terminal display issues
```bash
# Ensure terminal supports 256 colors
echo $TERM  # Should be xterm-256color or similar

# Try different terminal emulator
# (Alacritty, Kitty, iTerm2 work best)
```

### Docker commands fail
```bash
# Check Docker permissions
docker ps

# If permission denied, add user to docker group
sudo usermod -aG docker $USER
# Then logout/login
```

### Config won't save
```bash
# Check .env file permissions
ls -la /path/to/Fetch/.env

# Fix permissions if needed
chmod 644 /path/to/Fetch/.env
```

---

## 📱 Part 2: WhatsApp Command Tests

### 2.1 Basic Connectivity

Send these from your WhatsApp to Fetch:

| Message | Expected Response |
|---------|-------------------|
| `@fetch ping` | Quick response confirming Fetch is alive |
| `@fetch help` | Full command list including Security section |
| `@fetch status` | Session status, current project, task info |

### 2.2 Help Command Verification

Send: `@fetch help` or `@fetch /help`

**Verify these sections appear:**
- [ ] 💬 What I Can Do (Chat, Exploration, Changes, Tasks)
- [ ] 📂 Project Commands
- [ ] 📊 Git Commands
- [ ] 📝 Task Control
- [ ] 📁 Context
- [ ] ⚙️ Settings
- [ ] 🔐 Security (Zero Trust Bonding) ← **NEW**
- [ ] 🔐 Approval Responses

### 2.3 Project Commands

| Command | Expected |
|---------|----------|
| `@fetch /projects` | Lists projects in /workspace |
| `@fetch /project myapp` | Switches to myapp project |
| `@fetch /status` | Shows git status |
| `@fetch /clone https://github.com/user/repo` | Clones repository |
| `@fetch /init newproject` | Creates new project |

### 2.4 🔐 Zero Trust Bonding Commands (NEW)

| Command | Expected |
|---------|----------|
| `@fetch /trust` | Shows trust command help |
| `@fetch /trust list` | Shows all trusted numbers (or "none configured") |
| `@fetch /trust add 15551234567` | Adds number, confirms with ✅ |
| `@fetch /trust add +1 (555) 987-6543` | Normalizes and adds number |
| `@fetch /trust remove 15551234567` | Removes number, confirms with ✅ |
| `@fetch /trust clear` | Removes ALL numbers (dangerous!) |

**Test Sequence:**
```
1. @fetch /trust list          → "No trusted numbers configured"
2. @fetch /trust add 15551234567   → "✅ Added +15551234567"
3. @fetch /trust list          → Shows "1. +15551234567"
4. @fetch /trust add 15559876543   → "✅ Added +15559876543"
5. @fetch /trust list          → Shows both numbers
6. @fetch /trust remove 15551234567 → "✅ Removed +15551234567"
7. @fetch /trust list          → Shows only 15559876543
```

### 2.5 Task Commands

| Command | Expected |
|---------|----------|
| `@fetch /task` | Shows current task status |
| `@fetch /stop` | Cancels current task |
| `@fetch /pause` | Pauses current task |
| `@fetch /resume` | Resumes paused task |

### 2.6 Context Commands

| Command | Expected |
|---------|----------|
| `@fetch /add src/index.ts` | Adds file to context |
| `@fetch /files` | Lists files in context |
| `@fetch /drop src/index.ts` | Removes file from context |
| `@fetch /clear` | Resets conversation |

### 2.7 Git Commands

| Command | Expected |
|---------|----------|
| `@fetch /diff` | Shows uncommitted changes |
| `@fetch /log` | Shows last 5 commits |
| `@fetch /log 10` | Shows last 10 commits |
| `@fetch /undo` | Reverts last change |

### 2.8 Settings Commands

| Command | Expected |
|---------|----------|
| `@fetch /auto` | Toggles autonomous mode |
| `@fetch /mode` | Shows current mode |
| `@fetch /verbose` | Toggles verbose output |

---

## 🤖 Part 3: Natural Language Tests

### 3.1 Intent Classification

Test that Fetch correctly identifies intent:

| Message | Expected Intent | Expected Behavior |
|---------|-----------------|-------------------|
| `@fetch Hey there!` | 💬 Conversation | Direct friendly response |
| `@fetch Thanks!` | 💬 Conversation | You're welcome response |
| `@fetch What projects do I have?` | 📁 Workspace | Lists projects |
| `@fetch Show me the git status` | 📁 Workspace | Shows git status |
| `@fetch Build a login page` | 🚀 Task | Delegates to harness |
| `@fetch Fix the bug in auth.ts` | 🚀 Task | Analyzes and fixes |

### 3.2 Coding Tasks

Try these tasks (require a project selected):

```
@fetch Create a simple hello world function in JavaScript
@fetch Add a README.md to this project
@fetch Explain what this project does
@fetch Find all TODO comments in this codebase
```

---

## 🔒 Part 4: Security Tests

### 4.1 Owner Authentication

| Test | Method | Expected |
|------|--------|----------|
| Owner sends @fetch | Send from OWNER_PHONE_NUMBER | ✅ Processed |
| Non-owner sends @fetch | Send from different number | ❌ Silent drop |
| No @fetch trigger | Send "hello" without @fetch | ❌ Ignored |
| Broadcast message | From broadcast list | ❌ Rejected |

### 4.2 Whitelist Authentication

**Setup:** First, add a test number to whitelist:
```
@fetch /trust add <test-number>
```

| Test | Method | Expected |
|------|--------|----------|
| Trusted user in group | Trusted number sends @fetch in group | ✅ Processed |
| Untrusted user in group | Random number sends @fetch in group | ❌ Silent drop |
| Owner always works | Owner sends anywhere | ✅ Always processed |

### 4.3 TUI ↔ WhatsApp Sync

1. In TUI: Add number `15551112222` via Trusted Numbers screen
2. In WhatsApp: Send `@fetch /trust list`
3. **Expected:** Number `15551112222` appears in list

4. In WhatsApp: Send `@fetch /trust add 15553334444`
5. In TUI: Open Trusted Numbers screen
6. **Expected:** Number `15553334444` appears in TUI list

---

## 🎙️ Part 5: Media Tests (Voice & Vision)

### 5.1 Voice Notes

1. Send a voice note saying: "Fetch, what projects do I have?"
2. **Expected:** Fetch transcribes and responds with project list

### 5.2 Image Analysis

1. Screenshot an error message
2. Send image with caption: `@fetch What's wrong here?`
3. **Expected:** Fetch analyzes image and explains the error

---

## 📊 Part 6: API Tests

### 6.1 Status API

```bash
# Health check
curl http://localhost:8765/status

# Expected response:
{
  "state": "authenticated",  # or "qr_pending"
  "uptime": 12345,
  "qrCode": null,
  "qrUrl": null
}
```

### 6.2 Documentation Server

```bash
# Open in browser
open http://localhost:8765/docs

# Or curl
curl http://localhost:8765/docs
```

---

## 🐛 Troubleshooting

### Container Issues

```bash
# View logs
docker compose logs fetch-bridge
docker compose logs fetch-kennel

# Restart containers
docker compose restart

# Full rebuild
docker compose down && docker compose up -d --build
```

### WhatsApp Issues

```bash
# Check WhatsApp status
curl http://localhost:8765/status | jq .state

# If stuck on qr_pending, rescan QR via TUI
./manager/fetch-manager  # Select "Setup WhatsApp"
```

### Whitelist Issues

```bash
# Check whitelist file directly
cat fetch-app/data/whitelist.json

# Manual reset if corrupted
echo '{"trustedNumbers":[],"updatedAt":"","version":1}' > fetch-app/data/whitelist.json
```

---

## ✅ Test Completion Checklist

### TUI
- [ ] All menu items accessible
- [ ] Configure screen saves to .env
- [ ] Trusted Numbers screen adds/removes numbers
- [ ] Logs display correctly
- [ ] Version info displays

### WhatsApp Commands
- [ ] `/help` shows all commands including Security
- [ ] `/trust add` adds numbers
- [ ] `/trust remove` removes numbers
- [ ] `/trust list` shows numbers
- [ ] `/projects`, `/status`, `/diff` work
- [ ] `/stop`, `/pause`, `/resume` work

### Security
- [ ] Owner always authorized
- [ ] Trusted numbers authorized in groups
- [ ] Untrusted numbers silently dropped
- [ ] TUI and WhatsApp whitelist in sync

### Natural Language
- [ ] Conversation intent detected
- [ ] Workspace intent detected
- [ ] Task intent delegates to harness

---

## 🐕 Good Boy Checklist

Fetch should be able to tell you:
- [x] What commands are available (`/help`)
- [x] How to manage trusted numbers (`/trust`)
- [x] Current project status (`/status`)
- [x] His capabilities (natural language description in help)

**Final Test:** Send `@fetch What can you do?` and verify Fetch explains his capabilities! 🐕
