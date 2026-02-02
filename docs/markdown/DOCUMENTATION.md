# 🐕 Fetch - Comprehensive Documentation

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Security Model](#3-security-model)
4. [Installation Guide](#4-installation-guide)
5. [Configuration Reference](#5-configuration-reference)
6. [Agentic Framework](#6-agentic-framework)
7. [Tool Reference](#7-tool-reference)
8. [API Reference](#8-api-reference)
9. [Troubleshooting](#9-troubleshooting)
10. [Development Guide](#10-development-guide)

---

## 1. Overview

### 1.1 What is Fetch?

Fetch is a **headless ChatOps development environment**. It enables "programming on the go" by bridging WhatsApp messages to AI coding agents.

### 1.2 Core Philosophy

| Principle | Description |
|-----------|-------------|
| **Loyal** | Responds *only* to the owner's phone number |
| **Obedient** | Executes commands precisely within sandboxed containers |
| **Retriever** | Fetches code, logs, and answers using AI agents |

### 1.3 Key Features

- 📱 **WhatsApp Interface** — Send coding tasks via chat with `@fetch` trigger
- 🤖 **Agentic Framework** — Flexible AI agent via OpenRouter (100+ models)
- 🔄 **Model Switching** — Change models anytime via TUI (GPT-4o, Claude, Gemini, etc.)
- 🛠️ **24 Built-in Tools** — File, code, shell, git, and control operations
- 🔒 **Security-First** — 5 layers of protection
- 🐳 **Docker Isolation** — All execution in sandboxed containers
- 💾 **Session Persistence** — Survives reboots with lowdb
- 🖥️ **TUI Manager** — Beautiful terminal interface

---

## 2. Architecture

### 2.1 High-Level Overview

<!-- DIAGRAM:architecture -->

### 2.2 Component Breakdown

#### The Manager (Go TUI) - "The Collar"
- **Language:** Go 1.21+
- **Framework:** Bubble Tea + Lipgloss + Bubbles
- **Purpose:** Local administration interface
- **Layout:** Horizontal - ASCII dog mascot left, FETCH title + menu right
- **Features:**
  - Service start/stop via Docker Compose
  - Environment configuration editor
  - Real-time log viewing with viewport scrolling
  - QR code display for WhatsApp
  - OpenRouter model selector with search
  - Neofetch-style version screen
  - Documentation browser
- **Packages:**
  - `theme/` - Design system (colors, borders, styles)
  - `layout/` - Frame helpers and responsive breakpoints
  - `components/` - Reusable UI (header, splash, version, etc.)

#### The Bridge (Node.js) - "The Brain"
- **Language:** TypeScript/Node.js 20+
- **Framework:** whatsapp-web.js
- **Port:** 8765 (Status API + Documentation)
- **Purpose:** WhatsApp connection and agentic orchestration
- **Features:**
  - `@fetch` trigger gate
  - Security (whitelist, rate limiting, validation)
  - Agentic ReAct loop with GPT-4.1-nano
  - 24 built-in tools
  - Session persistence (lowdb)
  - Status API and documentation server

#### The Kennel (Docker) - "The Muscle"
- **Base:** Ubuntu 22.04
- **Purpose:** Multi-Model AI Agent Orchestrator
- **Contains:**
  - Claude Code CLI
  - Gemini CLI
  - GitHub CLI + Copilot extension
- **Role:** Sandboxed execution environment for AI coding agents

### 2.3 Data Flow

<!-- DIAGRAM:dataflow -->

### 2.4 Session State

<!-- DIAGRAM:session -->

**Why lowdb?**
- ✅ Perfect for single user
- ✅ Human-readable JSON
- ✅ Zero configuration
- ✅ Minimal resource usage

---

## 3. Security Model

Fetch implements **5 layers of security** to protect your system:

<!-- DIAGRAM:security -->

### 3.1 Layer Details

#### Layer 1: @fetch Trigger Gate
All messages must start with `@fetch` (case-insensitive):
```
@fetch fix the bug in auth.ts  ✅ Processed
fix the bug in auth.ts          ❌ Ignored
```

#### Layer 2: Whitelist Authentication
```typescript
// security/gate.ts
// Only OWNER_PHONE_NUMBER can interact
// Rejects: Groups (@g.us), Broadcasts, Non-whitelisted
// Silent drop for unauthorized (no acknowledgment)
```

#### Layer 3: Rate Limiting

| Setting | Value |
|---------|-------|
| Max Requests | 30 |
| Window | 60 seconds |
| Scope | Per phone number |

#### Layer 4: Input Validation

**Blocked Patterns:**
- `$(...)` - Command substitution
- `` `...` `` - Backtick execution
- `; rm -rf` - Destructive commands
- `| sh`, `| bash` - Pipe to shell
- `../` - Path traversal
- `eval(` - JavaScript eval

**Limits:**
- Max length: 10,000 characters

#### Layer 5: Docker Isolation

```typescript
// Commands use array-based argument passing (SAFE)
await container.exec({
  Cmd: ['claude', '--print', userPrompt],
  WorkingDir: '/workspace'
});

// Never: shell string concatenation (UNSAFE)
```

### 3.2 Authentication Tokens

| Token | Storage | Mount |
|-------|---------|-------|
| GitHub (hosts.json) | `./config/github/` | Read-only |
| Claude (config.json) | `./config/claude/` | Read-only |
| API Keys | `.env` file | Environment vars |

---

## 4. Installation Guide

### 4.1 Prerequisites

| Requirement | Version |
|-------------|---------|
| Platform | Any Linux (ARM64/x86_64) |
| Docker | 24.0+ |
| Docker Compose | v2.0+ |
| Go | 1.21+ |

### 4.2 Quick Install

```bash
# Clone repository
git clone https://github.com/Traves-Theberge/Fetch.git
cd Fetch

# Configure environment
cp .env.example .env
nano .env  # Add your API keys and phone number

# Build TUI manager
cd manager && go build -o fetch-manager . && cd ..

# Start services
docker compose up -d

# Run TUI and scan QR code
./manager/fetch-manager
```

### 4.3 GitHub Copilot Setup

Since Copilot requires browser-based OAuth:

```bash
# On a machine WITH a browser:
gh auth login

# Copy the auth file:
scp ~/.config/gh/hosts.json yourserver:~/Fetch/config/github/
```

---

## 5. Configuration Reference

### 5.1 Environment Variables

#### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `OWNER_PHONE_NUMBER` | Your WhatsApp number (no + or spaces) | `15551234567` |
| `OPENROUTER_API_KEY` | OpenRouter API key | `sk-or-v1-...` |

#### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MODEL` | `openai/gpt-4o-mini` | OpenRouter model |
| `ENABLE_CLAUDE` | `false` | Enable Claude CLI |
| `ENABLE_GEMINI` | `false` | Enable Gemini CLI |
| `ENABLE_COPILOT` | `true` | Enable Copilot CLI |
| `LOG_LEVEL` | `info` | Logging verbosity |

### 5.2 Docker Compose Configuration

```yaml
services:
  fetch-bridge:
    # WhatsApp client + orchestration
    ports:
      - "8765:8765"  # Status API + Docs
    volumes:
      - ./data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock:ro

  fetch-kennel:
    # AI CLI sandbox
    volumes:
      - ./workspace:/workspace
      - ./config/github:/root/.config/gh:ro
      - ./config/claude:/root/.config/claude:ro
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '2'
```

---

## 6. Agentic Framework

### 6.1 ReAct Loop

The agent follows the **ReAct (Reason + Act)** pattern:

<!-- DIAGRAM:react -->

### 6.2 Session Management

Each WhatsApp conversation maintains a persistent session:

```typescript
interface Session {
  id: string;                    // WhatsApp JID
  messages: Message[];           // Conversation history (last 30)
  currentTask?: AgentTask;       // Active task state
  preferences: {
    autonomyLevel: 'supervised' | 'semi-autonomous' | 'autonomous';
    autoCommit: boolean;
    verboseMode: boolean;
  };
}
```

### 6.3 Autonomy Levels

| Level | Description |
|-------|-------------|
| `supervised` | Approves ALL tool executions |
| `semi-autonomous` | Auto-approve reads, prompt for writes |
| `autonomous` | Full autonomy (prompts for destructive ops) |

Change mode: `@fetch set mode autonomous`

### 6.4 LLM Configuration

```typescript
// OpenRouter with GPT-4.1-nano
const MODEL = process.env.AGENT_MODEL || 'openai/gpt-4.1-nano';
```

**Why GPT-4.1-nano?**
- ⚡ Fast response times (~1-2s)
- 💰 Extremely low cost per token
- 🎯 Excellent at structured tool calling
- 🧠 Good reasoning for CLI-based tasks

---

## 7. Tool Reference

Fetch includes **24 built-in tools** organized into 5 categories:

<!-- DIAGRAM:tools -->

### 7.1 File Tools (5)

| Tool | Description | Auto-Approve |
|------|-------------|--------------|
| `read_file` | Read file contents | ✅ |
| `write_file` | Write content to file | ❌ |
| `edit_file` | Search & replace edit | ❌ |
| `search_files` | Search text in files | ✅ |
| `list_directory` | List directory contents | ✅ |

### 7.2 Code Tools (4)

| Tool | Description | Auto-Approve |
|------|-------------|--------------|
| `repo_map` | Get codebase structure | ✅ |
| `find_definition` | Find symbol definition | ✅ |
| `find_references` | Find symbol usages | ✅ |
| `get_diagnostics` | Get TypeScript errors | ✅ |

### 7.3 Shell Tools (3)

| Tool | Description | Auto-Approve |
|------|-------------|--------------|
| `run_command` | Execute shell command | ❌ |
| `run_tests` | Run test suite | ✅ |
| `run_lint` | Run linter | ✅ |

### 7.4 Git Tools (7)

| Tool | Description | Auto-Approve |
|------|-------------|--------------|
| `git_status` | Show git status | ✅ |
| `git_diff` | Show changes | ✅ |
| `git_commit` | Stage and commit | ❌ |
| `git_undo` | Undo last commit(s) | ❌ |
| `git_branch` | Create/list branches | ❌ |
| `git_log` | Show commit history | ✅ |
| `git_stash` | Stash/restore changes | ❌ |

### 7.5 Control Tools (5)

| Tool | Description | Auto-Approve |
|------|-------------|--------------|
| `ask_user` | Ask user a question | ✅ |
| `report_progress` | Send progress update | ✅ |
| `task_complete` | Signal completion | ✅ |
| `task_blocked` | Signal blocked | ✅ |
| `think` | Reason through problem | ✅ |

---

## 8. API Reference

### 8.1 WhatsApp Commands

All commands require the `@fetch` prefix.

#### Built-in Commands

| Command | Description |
|---------|-------------|
| `@fetch help` | Show help message |
| `@fetch status` | Show session status |
| `@fetch ping` | Connectivity test |
| `@fetch undo` | Undo last changes |
| `@fetch auto` | Enable autonomous mode |
| `@fetch supervised` | Return to supervised mode |
| `@fetch clear` | Clear conversation history |

#### Approval Responses

When asked to approve an action:

| Response | Effect |
|----------|--------|
| `yes`, `y`, `ok`, `👍` | Approve and execute |
| `no`, `n`, `nope`, `👎` | Reject action |
| `skip` | Skip this action |
| `yes all` | Approve all (switch to autonomous) |

### 8.2 Status API

**Base URL:** `http://localhost:8765`

| Endpoint | Description |
|----------|-------------|
| `GET /status` | System status JSON |
| `GET /health` | Health check |
| `GET /docs` | Documentation site |

### 8.3 Response Format

```
✅ *Task Complete*

Fixed the authentication bug in auth.ts

📝 Changes made:
• Fixed token validation logic
• Added error handling

Files modified: auth.ts
```

---

## 9. Troubleshooting

### 9.1 Common Issues

#### QR Code Not Appearing

```bash
# Check logs
docker logs fetch-bridge --tail 100

# If "Chromium lock" error:
docker compose down
sudo rm -rf ./data/.wwebjs_auth
docker compose up -d
```

#### Messages Not Received

1. Ensure messages start with `@fetch`
2. Check phone number in `.env` (no + or spaces)
3. Verify container is running: `docker ps`
4. Check logs: `docker logs fetch-bridge`

#### Permission Denied

```bash
sudo chown -R $USER:$USER ./data
```

#### Rate Limit Exceeded

Wait 60 seconds or adjust in `security/rateLimiter.ts`.

### 9.2 Reset WhatsApp Session

```bash
docker compose down
sudo rm -rf ./data/.wwebjs_auth
docker compose up -d
# Scan new QR code
```

### 9.3 Debug Mode

```bash
echo "LOG_LEVEL=debug" >> .env
docker compose restart fetch-bridge
docker logs -f fetch-bridge
```

---

## 10. Development Guide

### 10.1 Project Structure

```
fetch/
├── manager/                    # Go TUI Application
│   ├── main.go
│   └── internal/
│       ├── config/             # .env editor
│       ├── docker/             # Container control
│       ├── logs/               # Log retrieval
│       └── update/             # Git operations
│
├── fetch-app/                  # Node.js Bridge
│   └── src/
│       ├── bridge/             # WhatsApp client
│       ├── security/           # Auth, rate limiting
│       ├── agent/              # ReAct loop
│       ├── session/            # State management
│       ├── tools/              # Tool registry
│       ├── api/                # Status API
│       └── utils/              # Logger, sanitizer
│
├── kennel/                     # AI CLI container
├── docs/                       # Documentation site
├── config/                     # Auth tokens
├── workspace/                  # Code sandbox
├── data/                       # Persistent data
└── docker-compose.yml
```

### 10.2 Adding a New Tool

1. Create tool file in `fetch-app/src/tools/`:
```typescript
export const myTool: Tool = {
  name: 'my_tool',
  description: 'What it does',
  parameters: { ... },
  execute: async (args, context) => {
    // Implementation
    return { success: true, output: '...' };
  }
};
```

2. Register in `tools/registry.ts`

### 10.3 Building

```bash
# Build bridge
cd fetch-app && npm run build

# Build manager
cd manager && go build -o fetch-manager .

# Rebuild containers
docker compose up -d --build
```

---

## Appendix

### Performance Expectations

| Operation | Latency |
|-----------|---------|
| Message receive | <1s |
| Agent reasoning | 1-3s |
| Tool execution | 1-60s |

### Version History

| Version | Date | Notes |
|---------|------|-------|
| 0.1.0 | 2026-02-01 | Initial beta release |

---

*Documentation for Fetch v0.1.0*
*Last updated: February 1, 2026*
