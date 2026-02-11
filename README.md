# Fetch — Overview

Fetch is a headless development orchestrator. Send natural language coding tasks via WhatsApp, and AI agents (Claude Code, Gemini CLI, GitHub Copilot) execute them against your codebase inside Docker containers.

## How It Works

<!-- DIAGRAM:architecture -->

1. You send `@fetch <message>` on WhatsApp
2. The **Bridge** (Node.js) receives the message via whatsapp-web.js
3. The **Security Gate** verifies the sender (phone whitelist + rate limiting)
4. The **Safety Gate** checks for escape commands (`/stop`, `/undo`, `/clear`, `/help`, `/status`) — if matched, responds instantly without LLM
5. **Everything else** goes directly to the **LLM** with all 21 tools available
6. The LLM decides what to do: respond conversationally, call workspace tools, or delegate coding work to a harness
7. For coding tasks, the **Harness System** spawns a CLI process in the **Kennel** container via `docker exec`
8. The agent (Claude/Gemini/Copilot) works on your code in the mounted `/workspace`
9. Fetch formats the result and sends it back via WhatsApp

## Components

| Component | Tech | Purpose |
|-----------|------|---------|
| **Manager** | Go + Bubble Tea | TUI for managing Docker services, configuring env, viewing logs |
| **Bridge** | Node.js + TypeScript | WhatsApp client, agent core, security, 12 orchestrator tools |
| **Kennel** | Ubuntu container | Sandboxed environment with Claude Code, Gemini CLI, Copilot CLI |

## Key Features

- **LLM-First Architecture** — Every message goes directly to the LLM with all 21 tools. No pre-classification, no regex routing. The LLM decides whether to chat or call tools — exactly how Claude Code and Goose work
- **5 Safety Escapes** — Only `/stop`, `/undo`, `/clear`, `/help`, `/status` are deterministic. Everything else is conversational
- **Context Pipeline** — Full OpenAI multi-turn format with tool call memory, sliding window (20 messages), and automatic compaction
- **Live Context Awareness** — System prompt rebuilt after every state-changing tool call. The LLM always sees current workspace, project, and task state
- **Three AI Harnesses** — Claude Code for complex refactoring, Gemini for quick edits, Copilot for suggestions
- **Dual-Container Docker Exec** — Bridge (brain) controls Kennel (muscle) via `docker exec`. The harness spawner wraps CLI commands with `docker exec -w <cwd> <container> <command>`
- **GitHub Auto-Sync** — `workspace_sync` tool commits, pushes, and auto-creates GitHub repos. New workspaces automatically sync on creation
- **10 Project Types** — Auto-detects Node, TypeScript, Python, Rust, Go, Java, Ruby, PHP, .NET, and unknown
- **Dynamic Identity** — Hot-reloaded personality via Markdown files in `data/identity/`
- **Skills Framework** — Teach Fetch new capabilities by adding Markdown files to `data/skills/`
- **Task Notifications** — Task completion/failure alerts pushed to WhatsApp automatically
- **Voice + Vision** — Send voice notes (transcribed via whisper.cpp) or screenshots for analysis
- **Pipeline Tuning** — 31 parameters tunable via `FETCH_*` env vars or TUI, no code changes needed
- **Automated Service Hotreload** — The TUI Manager automatically restarts Fetch services after configuration saves to apply new settings instantly
- **Crash Recovery** — State persisted to SQLite; Fetch resumes tasks after restart

## Quick Links

- [Setup Guide](docs/markdown/SETUP_GUIDE.md) — Installation and first run
- [TUI Guide](docs/markdown/TUI_GUIDE.md) — Using the Manager terminal interface
- [Commands](docs/markdown/COMMANDS.md) — Safety escapes and natural language examples
- [Configuration](docs/markdown/CONFIGURATION.md) — Environment variables and config files
- [Architecture](docs/markdown/ARCHITECTURE.md) — System design and data flow
- [API Reference](docs/markdown/API_REFERENCE.md) — Tool interfaces and HTTP endpoints
