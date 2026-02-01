# 🐕 Fetch - Comprehensive Documentation

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Security Model](#3-security-model)
4. [Installation Guide](#4-installation-guide)
5. [Configuration Reference](#5-configuration-reference)
6. [Component Deep Dive](#6-component-deep-dive)
7. [API Reference](#7-api-reference)
8. [Troubleshooting](#8-troubleshooting)
9. [Development Guide](#9-development-guide)
10. [Code Review & Analysis](#10-code-review--analysis)

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

- 📱 **WhatsApp Interface** - Send coding tasks via chat
- 🤖 **Multi-Agent Support** - Claude, Gemini, and GitHub Copilot
- 🔒 **Security-First** - Whitelist auth, input validation, rate limiting
- 🐳 **Docker Isolation** - All execution in sandboxed containers
- 📊 **Task Persistence** - Survives reboots with JSON database
- 🖥️ **TUI Manager** - Beautiful terminal interface for administration

---

## 2. Architecture

### 2.1 High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            HOST MACHINE                                  │
│                                                                          │
│  ┌──────────────────┐                                                   │
│  │   Go Manager     │     ┌─────────────────────────────────────────┐   │
│  │   (TUI)          │     │           Docker Compose                │   │
│  │                  │     │                                         │   │
│  │  ┌────────────┐  │     │  ┌─────────────┐    ┌───────────────┐  │   │
│  │  │ Start/Stop │──┼────▶│  │   Bridge    │    │    Kennel     │  │   │
│  │  │ Configure  │  │     │  │  (Node.js)  │    │   (Ubuntu)    │  │   │
│  │  │ View Logs  │  │     │  │             │    │               │  │   │
│  │  │ Update     │  │     │  │ • WhatsApp  │    │ • Claude CLI  │  │   │
│  │  └────────────┘  │     │  │ • Security  │───▶│ • Gemini CLI  │  │   │
│  │                  │     │  │ • Orchestr. │    │ • Copilot CLI │  │   │
│  └──────────────────┘     │  │ • Tasks DB  │    │               │  │   │
│                           │  └──────┬──────┘    └───────┬───────┘  │   │
│                           │         │                   │          │   │
│                           │         │    Docker Socket  │          │   │
│                           │         └───────────────────┘          │   │
│                           └─────────────────────────────────────────┘   │
│                                     │                                    │
│                                     │ Volume Mounts                      │
│                           ┌─────────┴─────────┐                         │
│                           │                   │                         │
│                      ./workspace         ./config                       │
│                      (user code)         (auth tokens)                  │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │  WhatsApp   │
                              │   (User)    │
                              └─────────────┘
```

### 2.2 Component Breakdown

#### The Manager (Go TUI) - "The Collar"
- **Language:** Go 1.21+
- **Framework:** Bubble Tea + Lipgloss
- **Purpose:** Local administration interface
- **Features:**
  - Service start/stop via Docker Compose
  - Environment configuration editor
  - Real-time log viewing
  - Git-based updates

#### The Bridge (Node.js) - "The Brain"
- **Language:** TypeScript/Node.js 20+
- **Framework:** whatsapp-web.js
- **Purpose:** WhatsApp connection and agentic orchestration
- **Features:**
  - QR code authentication
  - Security gate (whitelist, rate limiting, validation)
  - Command parsing (/commands)
  - Agentic loop with GPT-4.1-nano via OpenRouter
  - Tool execution (24 tools)
  - Session persistence (lowdb)
  - Message routing
  - Intent parsing via OpenRouter
  - Task state management

#### The Kennel (Docker) - "The Muscle"
- **Base:** Ubuntu 22.04
- **Purpose:** Sandboxed AI CLI execution
- **Contains:**
  - Claude Code CLI
  - Gemini CLI
  - GitHub CLI + Copilot extension

### 2.3 Data Flow (Agentic Architecture)

```
User (WhatsApp)
      │
      ▼
┌─────────────────┐
│  Security Gate  │ ◀── Whitelist check
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Rate Limiter   │ ◀── 30 req/min
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Input Validator │ ◀── Sanitization
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Command Parser  │ ◀── Handle /commands
└────────┬────────┘
         │ (if not a command)
         ▼
┌─────────────────┐
│  Agent Core     │ ◀── GPT-4.1-nano ReAct loop
│  (ReAct Loop)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Tool Registry   │ ◀── 24 tools (file, code, shell, git, control)
│  (Execute)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Session Manager │ ◀── Persist state (lowdb)
└────────┬────────┘
         │
         ▼
User (WhatsApp Response)
```

### 2.4 Persistence Strategy

**Why lowdb (JSON file) instead of SQL/Embeddings?**

| Factor | lowdb | SQLite | PostgreSQL | Vector DB |
|--------|-------|--------|------------|-----------|
| Single user | ✅ Perfect | Overkill | Overkill | Overkill |
| Resource use | ✅ Minimal | ✅ OK | ❌ Heavy | ❌ Heavy |
| Complexity | ✅ None | Medium | High | High |
| Human-readable | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Query needs | ✅ Simple | Complex | Complex | Semantic |

**Data stored:**
- Sessions (per WhatsApp user)
- Conversation history (last 30 messages in context)
- Active task state
- User preferences (autonomy level, auto-commit)
- Git checkpoint for undo-all

**Why no embeddings?**
- Agent already gets recent conversation history (30 messages)
- `repo_map` tool provides codebase overview on demand
- Single user = no need to search across multiple conversations
- Could add later if long-term memory becomes important

---

## 3. Security Model

### 3.1 Defense in Depth

Fetch implements **5 layers of security**:

```
Layer 1: Whitelist Authentication
    │
    ▼
Layer 2: Rate Limiting
    │
    ▼
Layer 3: Input Validation
    │
    ▼
Layer 4: Command Isolation (Docker)
    │
    ▼
Layer 5: Output Sanitization
```

### 3.2 Security Components

#### 3.2.1 Whitelist Gate (`security/gate.ts`)

```typescript
// Only OWNER_PHONE_NUMBER can interact
isAuthorized(senderId: string): boolean {
  // Rejects: Groups (@g.us), Broadcasts, Non-whitelisted
  return this.allowedNumbers.has(senderId);
}
```

**Properties:**
- Silent drop for unauthorized messages (no acknowledgment)
- Normalizes phone numbers to WhatsApp JID format
- Fails closed (errors = denial)

#### 3.2.2 Rate Limiter (`security/rateLimiter.ts`)

| Setting | Value |
|---------|-------|
| Max Requests | 30 |
| Window | 60 seconds |
| Scope | Per phone number |

#### 3.2.3 Input Validator (`security/validator.ts`)

**Blocked Patterns:**
- `$(...)` - Command substitution
- `` `...` `` - Backtick execution
- `; rm -rf` - Destructive commands
- `| sh`, `| bash` - Pipe to shell
- `eval(` - JavaScript eval
- `__proto__`, `constructor[` - Prototype pollution

**Limits:**
- Min length: 1 character
- Max length: 10,000 characters

#### 3.2.4 Docker Isolation

```typescript
// Commands are NEVER string-concatenated
// SAFE: Array-based argument passing
await container.exec({
  Cmd: ['claude', '--print', userPrompt],  // userPrompt is isolated
  WorkingDir: '/workspace'
});

// UNSAFE (never done): 
// exec(`claude --print "${userPrompt}"`)  // Shell injection risk!
```

#### 3.2.5 Output Sanitization

- Strips ANSI escape codes
- Removes progress bar artifacts
- Truncates to 4,000 characters
- Collapses excessive whitespace

### 3.3 Authentication Tokens

| Token | Storage | Mount |
|-------|---------|-------|
| GitHub (hosts.json) | `./config/github/` | Read-only |
| Claude (config.json) | `./config/claude/` | Read-only |
| API Keys | `.env` file | Environment vars |

**Security Notes:**
- All config mounts are read-only (`:ro`)
- `.env` and `config/` are in `.gitignore`
- Tokens never logged or transmitted

---

## 4. Installation Guide

### 4.1 Prerequisites

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Platform | Any Linux (ARM64/x86_64) | Same |
| OS | Ubuntu 22.04+ or Debian 12+ | Same |
| Storage | 16GB SD | 32GB+ SSD |
| Docker | 24.0+ | Latest |
| Node.js | 20.0+ | 20 LTS |
| Go | 1.21+ | Latest |

### 4.2 Quick Install

```bash
# Download and run installer
curl -fsSL https://raw.githubusercontent.com/yourusername/fetch/main/install.sh | sudo bash
```

### 4.3 Manual Installation

```bash
# 1. Clone repository
git clone https://github.com/yourusername/fetch.git
cd fetch

# 2. Configure environment
cp .env.example .env
nano .env  # Add your API keys and phone number

# 3. Build and start
docker compose up -d --build

# 4. Authenticate WhatsApp
docker logs -f fetch-bridge
# Scan the QR code with WhatsApp
```

### 4.4 GitHub Copilot Setup

Since Copilot requires browser-based OAuth:

```bash
# On a machine WITH a browser:
gh auth login

# Copy the auth file to the Pi:
scp ~/.config/gh/hosts.json pi@raspberrypi:~/fetch/config/github/
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

| Variable | Description | Default |
|----------|-------------|---------|| `AGENT_MODEL` | OpenRouter model for agentic loop | `openai/gpt-4.1-nano` || `ANTHROPIC_API_KEY` | Claude API key | - |
| `GEMINI_API_KEY` | Gemini API key | - |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `TZ` | Timezone | `UTC` |

### 5.2 Docker Compose Configuration

```yaml
services:
  fetch-bridge:
    # WhatsApp client + orchestration
    volumes:
      - ./data:/app/data              # Persistent data
      - /var/run/docker.sock:/var/run/docker.sock:ro  # Docker control

  fetch-kennel:
    # AI CLI sandbox
    volumes:
      - ./workspace:/workspace         # Code directory
      - ./config/github:/root/.config/gh:ro    # GitHub auth
      - ./config/claude:/root/.config/claude:ro # Claude config
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '2'
```

### 5.3 Claude MCP Configuration

File: `config/claude/config.json`

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git", "--repository", "/workspace"]
    }
  }
}
```

---

## 6. Component Deep Dive

### 6.1 Bridge Components

#### WhatsApp Client (`bridge/client.ts`)

Manages the WhatsApp Web connection using Puppeteer:

```typescript
new Client({
  authStrategy: new LocalAuth({
    dataPath: '/app/data/.wwebjs_auth'  // Persistent sessions
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', ...]
  }
});
```

**Event Handlers:**
- `qr` - Display QR code for authentication
- `ready` - Connection established
- `message` - Incoming message processing
- `disconnected` - Handle reconnection

#### Orchestrator (`orchestrator/index.ts`)

Uses OpenRouter to parse user intent:

```typescript
const systemPrompt = `You are Fetch, route tasks to:
- claude: Complex refactoring, code generation
- gemini: Quick explanations, documentation
- copilot: Git operations, GitHub help
- status/help: Built-in commands

Respond with JSON: {"tool": "...", "args": [...], "explanation": "..."}`;
```

**Model:** `openai/gpt-4.1-nano` via OpenRouter (fast, low-cost, accurate for routing)

#### Task Manager (`tasks/manager.ts`)

Persists task state using lowdb:

```typescript
interface Task {
  id: string;           // 8-char UUID
  status: TaskStatus;   // PENDING | IN_PROGRESS | COMPLETED | FAILED
  agent: AgentType;     // claude | gemini | copilot
  prompt: string;       // Original user message
  args: string[];       // Parsed arguments
  output?: string;      // Execution result
  createdAt: string;    // ISO timestamp
  updatedAt: string;
}
```

### 6.2 Manager Components

#### Main TUI (`main.go`)

Built with Bubble Tea framework:

```go
type model struct {
    screen        screen           // Current view
    choices       []string         // Menu items
    cursor        int              // Selected index
    bridgeRunning bool             // Container status
    kennelRunning bool
    configEditor  *config.Editor   // Embedded editor
    logLines      []string         // Log buffer
}
```

**Screens:**
1. Main Menu - Start/Stop/Configure/Logs/Update/Status
2. Config Editor - Edit .env values
3. Log Viewer - Real-time container logs
4. Status View - Container health

#### Docker Control (`internal/docker/docker.go`)

```go
func StartServices() error {
    cmd := exec.Command("docker", "compose", "up", "-d")
    cmd.Dir = projectDir
    return cmd.Run()
}

func IsContainerRunning(name string) bool {
    cmd := exec.Command("docker", "inspect", "-f", 
        "{{.State.Running}}", name)
    output, _ := cmd.Output()
    return strings.TrimSpace(string(output)) == "true"
}
```

---

## 7. API Reference

### 7.1 WhatsApp Commands

#### Slash Commands Reference

| Command | Aliases | Description |
|---------|---------|-------------|
| `/help` | `/h`, `/?` | Show help message |
| `/status` | - | Show session and task status |
| `/stop` | `/cancel` | Stop current task |
| `/pause` | - | Pause current task |
| `/resume` | `/continue` | Resume paused task |
| `/add <path>` | - | Add file to active context |
| `/drop <path>` | `/remove` | Remove file from context |
| `/files` | `/context` | List active files |
| `/clear` | `/reset` | Clear conversation history |
| `/mode <level>` | - | Set autonomy (supervised/cautious/autonomous) |
| `/auto` | `/autonomous` | Toggle autonomous mode |
| `/verbose` | - | Toggle verbose progress updates |
| `/autocommit` | - | Toggle auto-commit after changes |
| `/undo` | - | Undo last commit |
| `/undo all` | - | Undo all session commits |

#### Approval Responses

When asked to approve an action:

| Response | Effect |
|----------|--------|
| `yes`, `y`, `ok`, `approve`, `👍` | Approve and execute |
| `no`, `n`, `nope`, `reject`, `👎` | Reject action |
| `skip`, `s` | Skip this action |
| `yesall`, `yes all`, `approve all` | Approve all (switch to autonomous) |

#### Natural Language Routing

| Intent Pattern | Routed To | Examples |
|----------------|-----------|----------|
| Code changes, refactoring | Claude | "Fix the bug in auth.ts" |
| Explanations, reviews | Gemini | "Explain useEffect" |
| Git/GitHub operations | Copilot | "Why is push failing?" |

### 7.2 Task States

```
PENDING ──▶ IN_PROGRESS ──▶ COMPLETED
                │
                └──▶ FAILED
```

### 7.3 Response Format

```
✅ *Task abc123*

Fixing authentication bug in auth.ts

```
[code output here]
```
```

---

## 7.5 Agentic Architecture

Fetch includes a **low-cost autonomous agent framework** powered by **GPT-4.1-nano via OpenRouter**. This enables sophisticated multi-step task execution while keeping API costs minimal.

### 7.5.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Agent Core (ReAct Loop)                       │
│                                                                      │
│    ┌──────────┐      ┌───────────┐      ┌──────────────────────┐   │
│    │  User    │      │   LLM     │      │    Tool Registry     │   │
│    │ Message  │─────▶│  Decision │─────▶│   (24 tools)         │   │
│    └──────────┘      │  Engine   │      │                      │   │
│                      │           │      │  • File ops (5)      │   │
│    ┌──────────┐      │  GPT-4.1  │      │  • Code ops (4)      │   │
│    │ Response │◀─────│   nano    │◀─────│  • Shell ops (3)     │   │
│    │          │      │           │      │  • Git ops (7)       │   │
│    └──────────┘      └───────────┘      │  • Control (5)       │   │
│                                         └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.5.2 Session Management

Each WhatsApp conversation maintains a persistent session:

```typescript
interface Session {
  id: string;                    // WhatsApp JID
  startedAt: string;             // ISO timestamp
  lastActivity: string;          
  messages: Message[];           // Conversation history
  currentTask?: AgentTask;       // Active task state
  preferences: {
    autonomyLevel: 'supervised' | 'semi-autonomous' | 'autonomous';
    confirmDestructive: boolean;
  };
}
```

**Autonomy Levels:**
| Level | Description |
|-------|-------------|
| `supervised` | Approves ALL tool executions |
| `semi-autonomous` | Auto-approve reads, prompt for writes |
| `autonomous` | Full autonomy (still prompts for destructive ops) |

### 7.5.3 Tool Categories

| Category | Tools | Description |
|----------|-------|-------------|
| **File** | `read_file`, `write_file`, `list_directory`, `search_files`, `delete_file` | File system operations |
| **Code** | `search_code`, `analyze_code`, `run_tests`, `lint_code` | Code analysis & quality |
| **Shell** | `run_command`, `run_background`, `kill_process` | Command execution |
| **Git** | `git_status`, `git_diff`, `git_commit`, `git_push`, `git_pull`, `git_branch`, `git_log` | Version control |
| **Control** | `ask_user`, `report_progress`, `task_complete`, `task_blocked`, `request_approval` | Agent flow control |

### 7.5.4 ReAct Loop

The agent follows the **ReAct (Reason + Act)** pattern:

```
1. OBSERVE: Receive user message + context
        │
        ▼
2. THINK: LLM decides next action
        │
        ├──▶ use_tool → Execute tool → Loop back to OBSERVE
        │
        ├──▶ ask_user → Send question → Wait for response
        │
        ├──▶ complete → Send summary → End task
        │
        └──▶ blocked → Send reason → End task
```

### 7.5.5 LLM Configuration

```typescript
// OpenRouter with GPT-4.1-nano
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1'
});

const MODEL = process.env.AGENT_MODEL || 'openai/gpt-4.1-nano';
```

**Why GPT-4.1-nano?**
- ⚡ Fast response times (~1-2s)
- 💰 Extremely low cost per token
- 🎯 Excellent at structured tool calling
- 🧠 Good reasoning for CLI-based tasks

### 7.5.6 Key Files

| File | Purpose |
|------|---------|
| `agent/core.ts` | Main ReAct loop implementation |
| `agent/format.ts` | WhatsApp message formatting |
| `session/types.ts` | TypeScript interfaces |
| `session/store.ts` | lowdb persistence layer |
| `session/manager.ts` | Session lifecycle management |
| `tools/registry.ts` | Tool registration & lookup |
| `tools/types.ts` | Tool interface definitions |
| `tools/*.ts` | Individual tool implementations |

### 7.5.7 Tool API Reference

#### File Tools (5)

| Tool | Description | Parameters | Auto-Approve |
|------|-------------|------------|--------------|
| `read_file` | Read file contents | `path`, `start_line?`, `end_line?` | ✅ |
| `write_file` | Write content to file | `path`, `content` | ❌ |
| `edit_file` | Search & replace edit | `path`, `search`, `replace` | ❌ |
| `search_files` | Search text in files | `query`, `path?`, `regex?`, `max_results?` | ✅ |
| `list_directory` | List directory contents | `path?`, `recursive?`, `max_depth?` | ✅ |

#### Code Tools (4)

| Tool | Description | Parameters | Auto-Approve |
|------|-------------|------------|--------------|
| `repo_map` | Get codebase structure | `path?`, `max_depth?`, `include_signatures?` | ✅ |
| `find_definition` | Find symbol definition | `symbol`, `file_hint?` | ✅ |
| `find_references` | Find symbol usages | `symbol`, `max_results?` | ✅ |
| `get_diagnostics` | Get TypeScript errors | `path?` | ✅ |

#### Shell Tools (3)

| Tool | Description | Parameters | Auto-Approve |
|------|-------------|------------|--------------|
| `run_command` | Execute shell command | `command`, `timeout?` | ❌ |
| `run_tests` | Run test suite | `pattern?`, `coverage?` | ✅ |
| `run_lint` | Run linter | `path?`, `fix?` | ✅ (unless `fix=true`) |

#### Git Tools (7)

| Tool | Description | Parameters | Auto-Approve |
|------|-------------|------------|--------------|
| `git_status` | Show git status | - | ✅ |
| `git_diff` | Show uncommitted changes | `path?`, `staged?` | ✅ |
| `git_commit` | Stage and commit | `message`, `files?` | ❌ |
| `git_undo` | Undo last commit(s) | `hard?`, `count?` | ❌ |
| `git_branch` | Create/list branches | `name?`, `checkout?` | ❌ |
| `git_log` | Show commit history | `count?`, `oneline?` | ✅ |
| `git_stash` | Stash/restore changes | `action`, `message?` | ❌ |

#### Control Tools (5)

| Tool | Description | Parameters | Auto-Approve |
|------|-------------|------------|--------------|
| `ask_user` | Ask user a question | `question`, `options?` | ✅ |
| `report_progress` | Send progress update | `message`, `percent_complete?`, `current_step?` | ✅ |
| `task_complete` | Signal task completion | `summary`, `files_modified?`, `next_steps?` | ✅ |
| `task_blocked` | Signal task blocked | `reason`, `suggestion?`, `error_details?` | ✅ |
| `think` | Reason through problem | `thought` | ✅ |

---

## 8. Troubleshooting

### 8.1 Common Issues

#### WhatsApp QR Code Not Appearing

```bash
# Check container logs
docker logs fetch-bridge

# Verify Chromium is installed
docker exec fetch-bridge which chromium
```

**Fix:** Ensure Puppeteer dependencies are installed in Dockerfile.

#### "Execution timed out" Errors

Default timeout is 5 minutes. For long-running tasks:

```typescript
const EXECUTION_TIMEOUT = 300000;  // Increase in executor/docker.ts
```

#### Container Permission Denied

```bash
# Add user to docker group
sudo usermod -aG docker $USER
# Log out and back in
```

#### Rate Limit Exceeded

Wait 60 seconds, or adjust in `security/rateLimiter.ts`:

```typescript
new RateLimiter(60, 60000);  // 60 requests per minute
```

### 8.2 Debug Mode

Set `LOG_LEVEL=debug` in `.env` for verbose logging:

```bash
echo "LOG_LEVEL=debug" >> .env
docker compose restart fetch-bridge
docker logs -f fetch-bridge
```

### 8.3 Reset WhatsApp Session

```bash
# Clear auth data
rm -rf data/.wwebjs_auth
docker compose restart fetch-bridge
# Re-scan QR code
```

---

## 9. Development Guide

### 9.1 Local Development Setup

```bash
# Clone and setup
git clone https://github.com/yourusername/fetch.git
cd fetch
./setup-dev.sh

# Run Bridge locally (requires Docker for Kennel)
cd fetch-app
npm run dev

# Run Manager locally
cd manager
go run .
```

### 9.2 Project Structure

```
fetch/
├── manager/                    # Go TUI Application
│   ├── main.go                 # Entry point, UI logic
│   ├── go.mod                  # Go modules
│   ├── build.sh                # Build script
│   ├── fetch.service           # Systemd unit file
│   └── internal/
│       ├── config/editor.go    # .env editor
│       ├── docker/docker.go    # Container control
│       ├── logs/logs.go        # Log retrieval
│       └── update/update.go    # Git operations
│
├── fetch-app/                  # Node.js Bridge Application
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── eslint.config.js
│   └── src/
│       ├── index.ts            # Entry point
│       ├── bridge/
│       │   ├── client.ts       # WhatsApp client
│       │   └── commands.ts     # Built-in commands
│       ├── security/
│       │   ├── gate.ts         # Whitelist auth
│       │   ├── rateLimiter.ts  # Rate limiting
│       │   ├── validator.ts    # Input validation
│       │   └── index.ts        # Exports
│       ├── orchestrator/
│       │   └── index.ts        # Intent parsing
│       ├── executor/
│       │   └── docker.ts       # Container exec
│       ├── tasks/
│       │   └── manager.ts      # Task persistence
│       ├── utils/
│       │   ├── logger.ts       # Structured logging
│       │   └── sanitize.ts     # Output cleaning
│       └── types/
│           └── qrcode-terminal.d.ts
│
├── kennel/                     # AI CLI Container
│   └── Dockerfile              # Ubuntu + CLI tools
│
├── config/                     # Auth token mounts
│   ├── claude/config.json      # MCP server config
│   └── github/README.md        # Auth instructions
│
├── workspace/                  # Code sandbox (mounted)
├── data/                       # Persistent data (mounted)
│
├── docker-compose.yml          # Container orchestration
├── .env.example                # Environment template
├── .gitignore                  # Security exclusions
├── README.md                   # Quick start guide
├── DOCUMENTATION.md            # This file
├── deploy.sh                   # Production deployment
├── setup-dev.sh               # Development setup
└── install.sh                 # Linux installer
```

### 9.3 Adding a New AI Agent

1. **Update Kennel Dockerfile:**
   ```dockerfile
   RUN npm install -g @new-ai/cli
   ```

2. **Add executor method:**
   ```typescript
   // executor/docker.ts
   async runNewAgent(prompt: string): Promise<string> {
     return this.execInKennel(['new-ai', 'run', prompt]);
   }
   ```

3. **Update orchestrator routing:**
   ```typescript
   // orchestrator/index.ts
   const systemPrompt = `...
   - newagent: For specific task type
   ...`;
   
   case 'newagent':
     result = await this.executor.runNewAgent(...);
   ```

### 9.4 Testing

```bash
# TypeScript type checking
cd fetch-app && npm run build

# Linting
npm run lint

# Manual test flow
# 1. Start services: docker compose up -d
# 2. Send "ping" via WhatsApp
# 3. Verify "🏓 Pong!" response
```

---

## 10. Code Review & Analysis

### 10.1 Security Assessment

| Area | Rating | Notes |
|------|--------|-------|
| Authentication | ✅ Strong | Whitelist-only, silent drop |
| Input Handling | ✅ Strong | Validation, no shell concat |
| Rate Limiting | ✅ Good | 30/min prevents abuse |
| Secrets Management | ✅ Good | Env vars, gitignored configs |
| Container Isolation | ✅ Strong | Docker sandbox, resource limits |
| Output Handling | ✅ Good | ANSI stripped, truncated |

**Recommendations:**
1. Consider adding message signing/verification
2. Add audit logging for security events
3. Implement session timeout after inactivity

### 10.2 Code Quality Assessment

| Component | Quality | Notes |
|-----------|---------|-------|
| TypeScript Types | ✅ Excellent | Full typing, strict mode |
| Error Handling | ✅ Good | Try/catch, graceful failures |
| Logging | ✅ Good | Structured, levels supported |
| Documentation | ✅ Excellent | JSDoc comments throughout |
| Code Organization | ✅ Excellent | Clear separation of concerns |

### 10.3 Architecture Strengths

1. **Separation of Concerns**
   - Manager (admin) completely separate from Bridge (logic)
   - Security layer independent of business logic
   - Executor abstracted from orchestration

2. **Resilience**
   - Task persistence survives reboots
   - Docker restart policies
   - Graceful shutdown handlers

3. **Extensibility**
   - Easy to add new AI agents
   - Command handler pattern for built-ins
   - MCP configuration for Claude tools

### 10.4 Potential Improvements

| Area | Suggestion | Priority |
|------|------------|----------|
| Testing | Add unit tests for security layer | High |
| Monitoring | Add Prometheus metrics endpoint | Medium |
| Caching | Cache OpenRouter responses | Low |
| Multi-user | Support multiple whitelisted numbers | Low |
| Web UI | Add optional web dashboard | Low |

### 10.5 Performance Considerations

| Operation | Expected Latency |
|-----------|------------------|
| WhatsApp message receive | <1s |
| Intent parsing (OpenRouter) | 1-3s |
| Claude execution | 10-60s |
| Gemini execution | 5-30s |
| Copilot execution | 5-15s |

**Bottlenecks:**
- AI CLI execution time (unavoidable)
- Puppeteer memory usage (~300MB)

**Optimizations:**
- Kennel container kept running (no cold start)
- Output truncation prevents memory issues
- Rate limiting prevents queue buildup

---

## Appendix A: File Checksums

For integrity verification:

```bash
# Generate checksums
find . -type f \( -name "*.ts" -o -name "*.go" -o -name "*.json" \) \
  -exec sha256sum {} \; > checksums.txt
```

## Appendix B: License

MIT License - See LICENSE file

## Appendix C: Changelog

### v1.0.0 (February 2026)
- Initial release
- WhatsApp bridge with whatsapp-web.js
- Claude, Gemini, and Copilot integration
- Go TUI manager
- Docker-based architecture
- Comprehensive security layer

---

*Documentation generated for Fetch v1.0.0*
*Last updated: February 1, 2026*
