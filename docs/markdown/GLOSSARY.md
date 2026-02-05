# 🐕 Fetch — Glossary

> A complete dictionary of Fetch's dog-themed nomenclature and technical terms.
> Every concept in the system maps to a real-world dog metaphor.

---

## Core Concepts

| Term | Emoji | Definition |
|------|-------|------------|
| **Fetch** | 🐕 | The orchestrator agent — a "good dog" that retrieves code, answers, and results for its owner. Not an AI model itself; a routing layer that delegates to the Pack. |
| **Alpha** | 👤 | The owner/administrator — the human who commands Fetch. Defined in `data/identity/ALPHA.md`. The Alpha's word is law. |
| **The Pack** | 🐺 | The collection of available AI harnesses (Claude, Gemini, Copilot) that work together under Fetch's direction. |

## Infrastructure

| Term | Emoji | Definition |
|------|-------|------------|
| **Bridge** | 🌉 | The Node.js/TypeScript service (`fetch-bridge`) that connects WhatsApp to the AI harness system. Runs the V3.1 orchestrator, security pipeline, and all processing layers. Port 8765. |
| **Kennel** | 🏠 | The Docker sandbox container (`fetch-kennel`) where AI CLI tools execute code safely. Ubuntu 22.04 with resource limits (2 GB RAM, 2 CPUs). The dogs run free inside but can't escape. |
| **Workspace** | 📁 | A mounted project directory in `/workspace` where code lives. Each workspace is a separate repo or project. Mounted into the Kennel for AI agent access. |
| **Manager** | 🖥️ | The Go TUI application for local administration. Built with Bubble Tea. Handles start/stop, configuration, logs, QR display. |

## Identity System

| Term | Emoji | Definition |
|------|-------|------------|
| **Collar** | 🏷️ | The core identity definition file (`data/identity/COLLAR.md`). Defines Fetch's name, role, voice, directives, behavioral traits, communication style, and instinct rules. The collar makes the dog. |
| **AGENTS.md** | 📋 | The Pack registry file (`data/identity/AGENTS.md`). Defines each harness member's strengths, weaknesses, routing rules, and personality. |
| **Identity Loader** | ⚙️ | The parser that reads COLLAR.md, ALPHA.md, and AGENTS.md into the `AgentIdentity` structure at startup and on hot-reload. |

## Processing Layers

| Term | Emoji | Definition |
|------|-------|------------|
| **Instinct** | ⚡ | A hardwired deterministic behavior that fires before LLM processing. Pattern-matched, no tokens consumed. Examples: `/stop` (halt task), `/help` (show commands), `/status` (report state). 12 handlers sorted by priority. |
| **Mode** | 🔄 | Fetch's operational state machine. Five modes: ALERT 🟢 (listening), WORKING 🔵 (executing), WAITING ⏳ (pending input), GUARDING 🔴 (safety lock), RESTING 💤 (idle). Persisted to SQLite, restored on boot. |
| **Skill** | 🧩 | A modular domain-specific prompt injection loaded from `SKILL.md` files. 7 built-in (debugging, docker, fetch-meta, git, react, testing, typescript) + user-defined in `data/skills/`. Hot-reloaded via chokidar. |
| **Intent** | 🎯 | The classified purpose of a user message: `conversation` (chat), `workspace` (project management), `task` (coding work), or `clarify` (ambiguous). Determined by the Agent Core via LLM. |

## Harness System

| Term | Emoji | Definition |
|------|-------|------------|
| **Harness** | 🔗 | An adapter wrapping an AI CLI tool for standardized execution. Each harness implements `buildConfig()`, `parseOutputLine()`, `detectQuestion()`, and `extractSummary()`. |
| **The Sage** | 🦉 | Claude Code — the deep-thinking architect harness. Best for multi-file refactoring, architectural decisions, and comprehensive test suites. Calm, wise, thorough. |
| **The Scout** | ⚡ | Gemini CLI — the fast researcher harness. Best for quick fixes, explanations, boilerplate, and documentation. Quick, energetic, to-the-point. |
| **The Retriever** | 🎯 | GitHub Copilot CLI — the precise code completer harness. Best for single functions, shell commands, and GitHub operations. Quiet, efficient, precise. |
| **Harness Pool** | 🏊 | The concurrent execution manager. Limits simultaneous harness processes (default: 2) and queues additional requests. |
| **Spawner** | 🚀 | The child process spawner. Creates CLI processes with array-based arguments (safe, no shell injection) inside the Kennel. |

## Data & Persistence

| Term | Emoji | Definition |
|------|-------|------------|
| **WAL Mode** | 💾 | SQLite Write-Ahead Logging — crash-safe concurrent database access. Both `sessions.db` and `tasks.db` use WAL mode. |
| **Thread** | 🧵 | A conversation thread tracking topic, context, and message history. Automatically created, supports summarization. |
| **Session** | 📝 | A persistent conversation state tied to a WhatsApp user. Stores messages, active task, current workspace, and preferences. 7-day auto-expiry. |

## Security

| Term | Emoji | Definition |
|------|-------|------------|
| **Security Gate** | 🛡️ | The 7-layer security pipeline: Owner Verification → Whitelist Check → @fetch Trigger → Rate Limiting → Input Validation → Path Traversal Protection → Docker Isolation. |
| **@fetch Trigger** | 📢 | The required prefix for all messages. Case-insensitive. Messages without it are silently dropped. |
| **Whitelist** | ✅ | The list of trusted phone numbers authorized to interact with Fetch beyond the owner. Managed via `/trust` commands. |

## External Services

| Term | Emoji | Definition |
|------|-------|------------|
| **OpenRouter** | 🌐 | API gateway providing access to 100+ LLM models through a single endpoint (`https://openrouter.ai/api/v1`). Used for orchestration intent classification, conversation summarization, and agent reasoning. |
| **ReAct Loop** | 🔁 | Reason + Act pattern — the LLM's observe → decide → execute → reflect cycle. The agent loops through tool calls until the task is complete or blocked. |

## Tools

| Term | Emoji | Definition |
|------|-------|------------|
| **Orchestrator Tool** | 🛠️ | One of 11 built-in tools for workspace management (5), task control (4), and user interaction (2). Used by the LLM during the ReAct loop. |
| **Custom Tool** | 🔧 | A user-defined shell command tool loaded from `data/tools/*.json`. Hot-reloaded. Executed inside the Kennel. |

## Proactive System

| Term | Emoji | Definition |
|------|-------|------------|
| **Proactive System** | 👀 | Background services (polling, file watchers, scheduled tasks) that monitor without user prompts. Configured in `data/POLLING.md`. |
| **Polling Service** | ⏰ | Interval-based checks (e.g., git status every N minutes). Uses cron-parser for scheduling. |
| **Watcher Service** | 📡 | File system watchers using chokidar. Monitors identity, skills, tools, and polling config for live updates. |

---

*Glossary for Fetch v3.1.2*
