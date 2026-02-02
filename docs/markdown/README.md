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

Fetch acts as a bridge between your WhatsApp and powerful AI coding agents:
- **Claude Code** - Complex refactoring and code generation
- **Gemini CLI** - Quick explanations and documentation
- **GitHub Copilot** - Git operations and repository help

### 🤖 Agentic Framework

Fetch includes a **low-cost autonomous agent** powered by **GPT-4.1-nano via OpenRouter**:
- **ReAct Loop** - Reason + Act pattern for multi-step tasks
- **24 Built-in Tools** - File, code, shell, git, and control operations
- **Session Memory** - Persistent conversation context
- **Configurable Autonomy** - Supervised, semi-autonomous, or fully autonomous modes

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Host Machine                         │
│  ┌─────────────────┐         ┌─────────────────────────┐   │
│  │   Go Manager    │         │     Docker Compose      │   │
│  │   (TUI)         │         │  ┌─────────┐ ┌───────┐  │   │
│  │                 │────────▶│  │ Bridge  │ │Kennel │  │   │
│  │  • Start/Stop   │         │  │ (Node)  │ │(Ubuntu│  │   │
│  │  • Configure    │         │  │         │ │ +CLIs)│  │   │
│  │  • View Logs    │         │  └────┬────┘ └───┬───┘  │   │
│  └─────────────────┘         │       │          │      │   │
│                              └───────┼──────────┼──────┘   │
│                                      │          │          │
└──────────────────────────────────────┼──────────┼──────────┘
                                       │          │
                    WhatsApp ◀─────────┘          │
                                                  ▼
                                        /workspace (code)
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

The TUI provides:
- 🚀 Start/Stop services
- ⚙️ Configure API keys
- 📜 View logs
- 🔄 Update from Git

## 📱 WhatsApp Commands

| Command | Description |
|---------|-------------|
| `help` | Show available commands |
| `status` | Check system and task status |
| `ping` | Test if Fetch is responsive |

### Natural Language Tasks

Just describe what you need:

- *"Fix the authentication bug in auth.ts"* → Routes to Claude
- *"Explain how useEffect works in React"* → Routes to Gemini
- *"Why is my git push failing?"* → Routes to Copilot

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
