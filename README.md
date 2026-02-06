# 🐕 Fetch

> Send coding tasks via WhatsApp. AI agents do the work.

Fetch is a headless development orchestrator. You message it on WhatsApp with natural language, and it delegates work to AI coding agents (Claude Code, Gemini CLI, GitHub Copilot) running inside Docker containers against your real codebase.

**Version 3.3.0** · [Full Documentation](docs/markdown/DOCUMENTATION.md) · [Setup Guide](docs/markdown/SETUP_GUIDE.md) · [Changelog](CHANGELOG.md)

> ⚠️ **Beta** — Experimental software. Review security implications before deployment.

---

## How It Works

1. **You send a WhatsApp message** → `@fetch add dark mode to the settings page`
2. **Fetch classifies your intent** → conversation, inquiry, or action
3. **For coding tasks**, Fetch delegates to a CLI agent (Claude/Gemini/Copilot) running in a sandboxed Docker container
4. **The agent edits your code** in a mounted `/workspace` directory
5. **Fetch reports back** with a summary of what changed

### System Layout

| Component | Runtime | Role |
|-----------|---------|------|
| **Manager** | Go TUI (host) | Start/stop services, configure, view logs |
| **Bridge** | Node.js (Docker) | WhatsApp client, agent core, security, tools |
| **Kennel** | Ubuntu (Docker) | Runs Claude Code / Gemini / Copilot CLIs |

The Manager controls Docker Compose. The Bridge handles WhatsApp authentication, message routing, intent classification, and the agentic ReAct loop. The Kennel is a sandboxed Ubuntu container where AI CLIs execute against your mounted workspace.

### Intent Classification

Every message flows through three layers:

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
│   └── tests/                  # 13 files, 177 tests
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
npm run test:run           # 177 tests
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
