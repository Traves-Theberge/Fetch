# Fetch — Overview

Fetch is a headless development orchestrator. Send natural language coding tasks via WhatsApp, and AI agents (Claude Code, Gemini CLI, GitHub Copilot) execute them against your codebase inside Docker containers.

## How It Works

<!-- DIAGRAM:architecture -->

1. You send `@fetch <message>` on WhatsApp
2. The **Bridge** (Node.js) receives the message via whatsapp-web.js
3. The **Security Gate** verifies the sender (phone whitelist + rate limiting)
4. The **Safety Gate** checks for escape commands (`/stop`, `/undo`, `/clear`, `/help`, `/status`) — if matched, responds instantly without LLM
5. **Everything else** goes directly to the **LLM** with all 27 tools available
6. The LLM decides what to do: respond conversationally, call workspace tools, or delegate coding work to a harness
7. For coding tasks, the **Harness System** spawns a CLI process in the **Kennel** container via `docker exec`
8. The agent (Claude/Gemini/Copilot) works on your code in the mounted `/workspace`
9. Fetch formats the result and sends it back via WhatsApp

## Components

| Component | Tech | Purpose |
|-----------|------|---------|
| **Manager** | Go + Bubble Tea | TUI for managing Docker services, configuring env, viewing logs |
| **Bridge** | Node.js + TypeScript | WhatsApp client, agent core, security, 27 orchestrator tools |
| **Kennel** | Ubuntu container | Sandboxed environment with Claude Code, Gemini CLI, Copilot CLI, Playwright |
| **SearXNG** | Meta search engine | Self-hosted web search aggregator (Google, DuckDuckGo, Bing, etc.) |

## Key Features

- **LLM-First Architecture** — Every message goes directly to the LLM with all 27 tools. No pre-classification, no regex routing. The LLM decides whether to chat or call tools — exactly how Claude Code and Goose work
- **5 Safety Escapes** — Only `/stop`, `/undo`, `/clear`, `/help`, `/status` are deterministic. Everything else is conversational
- **Context Pipeline** — Full OpenAI multi-turn format with tool call memory, sliding window (20 messages), and automatic compaction
- **Live Context Awareness** — System prompt rebuilt after every state-changing tool call. The LLM always sees current workspace, project, and task state
- **Three AI Harnesses** — Claude Code for complex refactoring, Gemini for quick edits, Copilot for suggestions
- **Three-Container Docker Architecture** — Bridge (brain) controls Kennel (muscle) via `docker exec`, SearXNG provides web search. The harness spawner wraps CLI commands with `docker exec -w <cwd> <container> <command>`
- **GitHub Auto-Sync** — `workspace_sync` tool commits, pushes, and auto-creates GitHub repos. New workspaces automatically sync on creation
- **10 Project Types** — Auto-detects Node, TypeScript, Python, Rust, Go, Java, Ruby, PHP, .NET, and unknown
- **Dynamic Identity** — Hot-reloaded personality via Markdown files in `data/identity/`
- **Skills Framework** — Teach Fetch new capabilities by adding Markdown files to `data/skills/`
- **Task Notifications** — Task completion/failure alerts pushed to WhatsApp automatically
- **Voice + Vision** — Send voice notes (transcribed via whisper.cpp) or screenshots for analysis
- **Web Fetch & Search** — Fetch web pages as markdown (Readability + Turndown) and search the web via self-hosted SearXNG meta search engine — 100% free, no API keys
- **Browser Automation** — Headless Chromium via Playwright in the Kennel container with accessibility tree snapshots for token-efficient page interaction
- **Pipeline Tuning** — 34 parameters tunable via `FETCH_*` env vars or TUI, no code changes needed
- **Automated Service Hotreload** — The TUI Manager automatically restarts Fetch services after configuration saves to apply new settings instantly
- **Crash Recovery** — State persisted to SQLite; Fetch resumes tasks after restart

## Quick Links

- [Setup Guide](docs/markdown/SETUP_GUIDE.md) — Installation and first run
- [TUI Guide](docs/markdown/TUI_GUIDE.md) — Using the Manager terminal interface
- [Commands](docs/markdown/COMMANDS.md) — Safety escapes and natural language examples
- [Configuration](docs/markdown/CONFIGURATION.md) — Environment variables and config files
- [Architecture](docs/markdown/ARCHITECTURE.md) — System design and data flow
- [API Reference](docs/markdown/API_REFERENCE.md) — Tool interfaces and HTTP endpoints

## Version History

| Version | Date | Description |
| --- | --- | --- |
| 4.1.0 | 2026-02-11 | Web Fetch, Web Search & Browser Automation |
| 4.0.7 | 2026-02-11 | Documentation & UX Overhaul |
| 4.0.6 | 2026-02-10 | GitHub Tools Expansion (8 New Tools) |
| 4.0.5 | 2026-02-09 | Hotreload & TUI UX |
| 4.0.4 | 2026-02-09 | Bug Fixes & TUI Configuration |
| 4.0.3 | 2026-02-09 | New `workspace_publish` Tool |
| 4.0.2 | 2026-02-09 | Session Recursion & Bug Fixes |
| 4.0.1 | 2026-02-08 | Dead Code Purge & Dependency Audit |
| 4.0.0 | 2026-02-07 | The Conversation IS the Interface |
| 3.5.0 | 2026-02-07 | Make It Feel Alive |
| 3.4.0 | 2026-02-06 | Context Pipeline |
| 3.3.0 | 2026-02-06 | Deep Refinement |
| 3.2.1 | 2026-02-05 | Runtime Fixes, Security Hardening & Dead Code Purge |
| 3.2.0 | 2026-02-05 | Identity & Skills Pipeline Unification |
| 3.1.1 | 2026-02-05 | Code Audit & State Architecture |
| 3.1.0 | 2026-02-05 | Dynamic Identity, Skills, Crash Recovery |
| 3.0.0 | 2026-02-04 | Orchestrator Architecture & Mode System |
| 2.4.4 | 2026-02-04 | Stability & Voice Fix |
| 2.4.3 | 2026-02-04 | Zero Trust Bonding |
| 2.4.2 | 2026-02-04 | Repo Maps & Media Intelligence |
| 0.1.0 | 2026-02-01 | Initial beta release |

