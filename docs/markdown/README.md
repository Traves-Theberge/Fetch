# 🐕 Fetch - Your Faithful Code Companion

> ⚠️ **BETA PROJECT** — Experimental software. Review security implications before deployment.

A headless "ChatOps" development environment. Send natural language coding tasks via WhatsApp and let AI agents do the work. Fetch is a good boy who just wants to help! 🐕 (But he hates lobsters 🦞)

```
  ⠀⠀⠀⠀⠀⠀⠀⢀⣠⣤⣠⣶⠚⠛⠿⠷⠶⣤⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀                                             
  ⠀⠀⠀⠀⠀⢀⣴⠟⠉⠀⠀⢠⡄⠀⠀⠀⠀⠀⠉⠙⠳⣄⠀⠀⠀⠀⠀⠀⠀⠀                                             
  ⠀⠀⠀⢀⡴⠛⠁⠀⠀⠀⠀⠘⣷⣴⠏⠀⠀⣠⡄⠀⠀⢨⡇⠀⠀⠀⠀⠀⠀⠀    ███████╗███████╗████████╗ ██████╗██╗  ██╗
  ⠀⠀⠀⠺⣇⠀⠀⠀⠀⠀⠀⠀⠘⣿⠀⠀⠘⣻⣻⡆⠀⠀⠙⠦⣄⣀⠀⠀⠀⠀    ██╔════╝██╔════╝╚══██╔══╝██╔════╝██║  ██║
  ⠀⠀⠀⢰⡟⢷⡄⠀⠀⠀⠀⠀⠀⢸⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⢻⠶⢤⡀    █████╗  █████╗     ██║   ██║     ███████║
  ⠀⠀⠀⣾⣇⠀⠻⣄⠀⠀⠀⠀⠀⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣀⣴⣿    ██╔══╝  ██╔══╝     ██║   ██║     ██╔══██║
  ⠀⠀⢸⡟⠻⣆⠀⠈⠳⢄⡀⠀⠀⡼⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠶⠶⢤⣬⡿⠁    ██║     ███████╗   ██║   ╚██████╗██║  ██║
  ⠀⢀⣿⠃⠀⠹⣆⠀⠀⠀⠙⠓⠿⢧⡀⠀⢠⡴⣶⣶⣒⣋⣀⣀⣤⣶⣶⠟⠁⠀    ╚═╝     ╚══════╝   ╚═╝    ╚═════╝╚═╝  ╚═╝
  ⠀⣼⡏⠀⠀⠀⠙⠀⠀⠀⠀⠀⠀⠀⠙⠳⠶⠤⠵⣶⠒⠚⠻⠿⠋⠁⠀⠀⠀⠀                                             
  ⢰⣿⡇⠀⠀⠀⠀⠀⠀⠀⣆⠀⠀⠀⠀⠀⠀⠀⢠⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀    Your Faithful Code Companion                  
  ⢿⡿⠁⠀⠀⠀⠀⠀⠀⠀⠘⣦⡀⠀⠀⠀⠀⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀                  
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣷⡄⠀⠀⠀⠀⣿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀                                             
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢷⡀⠀⠀⠀⢸⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀                                             
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀                                             
```

## 🎯 Overview

Fetch is a **lightweight orchestrator** that delegates coding tasks to specialized AI harnesses (Claude Code, Gemini CLI, GitHub Copilot CLI) while managing conversation state and user interaction via WhatsApp.

**Personality:** Fetch is a loyal coding companion - eager, helpful, and always ready to fetch code for you! He uses dog expressions like "Let me fetch that!" and "Good boy reporting back!" and *really* hates lobsters 🦞 (weird ocean bugs with anger issues).

### 🏗️ V2 Orchestrator Architecture

Fetch automatically classifies your intent and routes to the appropriate handler:

| Intent | When | Action | Example |
|--------|------|--------|---------|
| 💬 **Conversation** | Greetings, thanks, chat | Direct response | "Hey!", "Thanks!" |
| 📁 **Workspace** | Project management | Tool calls | "List projects", "Switch to api" |
| 🚀 **Task** | Coding work | Delegate to harness | "Add dark mode", "Fix the bug" |

### 🤖 Harness System

Fetch delegates actual coding work to specialized CLI tools:

| Harness | CLI | Best For |
|---------|-----|----------|
| **Claude Code** | `claude` | Complex refactoring, multi-file changes |
| **Gemini CLI** | `gemini` | Quick edits, explanations |
| **Copilot CLI** | `gh copilot` | Suggestions, command help |

### 🧠 Smart Capabilities

- **🗺️ Repo Maps:** Fetch scans your project structure to understand the architecture, exports, and relationships between files.
- **🎙️ Voice Mode:** Send voice notes on WhatsApp! Fetch transcribes them using Whisper and executes them as commands.
- **👀 Vision:** Send screenshots of errors or UI designs. Fetch uses GPT-4o Vision to understand what he's looking at.
- **🌊 Streaming:** Get real-time updates as Fetch works (e.g., "📝 Editing src/index.ts...").

### 🛠️ 11 Orchestrator Tools

| Category | Tools | Purpose |
|----------|-------|---------|
| **Workspace** | `workspace_list`, `workspace_select`, `workspace_status`, `workspace_create`, `workspace_delete` | Project management |
| **Task** | `task_create`, `task_status`, `task_cancel`, `task_respond` | Task lifecycle |
| **Interaction** | `ask_user`, `report_progress` | User communication |

## 🏗️ Architecture

> 📊 **Interactive diagrams available at [http://localhost:8765/docs](http://localhost:8765/docs)** when the bridge is running.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              HOST MACHINE                                  │
│                                                                            │
│  ┌──────────────┐         ┌────────────────────────────────────────────┐  │
│  │  🎛️ Manager  │         │            🐳 Docker Compose               │  │
│  │    (Go TUI)  │─────────│  ┌─────────────┐      ┌─────────────┐      │  │
│  │              │         │  │  🌉 Bridge  │      │  🏠 Kennel  │      │  │
│  │ • Start/Stop │         │  │   (Node.js) │◄────►│   (Ubuntu)  │      │  │
│  │ • Configure  │         │  │             │      │             │      │  │
│  │ • View Logs  │         │  │ WhatsApp    │      │ Claude CLI  │      │  │
│  │ • Model Sel. │         │  │ Security    │      │ Gemini CLI  │      │  │
│  └──────────────┘         │  │ Agent Core  │      │ Copilot CLI │      │  │
│                           │  └──────┬──────┘      └──────┬──────┘      │  │
│                           └─────────┼──────────────────-─┼─────────────┘  │
│                                     │                    │                │
│                                     ▼                    ▼                │
│                              📱 WhatsApp          📁 /workspace           │
└────────────────────────────────────────────────────────────────────────────┘
```

### Message Flow

```
    📱 WhatsApp Message
            │
            ▼
    ┌───────────────┐
    │ 🧠 Intent     │
    │   Classifier  │
    └───────┬───────┘
            │
    ┌───────┼───────┬───────────┐
    ▼       ▼       ▼           ▼
   💬      🔍      ⚡          📋
  Chat   Inquiry  Action      Task
    │       │       │           │
    ▼       ▼       ▼           ▼
 Direct  Read-only Full Tools  ReAct
Response  Tools   (1 cycle)    Loop
    │       │       │           │
    └───────┴───────┴───────────┘
                    │
                    ▼
             ✅ WhatsApp Reply
```

## 🚀 Quick Start

### Prerequisites
- Linux machine (any architecture)
- Docker & Docker Compose
- Go 1.21+ (for manager)
- Node.js 20+ (for development)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/fetch.git
   cd fetch
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and phone number
   ```

3. **Start with Docker Compose**
   ```bash
   docker compose up -d
   ```

4. **Scan WhatsApp QR Code**
   ```bash
   docker logs -f fetch-bridge
   # Scan the QR code that appears
   ```

### Using the Manager TUI

```bash
cd manager
go run .
```

The TUI provides a beautiful terminal interface with:
- 🎨 **Horizontal Layout** - ASCII dog mascot on the left, menu on the right
- 📍 **Bottom-Aligned UI** - Content aligned to bottom with status bar
- 🐕 **Neofetch-Style Version** - Press `v` for detailed system info

**Menu Options:**
- 🔧 Setup - First-time configuration wizard
- ▶️  Start - Launch Bridge & Kennel containers
- ⏹️  Stop - Stop running services
- ⚙️  Configure - Edit environment variables
- 🤖 Select Model - Choose AI model via OpenRouter
- 📜 Logs - View container logs
- 📚 Documentation - Open docs in browser
- ℹ️  Version - System information
- 🚪 Exit - Quit the TUI

## 📱 WhatsApp Commands

| Command | Description |
|---------|-------------|
| `help` | Show available commands |
| `status` | Check system and task status |
| `ping` | Test if Fetch is responsive |

### Project Management

| Command | Description |
|---------|-------------|
| `/projects` | List available projects in workspace |
| `/project <name>` | Switch to a specific project |
| `/clone <url>` | Clone a git repository |
| `/init <name>` | Initialize a new project |
| `/status` | Show git status |
| `/diff` | Show current changes |
| `/log [n]` | Show recent commits |

### Natural Language Examples

Just describe what you need:

| You Say | Intent | What Happens |
|---------|--------|--------------|
| "Hey Fetch!" | 💬 Conversation | Direct response, no tools |
| "What projects are open?" | 📁 Workspace | Lists workspaces via tools |
| "Build a REST API for users" | 🚀 Task | Delegates to harness (Claude/Gemini/Copilot) |
| "Create a login form component" | 🚀 Task | AI plans & executes multi-step work |
| "Help me debug this error" | 🚀 Task | AI analyzes code, proposes fixes |

## 🔒 Security

Fetch is designed with security as a top priority:

- **Whitelist Only**: Only responds to `OWNER_PHONE_NUMBER`
- **@fetch Trigger**: All messages must start with `@fetch` prefix
- **Zod Validation**: Runtime type checking for all tool arguments
- **No Shell Injection**: Commands use array-based argument passing
- **Rate Limiting**: 30 requests per minute maximum
- **Input Validation**: Sanitizes all user input
- **Path Traversal Protection**: Blocks `..` in file paths
- **Docker Isolation**: AI agents run in sandboxed containers
- **Read-Only Configs**: Auth tokens mounted as read-only

## 📁 Project Structure

```
fetch/
├── manager/                 # Go TUI for system management
│   ├── main.go
│   └── internal/
│       ├── config/         # .env editor
│       ├── docker/         # Container control
│       ├── logs/           # Log viewer
│       └── update/         # Git update
├── fetch-app/              # Node.js Bridge
│   └── src/
│       ├── bridge/         # WhatsApp client
│       ├── security/       # Auth, rate limiting, validation
│       ├── agent/          # V2 Orchestrator (core, intent, prompts)
│       ├── harness/        # CLI adapters (Claude, Gemini, Copilot)
│       ├── session/        # Session management
│       ├── tools/          # 8 orchestrator tools + Zod schemas
│       ├── executor/       # Docker exec wrapper
│       ├── tasks/          # Task persistence
│       └── utils/          # Logger, sanitizer
│   └── tests/              # Vitest test suite
│       ├── unit/           # Unit tests
│       ├── integration/    # Integration tests
│       └── e2e/            # End-to-end tests
├── kennel/                 # AI CLI container
│   └── Dockerfile
├── config/                 # Auth token mounts
│   ├── claude/
│   └── github/
├── workspace/              # Code sandbox
├── data/                   # Persistent data
└── docker-compose.yml
```

## ⚙️ Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `OWNER_PHONE_NUMBER` | Your WhatsApp number (e.g., `15551234567`) |
| `OPENROUTER_API_KEY` | API key from [OpenRouter](https://openrouter.ai) |
| `AGENT_MODEL` | OpenRouter model ID (default: `openai/gpt-4o-mini`) |
| `ANTHROPIC_API_KEY` | API key for Claude |
| `GEMINI_API_KEY` | API key for Gemini |

### GitHub Copilot Authentication

1. On a machine with a browser:
   ```bash
   gh auth login
   ```

2. Copy the hosts file:
   ```bash
   cp ~/.config/gh/hosts.json ./config/github/
   ```

## 📝 License

MIT

## 🙏 Acknowledgments

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - WhatsApp Web API
- [Bubble Tea](https://github.com/charmbracelet/bubbletea) - TUI framework
- [OpenRouter](https://openrouter.ai) - AI model routing
