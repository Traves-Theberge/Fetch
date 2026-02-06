# 🐕 Fetch — Comprehensive Documentation (V3.2)

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Security Model](#3-security-model)
4. [Installation & Configuration](#4-installation--configuration)
5. [Agentic Framework](#5-agentic-framework)
6. [Tool Reference](#6-tool-reference)
7. [API Reference](#7-api-reference)
8. [Conversation & Threading](#8-conversation--threading)
9. [Developer Guide](#9-developer-guide)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

### 1.1 What is Fetch?

Fetch is a **headless ChatOps development environment** — a WhatsApp-driven AI coding orchestrator. It enables "programming on the go" by bridging WhatsApp messages to AI coding agents (Claude Code, Gemini CLI, GitHub Copilot CLI) running inside sandboxed Docker containers.

Fetch is not an AI model. It is a **Pack Leader** — an orchestrator that classifies intent, activates instincts, delegates complex tasks to the right AI harness, and reports results back through WhatsApp in mobile-friendly formatting.

### 1.2 Core Philosophy

| Principle | Description |
|-----------|-------------|
| **Loyal** | Responds *only* to the owner's phone number and explicitly trusted users |
| **Obedient** | Executes commands precisely within sandboxed Docker containers |
| **Retriever** | Fetches code, logs, and answers using AI agents — then brings them back |
| **Protective** | 7-layer security model with crash-recoverable state |

### 1.3 Key Features

- 📱 **WhatsApp Interface** — Send coding tasks via chat with `@fetch` trigger
- 🧠 **Four-Layer Processing** — Instinct → Mode → Skill → Agent pipeline
- 🐺 **The Pack** — Claude (🦉 The Sage), Gemini (⚡ The Scout), Copilot (🎯 The Retriever)
- 🛠️ **11 Orchestrator Tools** — Workspace (5) + Task (4) + Interaction (2)
- 🎭 **Dynamic Identity** — Hot-reloaded persona via Markdown files (COLLAR / ALPHA / agent sub-files in `data/agents/`)
- 🧩 **Skills Framework** — 7 built-in skills + user-defined skills hot-loaded from `data/skills/`
- 🗺️ **Repo Maps** — Architectural awareness of large codebases
- 🎙️ **Voice & Vision** — Transcribe voice notes and analyze screenshots
- 🔄 **Conversation Threading** — Topic detection, summarization, and context windowing
- 🔒 **7-Layer Security** — From owner verification to Docker isolation
- 💾 **SQLite Persistence** — WAL-mode databases for sessions and tasks, crash-recoverable
- 🖥️ **Go TUI Manager** — Terminal interface for local administration

---

## 2. Architecture

### 2.1 High-Level Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  WhatsApp (User)                                                     │
│    │                                                                 │
│    ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  fetch-bridge (Node.js/TypeScript)                       :8765 │ │
│  │                                                                 │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │ Security Pipeline                                        │  │ │
│  │  │  Owner → Whitelist → @fetch Gate → Rate Limit → Validate │  │ │
│  │  └──────────────────────┬───────────────────────────────────┘  │ │
│  │                         ▼                                       │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │ Four-Layer Processing Pipeline                           │  │ │
│  │  │  1. Instinct  (deterministic, no LLM)                   │  │ │
│  │  │  2. Mode      (state machine routing)                   │  │ │
│  │  │  3. Skill     (specialized prompts)                     │  │ │
│  │  │  4. Agent     (LLM + tools + harness delegation)        │  │ │
│  │  └──────────────────────┬───────────────────────────────────┘  │ │
│  │                         ▼                                       │ │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐                    │ │
│  │  │  Claude   │ │  Gemini   │ │  Copilot  │  ← Harness Pool   │ │
│  │  │  🦉 Sage  │ │  ⚡ Scout │ │  🎯 Retr  │                    │ │
│  │  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘                    │ │
│  └────────┼──────────────┼─────────────┼───────────────────────────┘ │
│           ▼              ▼             ▼                             │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  fetch-kennel (Docker)                                          │ │
│  │  Ubuntu 22.04 · Claude CLI · Gemini CLI · gh copilot           │ │
│  │  /workspace (mounted volumes)                                   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Breakdown

#### The Manager (Go TUI) — Administration

| Property | Value |
|----------|-------|
| Language | Go 1.21+ |
| Framework | Bubble Tea + Lipgloss + Bubbles |
| Purpose | Local administration interface |

Features: Service start/stop, environment configuration editor, real-time log viewing, QR code display, system status dashboard, documentation browser.

#### The Bridge (Node.js) — Orchestrator

| Property | Value |
|----------|-------|
| Language | TypeScript / Node.js 20+ |
| Framework | whatsapp-web.js |
| Port | 8765 (Status API + Documentation) |

Core Systems:
- **Instinct Layer** — 12 deterministic handlers (no LLM call)
- **Mode State Machine** — ALERT → WORKING → WAITING → GUARDING → RESTING
- **Skills Framework** — 7 built-in + user-defined hot-loaded skills
- **Identity System** — Hot-reloaded from `data/identity/`
- **Harness System** — Claude, Gemini, Copilot adapters with process pool
- **Conversation System** — Threading, summarization, topic detection
- **Proactive System** — Polling service, file/git watchers
- **11 Orchestrator Tools** — Workspace, task, and interaction management
- **Session Persistence** — SQLite with WAL mode

#### The Kennel (Docker) — Sandbox

| Property | Value |
|----------|-------|
| Base | Ubuntu 22.04 |
| Purpose | Isolated AI agent execution environment |
| Contains | Claude Code CLI, Gemini CLI, GitHub CLI + Copilot extension |
| Mount | `/workspace` (user code volumes) |
| Limits | 2 GB RAM, 2 CPUs (configurable) |

### 2.3 Four-Layer Message Processing Pipeline

Every incoming message flows through these layers in order. The first layer that produces a response short-circuits the pipeline:

```
Incoming Message
     │
     ▼
┌─────────────────────────────────────────────┐
│ Layer 1: INSTINCT                           │
│ Deterministic pattern matching. No LLM.     │
│ 12 handlers sorted by priority.             │
│ Example: "stop" → halt task immediately     │
│ Matched? → Return response, STOP pipeline   │
└──────────────────────┬──────────────────────┘
                       │ Not matched
                       ▼
┌─────────────────────────────────────────────┐
│ Layer 2: MODE                               │
│ State machine (ALERT/WORKING/WAITING/etc.)  │
│ Routes based on current operational mode.   │
│ Example: WAITING → route to task_respond    │
│ Handled? → Return response, STOP pipeline   │
└──────────────────────┬──────────────────────┘
                       │ Not handled
                       ▼
┌─────────────────────────────────────────────┐
│ Layer 3: SKILL                              │
│ Matches message against skill triggers.     │
│ Injects specialized instructions into       │
│ system prompt for the LLM.                  │
│ Example: "debug this" → debugging skill     │
└──────────────────────┬──────────────────────┘
                       │ (enriches, doesn't stop)
                       ▼
┌─────────────────────────────────────────────┐
│ Layer 4: AGENT                              │
│ Intent classification → LLM reasoning loop  │
│ Tools: 11 orchestrator tools                │
│ Delegation: Complex tasks → Harness (Pack)  │
│ Returns final response to user              │
└─────────────────────────────────────────────┘
```

### 2.4 Session & Persistence

| Database | Path | Purpose |
|----------|------|---------|
| `sessions.db` | `data/sessions.db` | Session state, messages, metadata |
| `tasks.db` | `data/tasks.db` | Task lifecycle, progress, results |

Both databases use **SQLite WAL mode** for crash-safe concurrent reads. Sessions survive container restarts with 7-day auto-expiry and cleanup.

---

## 3. Security Model

Fetch implements **7 layers of security**:

```
Layer 1: Owner Verification         "Is this the owner?"
Layer 2: Whitelist Check             "Is this a trusted user?"
Layer 3: @fetch Trigger Gate         "Did they address me?"
Layer 4: Rate Limiting               "Too many requests?"
Layer 5: Input Validation            "Is the input safe?"
Layer 6: Path Traversal Protection   "Trying to escape sandbox?"
Layer 7: Docker Isolation            "Sandboxed execution"
```

### 3.1 Layer Details

**Layer 1 — Owner Verification:** The `OWNER_PHONE_NUMBER` in `.env` is always authorized. This is the primary trust anchor.

**Layer 2 — Whitelist Check:** Additional trusted users managed via `/trust` commands. Unauthorized messages are **silently dropped**.

**Layer 3 — @fetch Trigger Gate:** All messages must contain `@fetch` (case-insensitive).

**Layer 4 — Rate Limiting:** 30 requests per 60 seconds per phone number.

**Layer 5 — Input Validation:** Blocks `$(...)`, backticks, `; rm -rf`, `| sh`, `eval(`, and more. Max 10,000 characters.

**Layer 6 — Path Traversal Protection:** No `..` sequences, all paths resolve within `/workspace`, symlink resolution checked.

**Layer 7 — Docker Isolation:** All AI agent execution runs inside `fetch-kennel` with resource limits, read-only config mounts, and array-based argument passing.

### 3.2 Authentication Tokens

| Token | Storage | Mount |
|-------|---------|-------|
| GitHub (hosts.json) | `./config/github/` | Read-only in Kennel |
| Claude (config.json) | `./config/claude/` | Read-only in Kennel |
| API Keys | `.env` file | Environment variables |

---

## 4. Installation & Configuration

### 4.1 Prerequisites

| Requirement | Version |
|-------------|---------|
| Platform | Any Linux (ARM64 / x86_64) |
| Docker | 24.0+ |
| Docker Compose | v2.0+ |
| Go | 1.21+ (for TUI manager) |

### 4.2 Quick Install

```bash
git clone https://github.com/Traves-Theberge/Fetch.git
cd Fetch
cp .env.example .env
nano .env  # Add your API keys and phone number
cd manager && go build -o fetch-manager . && cd ..
docker compose up -d
./manager/fetch-manager
```

### 4.3 Environment Variables

#### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `OWNER_PHONE_NUMBER` | Your WhatsApp number (no `+` or spaces) | `15551234567` |
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM orchestration | `sk-or-v1-...` |

#### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MODEL` | `openai/gpt-4o-mini` | OpenRouter model for orchestration |
| `SUMMARY_MODEL` | `openai/gpt-4o-mini` | Model for conversation summarization |
| `ENABLE_CLAUDE` | `false` | Enable Claude Code CLI harness |
| `ENABLE_GEMINI` | `false` | Enable Gemini CLI harness |
| `ENABLE_COPILOT` | `true` | Enable GitHub Copilot CLI harness |
| `LOG_LEVEL` | `info` | Logging verbosity |
| `TRUSTED_PHONE_NUMBERS` | _(empty)_ | Comma-separated trusted numbers |
| `DATA_DIR` | `/app/data` | Override data directory path |

---

## 5. Agentic Framework

### 5.1 Instinct Layer

Instincts are **hardwired, deterministic behaviors** that bypass LLM processing. They fire before intent classification — no tokens consumed, guaranteed consistency.

#### Registered Instincts (12 handlers)

| # | Instinct | Priority | Category | Triggers |
|---|----------|----------|----------|----------|
| 1 | `stop` | 100 | Safety | `stop`, `cancel`, `abort`, `halt` |
| 2 | `undo` | 95 | Safety | `undo`, `revert` |
| 3 | `clear` | 90 | Safety | `clear`, `reset` |
| 4 | `help` | 80 | Info | `help`, `/help`, `?` |
| 5 | `status` | 80 | Info | `status`, `/status` |
| 6 | `commands` | 75 | Info | `commands`, `/commands` |
| 7 | `whoami` | 70 | Meta | `whoami`, `who am i` |
| 8 | `identity` | 70 | Meta | `identity`, `persona` |
| 9 | `thread` | 65 | Meta | `thread`, `threads`, `context` |
| 10 | `skills` | 60 | Meta | `skills`, `/skills` |
| 11 | `tools` | 60 | Meta | `tools`, `/tools` |
| 12 | `scheduling` | 55 | Meta | `schedule`, `/schedule` |

### 5.2 Mode State Machine

```
  🟢 ALERT ◄──── default on boot
  │  Listening for commands
  │
  ├── task_create ──► 🔵 WORKING
  │                    │  Executing task
  │                    ├── ask_user ──► ⏳ WAITING (awaiting input)
  │                    │                │
  │                    │  ◄── respond ──┘
  │                    ├── complete ──► 🟢 ALERT
  │                    └── fail ──────► 🟢 ALERT
  │
  └── dangerous op ──► 🔴 GUARDING (safety lock)
                        ├── approve ──► execute
                        └── reject ───► 🟢 ALERT
```

Mode state is persisted to SQLite and restored on boot. Stuck modes auto-reset to ALERT on restart.

### 5.3 Skills Framework

Skills inject domain-specific context into the LLM's system prompt.

#### Built-in Skills (7)

| Skill | Purpose |
|-------|---------|
| `debugging` | Systematic debugging methodology |
| `docker` | Container management patterns |
| `fetch-meta` | Self-modification of Fetch itself |
| `git` | Git workflow best practices |
| `react` | React/frontend development |
| `testing` | Test writing and TDD |
| `typescript` | TypeScript patterns and best practices |

#### User-Defined Skills

Create custom skills in `data/skills/<name>/SKILL.md` with YAML frontmatter. Hot-reloaded via `chokidar` — no restart needed.

### 5.4 Identity System

| File | Purpose | Hot-Reloaded |
|------|---------|--------------|
| `data/identity/COLLAR.md` | Core identity — name, role, voice, directives, behavioral rules | ✅ |
| `data/identity/ALPHA.md` | Owner/administrator profile and preferences | ✅ |
| `data/agents/*.md` | Individual pack member profiles with YAML frontmatter (`PackMember` interface) | ✅ |
| `data/agents/ROUTING.md` | Pack routing rules and selection logic | ✅ |

> **v3.2.0 Change:** `data/identity/AGENTS.md` is deprecated. Pack members now have individual files
> in `data/agents/` parsed by `gray-matter`. The single source of truth for system prompt assembly
> is `IdentityManager.buildSystemPrompt()`.

### 5.5 Harness System (The Pack)

| Harness | Emoji | CLI | Role | Best For |
|---------|-------|-----|------|----------|
| `claude` | 🦉 | `claude` | The Sage | Multi-file refactoring, architecture, test suites |
| `gemini` | ⚡ | `gemini` | The Scout | Quick fixes, explanations, boilerplate |
| `copilot` | 🎯 | `gh copilot` | The Retriever | Single functions, shell commands, GitHub ops |

**Manual Override:** `@fetch use claude: <task>` / `@fetch use gemini: <task>` / `@fetch use copilot: <task>`

### 5.6 Intent Classification

| Intent | Description | Handling |
|--------|-------------|----------|
| 💬 `conversation` | Greetings, thanks, casual chat | Direct LLM response |
| 📁 `workspace` | Project management, status | Orchestrator tools |
| 🚀 `task` | Complex coding work | Delegate to harness |
| ❓ `clarify` | Ambiguous — needs more info | Ask user |

---

## 6. Tool Reference

### 6.1 Workspace Tools (5)

| Tool | Danger | Description |
|------|--------|-------------|
| `workspace_list` | Safe | List all workspaces |
| `workspace_select` | Safe | Set active workspace |
| `workspace_status` | Safe | Git status and details |
| `workspace_create` | Moderate | Create workspace with template |
| `workspace_delete` | Dangerous | Delete workspace directory |

### 6.2 Task Tools (4)

| Tool | Danger | Description |
|------|--------|-------------|
| `task_create` | Moderate | Create and start a coding task |
| `task_status` | Safe | Check task status |
| `task_cancel` | Moderate | Cancel running/queued task |
| `task_respond` | Safe | Send response to waiting task |

### 6.3 Interaction Tools (2)

| Tool | Danger | Description |
|------|--------|-------------|
| `ask_user` | Safe | Pause and ask user a question |
| `report_progress` | Safe | Send progress update |

### 6.4 Custom Tools

Users can define shell-based custom tools in `data/tools/*.json`. Hot-loaded via file watching.

---

## 7. API Reference

### 7.1 Status API

**Base URL:** `http://localhost:8765`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/status` | Current bridge status (JSON) |
| `GET` | `/docs/*` | Documentation site (static HTML) |

### 7.2 WhatsApp Commands

| Command | Description |
|---------|-------------|
| `@fetch help` | Show help message |
| `@fetch status` | System and task status |
| `@fetch commands` | List available commands |
| `@fetch stop` | Halt current task |
| `@fetch undo` | Revert last changes |
| `@fetch clear` | Clear conversation history |
| `@fetch whoami` | Show identity info |
| `@fetch tools` | List available tools |
| `@fetch skills` | List loaded skills |
| `@fetch threads` | Show conversation threads |
| `/trust add <num>` | Add trusted number (owner only) |
| `/trust remove <num>` | Remove trusted number |
| `/trust list` | Show trusted numbers |

---

## 8. Conversation & Threading

### 8.1 Thread Management

Threads track conversation context over time with topic detection and automatic summarization every 20 messages.

### 8.2 Conversation Modes

| Mode | Description |
|------|-------------|
| `CHAT` | Casual conversation, Q&A |
| `EXPLORATION` | Asking about codebase or capabilities |
| `TASK` | Specific work requested |
| `COLLABORATION` | Working together ("let's", "we should") |
| `TEACHING` | Explaining a concept ("teach me") |

---

## 9. Developer Guide

### 9.1 Project Structure

```
Fetch/
├── manager/                        # Go TUI Application
│   ├── main.go
│   └── internal/
│       ├── components/             # Reusable UI components
│       ├── config/                 # .env editor
│       ├── docker/                 # Container control
│       ├── layout/                 # Frame helpers
│       ├── models/                 # Bubble Tea models
│       ├── paths/                  # Path resolution
│       ├── status/                 # Status display
│       └── theme/                  # Design system
│
├── fetch-app/                      # Node.js Bridge (TypeScript)
│   └── src/
│       ├── index.ts                # Entry point
│       ├── agent/                  # Core Agent (orchestrator, intent, prompts)
│       ├── instincts/              # Instinct Layer (12 handlers)
│       ├── modes/                  # Mode State Machine
│       ├── skills/                 # Skills Framework (7 built-in)
│       ├── identity/               # Identity System (COLLAR/ALPHA + data/agents/)
│       ├── harness/                # Harness System (Claude/Gemini/Copilot)
│       ├── tools/                  # Orchestrator Tools (11)
│       ├── conversation/           # Threading & Summarization
│       ├── proactive/              # Polling & File Watchers
│       ├── session/                # Session Persistence (SQLite)
│       ├── task/                   # Task Lifecycle
│       ├── security/               # 7-Layer Security Pipeline
│       ├── config/                 # Centralized path configuration
│       ├── handler/                # Message entry point
│       ├── bridge/                 # WhatsApp client wrapper
│       ├── api/                    # Status server (:8765)
│       ├── workspace/              # Workspace management
│       ├── validation/             # Zod schemas
│       ├── transcription/          # Voice note transcription
│       ├── vision/                 # Image analysis
│       └── utils/                  # Logger, sanitizer, helpers
│
├── kennel/                         # Docker sandbox definition
├── data/                           # Persistent data (volume-mounted)
│   ├── identity/                   # COLLAR.md, ALPHA.md
│   ├── agents/                     # Pack member sub-files (claude.md, gemini.md, copilot.md, ROUTING.md)
│   ├── skills/                     # User-defined skills
│   ├── tools/                      # Custom tool definitions
│   ├── sessions.db                 # Session database (SQLite WAL)
│   ├── tasks.db                    # Task database (SQLite WAL)
│   └── POLLING.md                  # Polling configuration
│
├── config/                         # Authentication tokens
├── workspace/                      # Code sandbox (mounted into Kennel)
├── docs/                           # Documentation site
└── docker-compose.yml              # Service orchestration
```

### 9.2 Adding a New Instinct

Create a file in `fetch-app/src/instincts/` and register it in `index.ts`:

```typescript
export const myInstinct: Instinct = {
  name: 'my-instinct',
  description: 'What this instinct does',
  triggers: ['trigger1', '/trigger1'],
  patterns: [/^trigger1\s*$/i],
  priority: 50,
  enabled: true,
  category: 'custom',
  handler: (ctx) => ({
    matched: true,
    response: '🎯 Custom instinct response!',
    continueProcessing: false,
  }),
};
```

### 9.3 Adding a New Skill

Create `data/skills/<name>/SKILL.md` with YAML frontmatter:

```markdown
---
name: My Skill
description: Domain-specific knowledge
triggers:
  - keyword1
  - keyword2
---

# My Skill Instructions
Your specialized prompt content here...
```

### 9.4 Building

```bash
cd fetch-app && npm run build        # Build bridge
cd manager && go build -o fetch-manager .  # Build TUI
docker compose up -d --build         # Rebuild containers
cd fetch-app && npm test             # Run tests
```

---

## 10. Troubleshooting

| Problem | Solution |
|---------|----------|
| QR code not appearing | `docker logs fetch-bridge --tail 100` |
| Messages not received | Check `OWNER_PHONE_NUMBER` (no `+`), verify `@fetch` prefix |
| Mode stuck in WORKING | `docker compose restart fetch-bridge` or `@fetch stop` |
| Harness not responding | `docker ps \| grep kennel`, check auth with `docker exec` |
| Permission denied | `sudo chown -R $USER:$USER ./data ./workspace ./config` |
| Rate limited | Wait 60 seconds for window reset |
| Chromium lock | `sudo rm -rf ./data/.wwebjs_auth && docker compose up -d` |

---

*Documentation for Fetch v3.2.0 — Last updated: February 5, 2026*
