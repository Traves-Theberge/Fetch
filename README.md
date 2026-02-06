# 🐕 Fetch - Your Faithful Code Companion

**v3.4.0** · [Documentation](docs/markdown/DOCUMENTATION.md) · [Setup Guide](docs/markdown/SETUP_GUIDE.md) · [Changelog](CHANGELOG.md)

> ⚠️ **BETA PROJECT** — Experimental software. Review security implications before deployment.

A headless development environment. Send natural language coding tasks via WhatsApp and let AI agents do the work. Fetch is a good boy who just wants to help! 🐕 (But he hates lobsters and cats 🦞)

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

### 🏗️ V3 Orchestrator Architecture

Fetch automatically classifies your intent, checks Instincts for a fast-path, then routes to the appropriate handler:

| Layer | Trigger | Response | Latency |
|-------|---------|----------|---------|
| **Instinct** | Slash commands, safety words | Deterministic — no LLM | <5ms |
| **Conversation** | Greetings, thanks, chat | Direct LLM response | ~500ms |
| **Action** | Coding requests, project ops | Tool calls + harness delegation | 2–60s |

### AI Harnesses

| Harness | CLI | Strengths |
|---------|-----|-----------|
| **Claude Code** | `claude` | Multi-file refactoring, architecture, deep reasoning |
| **Gemini CLI** | `gemini` | Fast edits, explanations, boilerplate |
| **Copilot CLI** | `gh copilot` | Suggestions, command help |

---

## Quick Start

### Prerequisites

- Linux host (any architecture)
- Docker + Docker Compose
- Go 1.21+ (for Manager TUI)
- OpenRouter API key → [openrouter.ai](https://openrouter.ai)
- At least one AI CLI authenticated: `claude`, `gemini`, or `gh copilot`

### 1. Clone and Configure

```bash
git clone https://github.com/Traves-Theberge/Fetch.git
cd Fetch
cp .env.example .env
# Edit .env — set OWNER_PHONE_NUMBER and OPENROUTER_API_KEY at minimum
```

### 2. Build and Start

```bash
# Using the TUI Manager (recommended)
cd manager && go build -o fetch-manager . && ./fetch-manager

# Or directly with Docker Compose
docker compose up -d
docker logs -f fetch-bridge  # Scan the QR code
```

### 3. Message Fetch on WhatsApp

```
@fetch what projects do I have?
@fetch switch to my-api
@fetch add input validation to the signup form
@fetch /status
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/status` | System + task status |
| `/version` | Current version |
| `/projects` | List workspace projects |
| `/project <name>` | Switch active project |
| `/clone <url>` | Clone a repository |
| `/verbose` | Toggle verbose output |
| `/mode <mode>` | Set autonomy (auto/supervised/manual) |
| `/remind <time> <msg>` | Set a one-shot reminder |
| `/schedule <cron> <msg>` | Schedule a recurring task |
| `/cron list` | List scheduled jobs |
| `/identity reset` | Reset agent persona |
| `/skill list` | List available skills |
| `/trust add <number>` | Whitelist a phone number |
| `/stop` | Cancel running task |
| `/pause` / `/resume` | Pause/resume task |

Full reference → [COMMANDS.md](docs/markdown/COMMANDS.md)

---

## Security

- **@fetch trigger** — Messages must start with `@fetch` to be processed
- **Phone whitelist** — Only `OWNER_PHONE_NUMBER` + explicitly trusted numbers
- **Rate limiting** — Sliding window, 30 requests/minute per user
- **Input validation** — Shell injection patterns blocked, path traversal prevented
- **Docker isolation** — AI agents run in sandboxed containers
- **Authenticated API** — `/api/logout` requires bearer token
- **Read-only credentials** — Auth tokens mounted as read-only volumes

---

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OWNER_PHONE_NUMBER` | ✅ | — | Your WhatsApp number (e.g. `15551234567`) |
| `OPENROUTER_API_KEY` | ✅ | — | OpenRouter API key |
| `AGENT_MODEL` | — | `openai/gpt-4.1-nano` | LLM for agent reasoning |
| `SUMMARY_MODEL` | — | `openai/gpt-4.1-nano` | LLM for conversation summaries |
| `VISION_MODEL` | — | `openai/gpt-4.1-nano` | LLM for image analysis |
| `LOG_LEVEL` | — | `debug` | Minimum log level (`debug`/`info`/`warn`/`error`) |
| `ADMIN_TOKEN` | — | auto-generated | Bearer token for admin API |
| `TRUSTED_PHONE_NUMBERS` | — | — | Comma-separated trusted numbers |
| `FETCH_HISTORY_WINDOW` | — | `20` | Messages in LLM sliding window |
| `FETCH_COMPACTION_THRESHOLD` | — | `40` | Compact when messages exceed this |
| `FETCH_MAX_TOOL_CALLS` | — | `5` | Max tool call rounds per message |

Full reference → [CONFIGURATION.md](docs/markdown/CONFIGURATION.md)

---

## Project Structure

```
Fetch/
├── manager/                    # Go TUI (Bubble Tea)
│   ├── main.go                 # Screen router, Bubble Tea model
│   └── internal/
│       ├── components/         # Header, menu, splash, spinner
│       ├── config/             # .env editor, whitelist manager
│       ├── docker/             # Container start/stop/logs
│       ├── models/             # OpenRouter model selector
│       ├── status/             # Bridge health client
│       └── theme/              # Lipgloss styles, borders, colors
├── fetch-app/                  # Node.js Bridge
│   └── src/
│       ├── index.ts            # Entry point, boot + shutdown
│       ├── config/env.ts       # Zod-validated env (Proxy pattern)
│       ├── config/pipeline.ts  # Context pipeline tuning (44 params)
│       ├── agent/              # Core LLM loop, intent, formatting
│       ├── bridge/             # WhatsApp client + reconnection
│       ├── commands/           # Router + 5 handler modules
│       ├── handler/            # Message entry, formatting
│       ├── harness/            # Base class + Claude/Gemini/Copilot
│       ├── identity/           # Hot-reloaded persona
│       ├── instincts/          # Deterministic fast-path handlers
│       ├── modes/              # State machine (5 modes)
│       ├── proactive/          # Scheduler, watcher, polling
│       ├── security/           # Gate, rate limiter, validator
│       ├── session/            # Session + thread persistence
│       ├── skills/             # Skill framework
│       ├── task/               # Task lifecycle + SQLite
│       ├── tools/              # 11 orchestrator tools
│       ├── transcription/      # Voice → text (whisper.cpp)
│       ├── vision/             # Image analysis
│       └── workspace/          # Project discovery, repo maps
│   └── tests/                  # 15 files, 200 tests
├── kennel/                     # AI CLI container (Ubuntu)
├── data/
│   ├── identity/               # COLLAR.md, ALPHA.md
│   ├── agents/                 # claude.md, gemini.md, copilot.md
│   └── skills/                 # Skill definition files
├── workspace/                  # Mounted code sandbox
├── docs/                       # Documentation site (D3 diagrams)
└── docker-compose.yml
```

---

## Development

```bash
cd fetch-app
npm install
npx tsc --noEmit          # Type check
npm run test:run           # 200 tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run lint               # ESLint
```

## License

MIT

## Acknowledgments

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) — WhatsApp Web API
- [Bubble Tea](https://github.com/charmbracelet/bubbletea) — TUI framework
- [OpenRouter](https://openrouter.ai) — AI model routing
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — Voice transcription
