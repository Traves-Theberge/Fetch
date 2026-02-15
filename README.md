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

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Go](https://img.shields.io/badge/Go-1.21+-00ADD8?logo=go&logoColor=white)](https://golang.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docker.com)
[![Tests](https://img.shields.io/badge/Tests-450_passing-brightgreen)]()

---

Fetch is the Alpha of your AI workforce. Acting as the Pack Leader, it chats with you on WhatsApp to understand your goals, then commands a squad of specialized agents, Claude Code, Gemini, Copilot, Opencode and Codex execute complex coding tasks inside sandboxed Docker containers.

<br>

## How It Works

1. You send a message on WhatsApp.
2. Bridge receives it and runs Security Gate checks (whitelist + rate limits).
3. Safety commands (`/stop`, `/undo`, `/clear`, `/help`, `/status`, `/version`, `/usage`, `/trust`) are handled deterministically.
4. Other requests go to the LLM with all available tools.
5. For coding tasks, Bridge starts a harness inside Kennel via `docker exec`.
6. If web search is needed, Bridge queries SearXNG.
7. Results are returned to WhatsApp.

<br>

## Architecture

Fetch runs as a **three-container system** managed by a native Go TUI:

| | Container | Tech | Role |
|:-:|-----------|------|------|
| **1** | **Bridge** | Node.js / TypeScript | WhatsApp client, agent core, 29 orchestrator tools, session & task persistence |
| **2** | **Kennel** | Ubuntu | Sandboxed env with Claude Code, Gemini CLI, Copilot CLI, OpenCode, Codex, Playwright + Chromium |
| **3** | **SearXNG** | Meta search engine | Self-hosted search aggregator (Google, DuckDuckGo, Bing, Wikipedia, GitHub, npm) |
| | **Manager** | Go / Bubble Tea | Host-side TUI for managing services, editing config, viewing logs |

<br>

## Features

<table>
<tr>
<td width="50%" valign="top">

### Core

- **LLM-First** &mdash; Every message hits the LLM with all 29 tools. No pre-classification, no regex routing
- **8 Safety Escapes** &mdash; `/stop` `/undo` `/clear` `/help` `/status` `/version` `/usage` `/trust` are deterministic and bypass the LLM
- **Live Context** &mdash; System prompt rebuilds after every state-changing tool call
- **Bounded Status Rewrites** &mdash; Progress and completion/failure text can be LLM-rewritten with timeout/sanitizer guards and template fallback
- **Five Harnesses** &mdash; Claude Code, Gemini CLI, Copilot CLI, OpenCode, Codex with process lifecycle management
- **P0 Reliability Hardening** &mdash; Explicit git undo workspace validation, safe timer cleanup, parsed harness progress/question/file-op events, and normalized output-event contracts
- **P1 Reliability Hardening** &mdash; Unified session-id API validation, kill-state precedence in spawner, and resilient whitelist/identity reload paths
- **P2 Reliability Hardening** &mdash; Session-scoped notification anti-repeat with TTL, bounded harness retention, identity readiness contract, Windows/backslash path normalization, singleton-reset hooks, and test-injectable session ID generation
- **Session Consistency Hardening** &mdash; Per-session write queues protect compaction/message persistence ordering; session manager init is retry-safe after transient failures
- **Structured Memory** &mdash; BM25-style keyword recall, chained compaction summaries, cross-session context
- **Notification Telemetry** &mdash; `/api/status` includes notification path/fallback counters for rewrite/template observability
- **Deterministic Repo Context** &mdash; Repo-map file selection is now stable before truncation, reducing context churn between runs
- **42 Tunable Parameters** &mdash; `FETCH_*` env vars control the pipeline via live-reading config proxies; runtime reloads apply without restart
- **Rewrite Feature Flags** &mdash; `FETCH_NOTIFICATION_REWRITE`/`FETCH_PROGRESS_REWRITE` and timeout envs bound micro-rewriter behavior with deterministic fallback

</td>
<td width="50%" valign="top">

### Tools & Capabilities

- **29 Orchestrator Tools** &mdash; Workspace management, task lifecycle, GitHub ops, web fetch, web search, browser automation
- **Web Fetch & Search** &mdash; Readability + Turndown for pages, self-hosted SearXNG for search (no API keys)
- **Web Fetch SSRF Guards** &mdash; DNS-resolved private IP blocking and redirect-hop validation for `web_fetch`
- **Browser Automation** &mdash; Headless Chromium via Playwright with accessibility tree snapshots
- **Voice & Vision** &mdash; Voice notes transcribed via whisper.cpp, image analysis via vision model
- **Vision Guardrails** &mdash; MIME allowlist and payload-size caps are enforced before outbound vision requests
- **Safe Transcription Execution** &mdash; whisper/ffmpeg invocation now uses argument-safe process execution with model-path existence checks
- **GitHub Auto-Sync** &mdash; Commits, pushes, and auto-creates repos on workspace creation
- **Skills Framework** &mdash; Teach new capabilities by dropping Markdown into `data/skills/`
- **Skills Runtime Safety** &mdash; Requirement-gated registration keeps summary/match behavior consistent, removes stale unavailable skills on reload, and escapes activated-skill blocks
- **Skill-to-Tool Mapping** &mdash; Built-in skills are aligned to concrete tool modules; see `docs/markdown/SKILLS_GUIDE.md` and `docs/markdown/API_REFERENCE.md`
- **Tool Contract Source** &mdash; `fetch-app/src/validation/tools.ts` is the canonical tool name/argument surface
- **Action-Specific Browser Validation** &mdash; `browser_action` now enforces required fields per action mode (`click` and `type`)
- **Custom Tool Reload Safety** &mdash; File-based custom tools now validate strictly on load/reload and remove stale renamed/invalid entries
- **Subsystem Ownership Maps** &mdash; `docs/markdown/API_REFERENCE.md` tracks tool, workspace, vision, and support-module ownership

</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top">

### System

- **Dynamic Identity** &mdash; Hot-reloaded personality from Markdown files
- **Crash Recovery** &mdash; State persisted to SQLite, resumes after restart
- **Persistence Corruption Guardrails** &mdash; Session/task stores now tolerate malformed persisted rows with safe fallback/skip behavior
- **Task Persistence Health Signal** &mdash; Task manager tracks whether persistence init succeeded and exposes degraded init error state
- **Status & Admin API** &mdash; Bridge exposes `/api/status`, `/api/health`, and admin-protected control/session endpoints
- **Robust WhatsApp Transport** &mdash; Event deduplication, voice/image preprocessing, reaction handling, and auto-reconnect backoff
- **10 Project Types** &mdash; Auto-detects Node, TypeScript, Python, Rust, Go, Java, Ruby, PHP, .NET with framework, package manager, and test runner profiling
- **Narrative Tool Outputs** &mdash; All tool results are human-readable text for better LLM reasoning, with structured metadata for state sync
- **Docker Hardening** &mdash; Healthchecks, resource limits, log rotation, shell injection prevention
- **Docker Timeout Control** &mdash; Timed-out exec paths attempt in-container process termination; stdin option behavior now matches API contract
- **Graceful Teardown Coverage** &mdash; Shutdown now tears down security timers and file watchers (skills, identity, custom tools, whitelist)

</td>
<td width="50%" valign="top">

### The Pack (AI Harnesses)

| Harness | Best For |
|---------|----------|
| **Claude Code** | Deep refactoring, multi-file edits, architectural analysis |
| **Gemini CLI** | Quick fixes, explanations, boilerplate generation |
| **Copilot CLI** | Shell commands, git workflows |
| **OpenCode** | Versatile coding, OpenRouter-native, general-purpose |
| **Codex** | Agentic coding with OpenAI models, JSON Lines streaming |

Harness install docs:
- GitHub CLI (host prerequisite): https://github.com/cli/cli#installation
- Copilot CLI: https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli
- Claude Code: https://docs.claude.com/en/docs/claude-code/getting-started
- Gemini CLI: https://github.com/google-gemini/gemini-cli
- OpenCode: https://opencode.ai/docs/
- Codex CLI: https://help.openai.com/en/articles/11096431-openai-codex-ci-getting-started
- Node.js/npm prerequisite: https://nodejs.org/en/download/package-manager

</td>
</tr>
</table>

<br>

## Quick Start

```bash
# 1. Install Fetch CLI
curl -fsSL https://raw.githubusercontent.com/Traves-Theberge/Fetch/main/scripts/install.sh | bash

# 2. Ensure fetch is on PATH (installer auto-updates your shell profile)
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc   # bash
# echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc  # zsh
# fish_add_path $HOME/.local/bin                           # fish

# 3. Guided setup
fetch setup --install-prereqs --install-gh-cli --install-harnesses

# 4. Configure
nano ~/.fetch/repo/.env

# 5. Start services + open TUI
fetch up
fetch tui
```

Common update commands:

```bash
fetch self update
fetch self update --channel beta
fetch self version
fetch self pin <version>
fetch self doctor --json
fetch config validate
fetch config doctor
fetch harness status
fetch harness install all
fetch uninstall
# optional deep cleanup:
fetch uninstall --with-docker --with-deps --clean-path
```

<details>
<summary><strong>Required Environment Variables</strong></summary>

<br>

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | API key from [OpenRouter](https://openrouter.ai) |
| `OWNER_PHONE_NUMBER` | Your WhatsApp number in E.164 format (e.g. `15551234567`) |

Add these to `.env` in the project root before running `deploy.sh`.
For GitHub repo operations without Copilot, set `GH_TOKEN` and keep `ENABLE_COPILOT=false`.

See [Configuration](docs/markdown/CONFIGURATION.md) for all 42 tunable parameters.

</details>

<br>

## Documentation

<table>
<tr>
<td>

| Guide | Description |
|:------|:------------|
| [Setup Guide](docs/markdown/SETUP_GUIDE.md) | Installation and first run |
| [Install & Update](docs/markdown/INSTALL_UPDATE.md) | Curl install, self-update, pinning |
| [Uninstall Guide](docs/markdown/UNINSTALL.md) | Clean removal and optional full purge |
| [Security Runbook](docs/markdown/SECURITY_RUNBOOK.md) | Production security and operational checklist |
| [TUI Guide](docs/markdown/TUI_GUIDE.md) | Manager terminal interface |
| [Commands](docs/markdown/COMMANDS.md) | Safety escapes and usage |
| [Configuration](docs/markdown/CONFIGURATION.md) | Env vars and config files |
| [Architecture](docs/markdown/ARCHITECTURE.md) | System design and data flow |
| [Harness System](docs/markdown/HARNESS_SYSTEM.md) | CLI adapter lifecycle and source responsibility index |

</td>
<td>

| Guide | Description |
|:------|:------------|
| [Identity System](docs/markdown/IDENTITY_SYSTEM.md) | Dynamic persona, prompt assembly, and identity/security source responsibilities |
| [Skills Guide](docs/markdown/SKILLS_GUIDE.md) | Building skill plugins and keeping them aligned with live tools |
| [Context Pipeline](docs/markdown/CONTEXT_PIPELINE.md) | Memory, compaction, prompt assembly |
| [State Management](docs/markdown/STATE_MANAGEMENT.md) | SQLite session/task persistence and source responsibility index |
| [API Reference](docs/markdown/API_REFERENCE.md) | Tool interfaces and endpoints |
| [Testing Guide](docs/markdown/TESTING_GUIDE.md) | Verification checklist |
| [Changelog](CHANGELOG.md) | Version history |

</td>
</tr>
</table>

<br>

## Development

<details>
<summary><strong>Bridge (TypeScript)</strong></summary>

```bash
cd fetch-app
npm install          # install dependencies
npm run dev          # run with ts-node (ESM)
npm run build        # compile TypeScript to dist/
npm run lint         # eslint
npm run test:run     # run full test suite
npm run test:unit    # unit tests only
```

Manual verification scripts (not CI tests): `fetch-app/scripts/manual/README.md`

</details>

<details>
<summary><strong>Manager (Go TUI)</strong></summary>

```bash
cd manager
go mod tidy                  # sync dependencies
go build -o fetch-manager .  # build binary
./fetch-manager              # launch TUI
bash build.sh                # cross-compile (x86_64 + arm64)
```

</details>

<details>
<summary><strong>Docker</strong></summary>

```bash
./deploy.sh                    # build images + start containers
docker compose build           # build only
docker compose up -d           # start containers
docker compose down            # stop containers
docker logs -f fetch-bridge    # stream bridge logs (QR code appears here)
```

</details>

<br>

---

<div align="center">

**MIT License**

</div>
