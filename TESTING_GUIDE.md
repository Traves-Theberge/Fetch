# 🧪 Fetch Comprehensive Testing Guide

This guide covers testing all features of Fetch including the TUI, WhatsApp commands, and Zero Trust Bonding.

---

## 📋 Pre-Flight Checklist

Before testing, ensure:

- [ ] Docker containers running: `docker compose ps`
- [ ] TUI rebuilt: `cd manager && go build -o fetch-manager .`
- [ ] WhatsApp authenticated (scan QR if needed)
- [ ] `.env` configured with `OWNER_PHONE_NUMBER` and `OPENROUTER_API_KEY`

```bash
# Quick status check
docker compose ps
curl -s http://localhost:8765/status | jq
```

---

## 🖥️ Part 1: TUI Manager Tests

### 1.1 Launch TUI

```bash
cd manager
./fetch-manager
```

**Expected:** Splash screen → Main menu with ASCII dog mascot

### 1.2 Menu Navigation

| Test | Action | Expected |
|------|--------|----------|
| Navigate | `↑`/`↓` or `j`/`k` | Cursor moves through menu |
| Select | `Enter` or `Space` | Opens selected screen |
| Back | `Esc` | Returns to previous screen |
| Quit | `q` | Exits TUI |
| Version | `v` from menu | Shows neofetch-style info |

### 1.3 Test Each Menu Option

| # | Menu Item | Test Actions |
|---|-----------|--------------|
| 1 | 📱 Setup WhatsApp | Shows QR code if not authenticated |
| 2 | 🔌 Disconnect WhatsApp | Logs out WhatsApp session |
| 3 | 🚀 Start Fetch | Starts Docker containers |
| 4 | 🛑 Stop Fetch | Stops Docker containers |
| 5 | ⚙️ Configure | Opens .env editor |
| 6 | 🔐 Trusted Numbers | Opens whitelist manager |
| 7 | 🤖 Select Model | Opens OpenRouter model picker |
| 8 | 📜 View Logs | Shows container logs |
| 9 | 📚 Documentation | Opens docs in browser |
| 10 | ℹ️ Version | Shows version info |
| 11 | ❌ Exit | Quits TUI |

### 1.4 🔐 Trusted Numbers Screen (NEW)

| Test | Action | Expected |
|------|--------|----------|
| Open | Select "🔐 Trusted Numbers" | Shows whitelist manager |
| View list | Just open | Shows current trusted numbers |
| Add number | Type number, press Enter | Number added, list refreshes |
| Delete | Navigate to number, press `d` | Number removed |
| Clear input | Press `Esc` while typing | Clears input field |
| Exit | Press `Esc` | Returns to menu |

**Test Flow:**
1. Add: `15551234567` → Press Enter → ✅ Should appear in list
2. Add: `15559876543` → Press Enter → ✅ Should appear in list  
3. Navigate to first number → Press `d` → ✅ Should be removed
4. Press `Esc` → ✅ Returns to menu

### 1.5 Configure Screen

| Test | Action | Expected |
|------|--------|----------|
| Navigate fields | `↑`/`↓` | Cursor moves through config fields |
| Edit field | `Enter` or `e` | Enables edit mode |
| Type value | Type text | Value updates |
| Save edit | `Enter` | Saves field value |
| Cancel edit | `Esc` | Discards changes |
| Save file | `s` | Writes to .env file |

**Fields to verify:**
- Owner Phone
- Trusted Numbers
- OpenRouter Key (masked)
- Anthropic Key (masked)
- Gemini Key (masked)
- Log Level

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
