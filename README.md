# 🐕 Fetch - Your Faithful Code Companion

> ⚠️ **BETA PROJECT** — Experimental software. Review security implications before deployment.

A headless "ChatOps" development environment. Send natural language coding tasks via WhatsApp and let AI agents do the work.

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

Fetch is a **context-aware, multi-mode AI coding assistant** that understands what you need and responds appropriately—whether it's a quick chat, a code question, a single edit, or a complex multi-step task.

### 🧠 4-Mode Architecture

Fetch automatically detects your intent and routes to the appropriate mode:

| Mode | When | Tools | Example |
|------|------|-------|---------|
| 💬 **Conversation** | Greetings, thanks, general chat | None | "Hey!", "Thanks!" |
| 🔍 **Inquiry** | Questions about code | Read-only | "What's in auth.ts?" |
| ⚡ **Action** | Single edits/changes | Full (1 cycle) | "Fix the typo on line 5" |
| 📋 **Task** | Complex multi-step work | Full (multi-step) | "Build a login page" |

### 🤖 Agentic Framework

Powered by **OpenRouter** with access to **100+ AI models**:

- **Model Flexibility** - GPT-4o, Claude, Gemini, Llama, Mistral, DeepSeek, and more
- **ReAct Loop** - Reason + Act pattern for multi-step tasks
- **24 Built-in Tools** - File, code, shell, git, and control operations
- **Session Memory** - Persistent conversation context
- **Project Awareness** - Knows your active project and git status
- **Configurable Autonomy** - Supervised, semi-autonomous, or fully autonomous modes

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Host Machine                           │
│  ┌─────────────────┐           ┌─────────────────────────┐     │
│  │   Go Manager    │           │     Docker Compose      │     │
│  │   (TUI)         │           │  ┌─────────┐ ┌───────┐  │     │
│  │                 │──────────▶│  │ Bridge  │ │Kennel │  │     │
│  │  • Start/Stop   │           │  │ (Node)  │ │(Ubuntu│  │     │
│  │  • Configure    │           │  │         │ │ +CLIs)│  │     │
│  │  • View Logs    │           │  └────┬────┘ └───┬───┘  │     │
│  └─────────────────┘           │       │          │      │     │
│                                └───────┼──────────┼──────┘     │
│                                        │          │            │
└────────────────────────────────────────┼──────────┼────────────┘
                                         │          │
                      WhatsApp ◀─────────┘          │
                                                    ▼
                                          /workspace (code)
```

### Intent Classification Flow

```
User Message
     │
     ▼
┌────────────────┐
│ Intent Classifier │
└────────┬───────┘
         │
    ┌────┼────┬────────┐
    ▼    ▼    ▼        ▼
  💬    🔍   ⚡       📋
 Chat  Inquiry Action  Task
  │      │      │       │
  ▼      ▼      ▼       ▼
No     Read   Single  Multi
Tools  Only   Cycle   Step
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

| You Say | Mode | What Happens |
|---------|------|--------------|
| "Hey Fetch!" | 💬 Conversation | Quick friendly response |
| "What's in auth.ts?" | 🔍 Inquiry | Reads and explains the file |
| "Fix the typo on line 42" | ⚡ Action | Shows diff, asks for approval |
| "Build a REST API for users" | 📋 Task | Creates plan, executes step-by-step |

## 🔒 Security

Fetch is designed with security as a top priority:

- **Whitelist Only**: Only responds to `OWNER_PHONE_NUMBER`
- **No Shell Injection**: Commands use array-based argument passing
- **Rate Limiting**: 30 requests per minute maximum
- **Input Validation**: Sanitizes all user input
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
│       ├── security/       # Auth, rate limiting
│       ├── orchestrator/   # OpenRouter intent parsing
│       ├── agent/          # Agentic core (ReAct loop)
│       ├── session/        # Session management
│       ├── tools/          # Tool registry (24 tools)
│       ├── executor/       # Docker exec wrapper
│       ├── tasks/          # Task persistence
│       └── utils/          # Logger, sanitizer
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
| `AGENT_MODEL` | Agent model (default: `openai/gpt-4.1-nano`) |
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
