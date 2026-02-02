# 🐕 Fetch - Your Faithful Code Companion

> ⚠️ **BETA PROJECT** — Experimental software. Review security implications before deployment.

A headless **ChatOps** development environment. Send natural language coding tasks via WhatsApp and let AI agents do the work.

---

## 🎯 Overview

Fetch is a **context-aware, multi-mode AI coding assistant** that understands what you need and responds appropriately—whether it's a quick chat, a code question, a single edit, or a complex multi-step task.

### 🧠 4-Mode Architecture

| Mode | When | Tools | Example |
|------|------|-------|---------|
| 💬 **Conversation** | Greetings, thanks, chat | None | "Hey!", "Thanks!" |
| 🔍 **Inquiry** | Questions about code | Read-only | "What's in auth.ts?" |
| ⚡ **Action** | Single edits/changes | Full (1 cycle) | "Fix the typo" |
| 📋 **Task** | Complex multi-step work | Full (multi-step) | "Build a login page" |

### 🤖 Agentic Framework

Powered by **OpenRouter** with access to **100+ AI models**:

- **Model Flexibility** — GPT-4o, Claude, Gemini, Llama, Mistral, DeepSeek, and more
- **ReAct Loop** — Reason + Act pattern for multi-step tasks
- **24 Built-in Tools** — File, code, shell, git, and control operations
- **Session Memory** — Persistent conversation context
- **Project Awareness** — Knows your active project and git status
- **Configurable Autonomy** — Supervised, semi-autonomous, or fully autonomous modes

---

## 🏗️ Architecture

<!-- DIAGRAM:architecture -->

---

## 🔒 Security

Fetch implements **5 layers of security** to ensure your system remains protected:

<!-- DIAGRAM:security -->

### Security Features

| Feature | Description |
|---------|-------------|
| **@fetch Trigger** | Messages must start with `@fetch` to be processed |
| **Whitelist Auth** | Only responds to `OWNER_PHONE_NUMBER` |
| **Rate Limiting** | 30 requests per minute maximum |
| **Input Validation** | Blocks shell injection, path traversal, etc. |
| **Docker Isolation** | AI agents run in sandboxed containers |

---

## 🚀 Quick Start

### Prerequisites

- Linux machine (any architecture: x86_64, ARM64)
- Docker & Docker Compose v2
- Go 1.21+ (for manager TUI)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Traves-Theberge/Fetch.git
   cd Fetch
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   nano .env  # Add your phone number and API keys
   ```

3. **Build the TUI manager**
   ```bash
   cd manager && go build -o fetch-manager . && cd ..
   ```

4. **Start with Docker Compose**
   ```bash
   docker compose up -d
   ```

5. **Select an AI Model** (optional)
   ```bash
   ./manager/fetch-manager
   # Select "🤖 Select Model" from the menu
   ```

6. **Scan WhatsApp QR Code**
   ```bash
   # Option A: Use the TUI manager
   ./manager/fetch-manager
   
   # Option B: View logs directly
   docker logs -f fetch-bridge
   ```

---

## 📱 Using Fetch

### The @fetch Trigger

**All messages must start with `@fetch`** (case-insensitive):

```
@fetch fix the bug in auth.ts
@Fetch explain how useEffect works
@FETCH what's the git status?
```

### Built-in Commands

| Command | Description |
|---------|-------------|
| `@fetch help` | Show available commands |
| `@fetch status` | Check system and task status |
| `@fetch ping` | Test if Fetch is responsive |
| `@fetch undo` | Revert last file changes |
| `@fetch auto` | Enable autonomous mode |
| `@fetch supervised` | Return to supervised mode |

### Natural Language Tasks

Just describe what you need after `@fetch`:

- *"@fetch Fix the authentication bug in auth.ts"* → Claude analyzes and fixes
- *"@fetch Explain how the useEffect hook works"* → Gemini explains
- *"@fetch Why is my git push failing?"* → Copilot helps debug

---

## 🛠️ Tool Categories

Fetch includes **24 built-in tools** organized into 5 categories:

<!-- DIAGRAM:tools -->

---

## �️ TUI Manager

The Go-based TUI provides a beautiful terminal interface for managing Fetch:

**Layout**: Horizontal design with ASCII dog mascot on left, FETCH title + menu on right, all bottom-aligned.

**Menu Options** (9 items):
- 🔧 **Setup** - First-time configuration wizard
- ▶️ **Start** - Launch Bridge & Kennel containers
- ⏹️ **Stop** - Stop running services
- ⚙️ **Configure** - Edit environment variables
- 🤖 **Select Model** - Choose AI model via OpenRouter
- 📜 **Logs** - View container logs
- 📚 **Documentation** - Open docs in browser
- ℹ️ **Version** - Neofetch-style system info
- 🚪 **Exit** - Quit the TUI

**Keyboard Shortcuts**:
- `↑/↓` or `k/j` - Navigate
- `Enter` - Select
- `v` - Version screen
- `q` - Quit
- `Esc` - Back

---

## �📁 Project Structure

```
fetch/
├── manager/                 # Go TUI for system management
│   ├── main.go
│   └── internal/
│       ├── theme/          # Design system (colors, borders, styles)
│       ├── layout/         # Frame and responsive utilities
│       ├── components/     # UI components (header, splash, version, etc.)
│       ├── config/         # .env editor
│       ├── models/         # OpenRouter model selector
│       └── logs/           # Real-time log viewer
├── fetch-app/              # Node.js Bridge
│   └── src/
│       ├── bridge/         # WhatsApp client
│       ├── security/       # Auth, rate limiting, validation
│       ├── agent/          # Agentic core (ReAct loop)
│       ├── tools/          # Tool registry (24 tools)
│       ├── session/        # Session management (lowdb)
│       └── api/            # Status API (:8765)
├── kennel/                 # AI CLI container (Ubuntu)
├── docs/                   # Documentation site
├── config/                 # Auth token mounts
├── workspace/              # Code sandbox
├── data/                   # Persistent data
└── docker-compose.yml
```

---

## ⚙️ Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `OWNER_PHONE_NUMBER` | Your WhatsApp number (e.g., `15551234567`) |
| `OPENROUTER_API_KEY` | API key from [OpenRouter](https://openrouter.ai) |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MODEL` | `openai/gpt-4o-mini` | AI model for agent reasoning |
| `ENABLE_CLAUDE` | `false` | Enable Claude Code CLI |
| `ENABLE_GEMINI` | `false` | Enable Gemini CLI |
| `ENABLE_COPILOT` | `true` | Enable GitHub Copilot |

---

## 📚 Documentation

- **[Setup Guide](SETUP_GUIDE.md)** — Detailed installation instructions
- **[Full Documentation](DOCUMENTATION.md)** — Complete reference
- **[API Reference](API_REFERENCE.md)** — Internal APIs and integrations
- **[Agentic Architecture](AGENTIC_PLAN.md)** — How the agent works
- **[Changelog](CHANGELOG.md)** — Version history

Access the documentation site at **http://localhost:8765/docs** when the bridge is running.

---

## 📝 License

MIT

## 🙏 Acknowledgments

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) — WhatsApp Web API
- [Bubble Tea](https://github.com/charmbracelet/bubbletea) — TUI framework
- [OpenRouter](https://openrouter.ai) — AI model routing
- [D3.js](https://d3js.org) — Diagram visualizations
