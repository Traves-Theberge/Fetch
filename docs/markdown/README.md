# Fetch — Overview

Fetch is a headless development orchestrator. Send natural language coding tasks via WhatsApp, and AI agents (Claude Code, Gemini CLI, GitHub Copilot) execute them against your codebase inside Docker containers.

## How It Works

<!-- DIAGRAM:architecture -->

1. You send `@fetch <message>` on WhatsApp
2. The **Bridge** (Node.js) receives the message via whatsapp-web.js
3. The **Security Gate** verifies the sender (phone whitelist + rate limiting)
4. The **Intent Classifier** routes to one of three paths:
   - **Conversation** → Direct LLM response (greetings, thanks, chat)
   - **Inquiry** → Read-only tool calls (project listing, status checks)
   - **Action** → Full tool access + harness delegation for coding tasks
5. For coding tasks, the **Harness System** spawns a CLI process in the **Kennel** container
6. The agent (Claude/Gemini/Copilot) works on your code in the mounted `/workspace`
7. Fetch formats the result and sends it back via WhatsApp

## Components

| Component | Tech | Purpose |
|-----------|------|---------|
| **Manager** | Go + Bubble Tea | TUI for managing Docker services, configuring env, viewing logs |
| **Bridge** | Node.js + TypeScript | WhatsApp client, agent core, security, 11 orchestrator tools |
| **Kennel** | Ubuntu container | Sandboxed environment with Claude Code, Gemini CLI, Copilot CLI |

## Key Features

- **Context Pipeline** — Full OpenAI multi-turn format with tool call memory, sliding window (20 messages), and automatic compaction
- **Three AI Harnesses** — Claude Code for complex refactoring, Gemini for quick edits, Copilot for suggestions
- **State Machine** — Five modes (ALERT, WORKING, WAITING, GUARDING, RESTING) persisted to SQLite
- **Dynamic Identity** — Hot-reloaded personality via Markdown files in `data/identity/`
- **Skills Framework** — Teach Fetch new capabilities by adding Markdown files to `data/skills/`
- **Proactive Notifications** — Task completion/failure alerts pushed to WhatsApp automatically
- **Voice + Vision** — Send voice notes (transcribed via whisper.cpp) or screenshots for analysis
- **Proactive System** — Schedule reminders, recurring tasks, and file watchers
- **Pipeline Tuning** — 44 parameters tunable via `FETCH_*` env vars or TUI, no code changes needed
- **Crash Recovery** — State persisted to SQLite; Fetch resumes tasks after restart

## Quick Links

- [Setup Guide](SETUP_GUIDE.md) — Installation and first run
- [TUI Guide](TUI_GUIDE.md) — Using the Manager terminal interface
- [Commands](COMMANDS.md) — All slash commands
- [Configuration](CONFIGURATION.md) — Environment variables and config files
- [Architecture](ARCHITECTURE.md) — System design and data flow
- [API Reference](API_REFERENCE.md) — Tool interfaces and HTTP endpoints
