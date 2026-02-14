# Fetch

Your faithful code companion.

```text
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

**Unleash Multi-agent orchestration.**

Fetch is the Alpha of your AI workforce. Acting as the Pack Leader, it chats with you on WhatsApp to understand your goals, then commands a squad of specialized agents—Claude Code, Gemini, Copilot, and more—to execute complex coding tasks inside sandboxed Docker containers.

---

## How It Works

1. You send a message on WhatsApp
2. **Security Gate** verifies sender (phone whitelist + rate limiting)
3. **Safety Gate** checks for escape commands (`/stop`, `/undo`, `/clear`, `/help`, `/status`, `/version`, `/usage`, `/trust`)
4. Everything else goes to the **LLM** with all 29 tools available
5. The LLM decides: respond, call tools, or delegate to a harness
6. For coding tasks, a CLI agent is spawned in the **Kennel** via `docker exec`
7. Results are formatted and sent back via WhatsApp

## Architecture

| Container | Tech | Role |
|-----------|------|------|
| **Bridge** | Node.js / TypeScript | WhatsApp client, agent core, 29 orchestrator tools, session/task persistence |
| **Kennel** | Ubuntu | Sandboxed env with Claude Code, Gemini CLI, Copilot CLI, OpenCode, Codex, Playwright + Chromium |
| **SearXNG** | Meta search engine | Self-hosted search aggregator (Google, DuckDuckGo, Bing, Wikipedia, GitHub, npm) |
| **Manager** | Go / Bubble Tea | TUI for managing services, configuring env vars, viewing logs |

## Features

**Core**

- **LLM-First** — Every message goes directly to the LLM with all 29 tools. No pre-classification, no regex routing
- **8 Safety Escapes** — `/stop`, `/undo`, `/clear`, `/help`, `/status`, `/version`, `/usage`, `/trust` are deterministic
- **Live Context** — System prompt rebuilt after every state-changing tool call
- **Bounded Status Rewrites** — Progress and completion/failure text can be LLM-rewritten with timeout/sanitizer guards and template fallback
- **Five Harnesses** — Claude Code, Gemini CLI, Copilot CLI, OpenCode, Codex with process lifecycle management
- **P0 Reliability Hardening** — Explicit git undo workspace validation, safe timer cleanup, parsed harness progress/question/file-op events, and normalized output-event contracts
- **P1 Reliability Hardening** — Unified session-id API validation, kill-state precedence in spawner, and resilient whitelist/identity reload paths
- **P2 Reliability Hardening** — Session-scoped notification anti-repeat with TTL, bounded harness retention, identity readiness contract, Windows/backslash path normalization, singleton-reset hooks, and test-injectable session ID generation
- **Session Consistency Hardening** — Per-session write queues protect compaction/message persistence ordering; session manager init retries after transient failure
- **Structured Memory** — Cross-session recall with BM25-style keyword matching, chained compaction summaries
- **Notification Telemetry** — `/api/status` includes notification path/fallback counters for rewrite/template observability
- **Deterministic Repo Context** — Repo-map file selection is normalized/sorted before truncation to reduce context churn
- **Pipeline Tuning** — 42 parameters via `FETCH_*` env vars, resolved through live-reading config proxies
- **Rewrite Feature Flags** — `FETCH_NOTIFICATION_REWRITE`/`FETCH_PROGRESS_REWRITE` and timeout envs bound micro-rewriter behavior with deterministic fallback

**Tools & Capabilities**

- **29 Orchestrator Tools** — Workspace management, task lifecycle, GitHub operations, web fetch, web search, browser automation
- **Web Fetch & Search** — Readability + Turndown for pages, self-hosted SearXNG for search (no API keys)
- **Web Fetch SSRF Guards** — DNS-resolved private IP blocking and redirect-hop validation for `web_fetch`
- **Browser Automation** — Headless Chromium via Playwright with accessibility tree snapshots
- **Voice & Vision** — Voice notes transcribed via whisper.cpp, image analysis via vision model
- **Vision Guardrails** — MIME allowlist and payload-size caps are validated before provider calls
- **Safe Transcription Execution** — whisper/ffmpeg invocation uses argument-safe process execution with model-path existence checks
- **GitHub Auto-Sync** — Commits, pushes, and auto-creates repos on workspace creation

**System**

- **Dynamic Identity** — Hot-reloaded personality from Markdown files in `data/identity/`
- **Skills Framework** — Teach new capabilities by adding Markdown to `data/skills/`
- **Skills Runtime Safety** — Requirement-gated skill loading keeps summaries aligned with activation, removes stale unavailable skills on reload, and escapes activated-skill blocks
- **Skill-to-Tool Mapping** — Built-in skills map to concrete tool modules (see Skills Guide + API Reference ownership tables)
- **Tool Contract Source** — `fetch-app/src/validation/tools.ts` defines the canonical tool name/argument surface
- **Action-Specific Browser Validation** — `browser_action` enforces required fields by action mode (`click`/`type`)
- **Custom Tool Reload Safety** — File-backed custom tools are strictly validated on load/reload and stale renamed/invalid entries are removed
- **Subsystem Ownership Maps** — API Reference tracks tool, workspace, vision, and supporting module ownership
- **Crash Recovery** — State persisted to SQLite, resumes after restart
- **Persistence Corruption Guardrails** — Session/task stores tolerate malformed persisted rows via safe fallback/skip behavior
- **Task Persistence Health Signal** — Task manager records degraded persistence init state/error for operational visibility
- **Status & Admin API** — Bridge exposes `/api/status`, `/api/health`, and admin-protected control/session endpoints
- **Robust WhatsApp Transport** — Event deduplication, voice/image preprocessing, reaction handling, and auto-reconnect backoff
- **10 Project Types** — Auto-detects Node, TypeScript, Python, Rust, Go, Java, Ruby, PHP, .NET
- **Docker Hardening** — Healthchecks, resource limits, log rotation, shell injection prevention
- **Docker Timeout Control** — Timed-out exec paths attempt in-container process termination; stdin option behavior matches API contract
- **Graceful Teardown Coverage** — Shutdown tears down security timers and file watchers (skills, identity, custom tools, whitelist)

## Quick Start

```bash
# Install Fetch
curl -fsSL https://raw.githubusercontent.com/Traves-Theberge/Fetch/main/scripts/install.sh | bash

# Validate host setup
fetch self doctor

# Configure
nano ~/.fetch/repo/.env

# Start + open TUI
fetch up
fetch tui
```

Required env vars: `OPENROUTER_API_KEY`, `OWNER_PHONE_NUMBER`
For GitHub repo operations without Copilot, set `GH_TOKEN` and keep `ENABLE_COPILOT=false`.

See [Setup Guide](SETUP_GUIDE.md) for full instructions.

## Documentation

| Guide | Description |
|-------|-------------|
| [Setup Guide](SETUP_GUIDE.md) | Installation and first run |
| [Install & Update](INSTALL_UPDATE.md) | Bootstrap installer and self-update CLI |
| [TUI Guide](TUI_GUIDE.md) | Manager terminal interface |
| [Commands](COMMANDS.md) | Safety escapes and usage examples |
| [Configuration](CONFIGURATION.md) | Environment variables and config files |
| [Architecture](ARCHITECTURE.md) | System design, data flow, concurrency patterns |
| [Harness System](HARNESS_SYSTEM.md) | CLI adapter lifecycle, process management, and source responsibility index |
| [Identity System](IDENTITY_SYSTEM.md) | Dynamic persona, prompt assembly, and identity/security source responsibility index |
| [Skills Guide](SKILLS_GUIDE.md) | Building/loading skills and keeping skill instructions aligned with live tools |
| [Context Pipeline](CONTEXT_PIPELINE.md) | Message windowing, compaction, prompt assembly |
| [State Management](STATE_MANAGEMENT.md) | SQLite session/task persistence and source responsibility index |
| [API Reference](API_REFERENCE.md) | Tool interfaces and HTTP endpoints |
| [Changelog](../../CHANGELOG.md) | Version history and release notes |

## Development

```bash
# Bridge (TypeScript)
cd fetch-app
npm run dev          # run with ts-node
npm run build        # compile to dist/
npm run lint         # eslint
npm run test:run     # all tests (450 passing)
npm run test:unit    # unit tests only

# Manager (Go TUI)
cd manager
go build -o fetch-manager .
./fetch-manager

# Docker
./deploy.sh                    # build + start
docker compose down            # stop
docker logs -f fetch-bridge    # bridge logs
```

Manual verification scripts (not CI tests): `../../fetch-app/scripts/manual/README.md`

## License

MIT
