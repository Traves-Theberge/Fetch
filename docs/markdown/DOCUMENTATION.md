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
- 🧠 **V3 Pack Leader Architecture** — Orchestrator system with Instincts, Skills, and Modes
- 🗺️ **Repo Maps** — Architectural awareness of large projects
- 🎙️ **Voice & Vision** — Transcribe voice notes and analyze screenshots
- 🌊 **Streaming** — Real-time progress updates for long tasks
- 🤖 **Harness System** — Plug-in adapters for Claude, Gemini, Copilot CLIs
- 🎭 **Dynamic Identity** — Customizable persona via hot-reloaded Markdown files (Collar/Alpha)
- 🧩 **Skills Framework** — Teach Fetch new capabilities on the fly
- 🔄 **Model Switching** — Change models anytime via TUI (GPT-4o, Claude, Gemini, etc.)
- 🛠️ **11 Orchestrator Tools** — Workspace (5), task (4), interaction (2)
- 🛡️ **Guarding Mode** — Safety locks for high-impact actions
- 📁 **Project Management** — Clone, init, switch between projects
- 🔒 **Security-First** — 6 layers of protection
- 🐳 **Docker Isolation** — All execution in sandboxed containers
- 💾 **Session Persistence** — Survives reboots with SQLite
- 🖥️ **TUI Manager** — Beautiful terminal interface

---

## 2. Architecture

### 2.1 High-Level Overview

<!-- DIAGRAM:architecture -->

### 2.2 Component Breakdown

#### The Manager (Go TUI) - "Administration"
- **Language:** Go 1.21+
- **Framework:** Bubble Tea + Lipgloss + Bubbles
- **Purpose:** Local administration interface
- **Layout:** Horizontal - Dashboard left, Menu right
- **Features:**
  - Service start/stop via Docker Compose
  - Environment configuration editor
  - Real-time log viewing with viewport scrolling
  - QR code display for WhatsApp
  - OpenRouter model selector with search
  - System status screen
  - Documentation browser
- **Packages:**
  - `theme/` - Design system (colors, borders, styles)
  - `layout/` - Frame helpers and responsive breakpoints
  - `components/` - Reusable UI (header, splash, version, etc.)

#### The Bridge (Node.js) - "The Orchestrator"
- **Language:** TypeScript/Node.js 20+
- **Framework:** whatsapp-web.js
- **Port:** 8765 (Status API + Documentation)
- **Purpose:** WhatsApp connection and V3 orchestration
- **Features:**
  - `@fetch` trigger gate
  - Security (whitelist, rate limiting, validation)
  - **V3 State Machine Modes:**
    - 🟢 ALERT — Listening for commands (Default)
    - 🔵 WORKING — Active task execution
    - 🟠 WAITING — Paused for user input
    - 🔴 GUARDING — Safety lock for dangerous actions
    - 💤 RESTING — Idle state
  - **Harness System:**
    - Claude CLI adapter
    - Gemini CLI adapter
    - Copilot CLI adapter
  - 11 orchestrator tools
  - Project management (clone, init, switch)
  - Session persistence (SQLite)
  - Status API and documentation server

<!-- DIAGRAM:messageflow -->

#### The Sandbox (Docker) - "Execution Environment"
- **Base:** Ubuntu 22.04
- **Purpose:** Multi-Model AI Agent Execution
- **Contains:**
  - Claude Code CLI
  - Gemini CLI
  - GitHub CLI + Copilot extension
- **Role:** Sandboxed execution environment for AI coding agents

<!-- DIAGRAM:harness -->

### 2.3 Data Flow

<!-- DIAGRAM:dataflow -->

### 2.4 Session State

<!-- DIAGRAM:session -->

**Why SQLite?**
- ✅ Perfect for single user
- ✅ ACID compliant & crash-safe
- ✅ Zero configuration
- ✅ Minimal resource usage
- ✅ WAL mode for better concurrency

---

## 3. Security Model

Fetch implements **7 layers of security** to protect your system:

<!-- DIAGRAM:security -->

### 3.1 Layer Details

#### Layer 1: @fetch Trigger Gate
All messages must start with `@fetch` (case-insensitive):
```
@fetch fix the bug in auth.ts  ✅ Processed
fix the bug in auth.ts          ❌ Ignored
```

#### Layer 2: Zero Trust Bonding (Whitelist)
```typescript
// security/gate.ts + security/whitelist.ts
// "Fetch securely authenticates the owner and authorized users."
//
// Authorization Flow:
//   1. Is sender the owner? → ALLOW (always exempt)
//   2. Is sender in whitelist? → ALLOW
//   3. Otherwise → DROP (silent, no response)
//
// Whitelist Management (owner only):
//   /trust add <number>    - Add trusted number
//   /trust remove <number> - Remove trusted number
//   /trust list            - Show all trusted numbers
//
// Configuration:
//   TRUSTED_PHONE_NUMBERS=15551234567,15559876543 (in .env)
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

#### Layer 5: Tool Argument Validation (Zod)

```typescript
// All tool arguments validated with Zod schemas
import { validateToolArgs } from './tools/schemas.js';

const validation = validateToolArgs('read_file', args);
if (!validation.success) {
  return { error: validation.error };  // Returns detailed validation message
}
```

**Validation Rules:**
- **SafePath** - No `..`, must be in `/workspace`
- **Numeric coercion** - Strings auto-converted to numbers
- **Required fields** - Missing fields caught early
- **Range validation** - `start_line <= end_line`
- **Length limits** - Commands max 10,000 chars

#### Layer 6: Docker Isolation

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
  currentProject?: ProjectContext; // Active project
  availableProjects: string[];   // Projects in /workspace
  preferences: {
    autonomyLevel: 'supervised' | 'semi-autonomous' | 'autonomous';
    autoCommit: boolean;
    verboseMode: boolean;
  };
}

interface ProjectContext {
  name: string;                  // Directory name
  path: string;                  // Full path in /workspace
  type?: string;                 // node, python, go, etc.
  gitBranch?: string;            // Current git branch
  gitStatus?: string;            // Clean/dirty indicator
}
```

### 6.3 Intent Classification (V2)

Messages are routed based on detected intent:

```typescript
type IntentType = 'conversation' | 'workspace' | 'task';

function classifyIntent(message: string): IntentClassification {
  // Greeting patterns → conversation (direct response)
  // "list projects", "show status", "switch to" → workspace (orchestrator tools)
  // "build", "create", "fix", "refactor" → task (delegated to harness)
}
```

| Intent | Description | Handling |
|--------|-------------|----------|
| 💬 Conversation | Greetings, thanks, chat | Direct LLM response, no tools |
| 📁 Workspace | Project management | 8 orchestrator tools |
| 🚀 Task | Complex coding work | Delegate to harness (Claude/Gemini/Copilot) |

### 6.4 Harness System (V2)

Tasks are delegated to AI CLI tools via the harness system:

```typescript
interface HarnessAdapter {
  name: string;           // 'claude', 'gemini', 'copilot'
  executable: string;     // CLI command
  
  buildConfig(task: TaskConfig): HarnessConfig;
  parseOutputLine(line: string): ParsedOutput;
  detectQuestion(line: string): boolean;
  extractSummary(output: string): string;
}
```

**Available Harnesses:**

| Harness | CLI | Best For |
|---------|-----|----------|
| `claude` | `claude` | Complex coding, refactoring |
| `gemini` | `gemini` | Code analysis, explanations |
| `copilot` | `gh copilot suggest` | Quick suggestions, commands |

### 6.5 Autonomy Levels

| Level | Description |
|-------|-------------|
| `supervised` | Approves ALL tool executions |
| `semi-autonomous` | Auto-approve reads, prompt for writes |
| `autonomous` | Full autonomy (prompts for destructive ops) |

Change mode: `@fetch set mode autonomous`

### 6.6 LLM Configuration

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

The V2 orchestrator uses **11 focused tools** for workspace management. Complex tasks are delegated to harnesses.

<!-- DIAGRAM:tools -->

### 7.1 Orchestrator Tools (11)

| Tool | Description | Auto-Approve |
|------|-------------|--------------|
| `list_workspaces` | List available projects | ✅ |
| `get_workspace_info` | Get project details | ✅ |
| `switch_workspace` | Change active project | ✅ |
| `create_workspace` | Initialize new project | ❌ |
| `clone_repository` | Clone from git URL | ❌ |
| `get_git_status` | Show git status | ✅ |
| `get_git_diff` | Show file changes | ✅ |
| `get_git_log` | Show commit history | ✅ |

### 7.2 Harness Capabilities

When tasks are delegated to harnesses (Claude, Gemini, Copilot), they have full access to:
- File reading and writing
- Code analysis and refactoring
- Shell command execution
- Git operations
- Test running and debugging

The harness system provides:
- **Output Parsing** — Structured extraction of results
- **Question Detection** — Identifies when AI needs input
- **Progress Tracking** — Monitors task completion
- **Error Handling** — Circuit breaker for failures

### 7.3 File Tools (Legacy Reference)

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

#### System Commands

| Command | Description |
|---------|-------------|
| `@fetch help` | Show help message |
| `@fetch ping` | Connectivity test |
| `@fetch task` | Show task status |

#### Project Commands

| Command | Description |
|---------|-------------|
| `@fetch /projects` | List available projects |
| `@fetch /project <name>` | Switch to project |
| `@fetch /clone <url>` | Clone a repository |
| `@fetch /init <name>` | Initialize new project |
| `@fetch /status` | Git status |
| `@fetch /diff` | Show uncommitted changes |
| `@fetch /log [n]` | Show recent commits |

#### Control Commands

| Command | Description |
|---------|-------------|
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
│       ├── agent/              # Core agent system
│       │   ├── core.ts         # Main orchestrator
│       │   ├── intent.ts       # Intent classification
│       │   ├── conversation.ts # Chat mode handler
│       │   ├── inquiry.ts      # Read-only mode
│       │   ├── action.ts       # Single-edit mode
│       │   ├── prompts.ts      # Centralized prompts
│       │   ├── format.ts       # Message formatting
│       │   └── whatsapp-format.ts # Mobile formatting
│       ├── session/            # State management
│       │   ├── types.ts        # TypeScript interfaces
│       │   ├── store.ts        # SQLite persistence
│       │   ├── manager.ts      # Session lifecycle
│       │   └── project.ts      # Project scanner
│       ├── commands/           # Command parser
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
| 0.2.0 | 2026-02-02 | 4-mode architecture, project management |
| 0.1.0 | 2026-02-01 | Initial beta release |

---

*Documentation for Fetch v0.2.0*
*Last updated: February 2, 2026*
