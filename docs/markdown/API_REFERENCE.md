# Fetch - API Reference

Complete API documentation for Fetch's tools, endpoints, and integrations.

---

## Table of Contents

1. [Orchestrator Tools (11)](#1-orchestrator-tools-11)
2. [WhatsApp Protocol](#2-whatsapp-protocol)
3. [Security API](#3-security-api)
4. [Agent API](#4-agent-api)
5. [Harness System](#5-harness-system)
6. [Session API](#6-session-api)
7. [Status API](#7-status-api)
8. [Environment Variables](#8-environment-variables)
9. [Error Codes](#9-error-codes)

---

## 1. Orchestrator Tools (11)

Fetch uses **11 orchestrator tools** organized into three categories:

### 1.1 Workspace Tools (5)

| Tool | Description | Parameters | Auto-Approve |
|------|-------------|------------|--------------|
| `workspace_list` | List all projects in /workspace | — | ✅ |
| `workspace_select` | Select active project | `name: string` | ✅ |
| `workspace_status` | Get git status, branch, changes | — | ✅ |
| `workspace_create` | Create new project | `name`, `template?`, `description?`, `initGit?` | ❌ |
| `workspace_delete` | Delete a project | `name`, `confirm: true` (required) | ❌ |

#### workspace_list

Lists all available workspaces/projects in the `/workspace` directory.

```typescript
// Input
interface WorkspaceListInput {
  // No parameters required
}

// Output
{
  success: true,
  output: "📁 Available projects:\n• my-app\n• api-server\n• web-client"
}
```

#### workspace_select

Selects a workspace as the active project for subsequent operations.

```typescript
// Input
interface WorkspaceSelectInput {
  name: string;  // Project name (must exist in /workspace)
}

// Output
{
  success: true,
  output: "✅ Switched to my-app\n🌿 Branch: main\n📝 3 uncommitted changes"
}
```

#### workspace_status

Gets the current git status of the active workspace.

```typescript
// Input
interface WorkspaceStatusInput {
  // No parameters required (uses active workspace)
}

// Output
{
  success: true,
  output: "📂 my-app\n🌿 main\n📝 Modified: src/index.ts, package.json"
}
```

#### workspace_create

Creates a new project with optional template scaffolding.

```typescript
// Input
interface WorkspaceCreateInput {
  name: string;        // Project name
  template?: string;   // Template: empty, node, python, rust, go, react, next
  description?: string; // Optional project description
  initGit?: boolean;   // Initialize git repo (default: true)
}

// Templates available:
// - empty: Just README.md
// - node: package.json, index.js, .gitignore
// - python: main.py, requirements.txt
// - rust: Cargo.toml, src/main.rs
// - go: go.mod, main.go
// - react: Vite React project scaffold
// - next: Next.js project scaffold

// Output
{
  success: true,
  output: "✅ Created my-app with node template\n📁 /workspace/my-app\n🌿 Git initialized"
}
```

#### workspace_delete

Deletes a project permanently. Requires explicit confirmation.

```typescript
// Input
interface WorkspaceDeleteInput {
  name: string;      // Project name to delete
  confirm: true;     // MUST be true (safety check)
}

// Output
{
  success: true,
  output: "✅ Deleted my-app"
}

// Error (if confirm !== true)
{
  success: false,
  error: "Deletion requires explicit confirmation"
}
```

---

### 1.2 Task Tools (4)

| Tool | Description | Parameters | Auto-Approve |
|------|-------------|------------|--------------|
| `task_create` | Start a coding task | `goal: string`, `agent?`, `files?` | ❌ |
| `task_status` | Get task progress | `taskId?` | ✅ |
| `task_cancel` | Cancel running task | `taskId?` | ❌ |
| `task_respond` | Answer agent question | `response: string` | ✅ |

#### task_create

Creates a new coding task and delegates to a harness (Claude, Gemini, or Copilot).

```typescript
// Input
interface TaskCreateInput {
  goal: string;        // Task description/goal
  agent?: string;      // Preferred agent: 'claude' | 'gemini' | 'copilot'
  files?: string[];    // Files to include in context
}

// Output
{
  success: true,
  output: "🚀 Task started: tsk_abc123\nGoal: Add authentication to the API\nAgent: claude"
}
```

#### task_status

Gets the current status of an active or recent task.

```typescript
// Input
interface TaskStatusInput {
  taskId?: string;   // Optional task ID (defaults to current task)
}

// Output
{
  success: true,
  output: "📊 Task: tsk_abc123\nStatus: running\nProgress: 45%\nCurrent: Creating auth middleware..."
}
```

#### task_cancel

Cancels a running task.

```typescript
// Input
interface TaskCancelInput {
  taskId?: string;   // Optional task ID (defaults to current task)
}

// Output
{
  success: true,
  output: "⏹️ Task tsk_abc123 cancelled"
}
```

#### task_respond

Responds to a question from the agent during task execution.

```typescript
// Input
interface TaskRespondInput {
  response: string;  // Answer to the agent's question
}

// Output
{
  success: true,
  output: "✅ Response sent to agent"
}
```

---

### 1.3 Interaction Tools (2)

| Tool | Description | Parameters | Auto-Approve |
|------|-------------|------------|--------------|
| `ask_user` | Ask user a clarifying question | `question: string`, `options?` | ✅ |
| `report_progress` | Report task progress | `message: string`, `percent?`, `files?` | ✅ |

#### ask_user

Asks the user a clarifying question during task processing.

```typescript
// Input
interface AskUserInput {
  question: string;    // Question to ask
  options?: string[];  // Optional multiple choice options
}

// Output (sent to WhatsApp)
"🐕 Quick question!\n\nShould I use JWT or session-based auth?\n\n1. JWT\n2. Sessions"
```

#### report_progress

Reports progress during long-running tasks.

```typescript
// Input
interface ReportProgressInput {
  message: string;     // Progress message
  percent?: number;    // Optional progress percentage (0-100)
  files?: string[];    // Optional list of files changed
}

// Output (sent to WhatsApp)
"📊 Progress: 60%\n\nCreating user model...\n\n📁 Changed: src/models/user.ts"
```

---

## 2. WhatsApp Protocol

### 2.1 Message Format

```typescript
interface IncomingMessage {
  from: string;          // Sender JID (e.g., "15551234567@c.us")
  body: string;          // Message text
  timestamp: number;     // Unix timestamp
  isGroupMsg: boolean;   // True if from group chat
  participant?: string;  // Sender in group (for verification)
}
```

### 2.2 @fetch Trigger

All messages must start with `@fetch` (case-insensitive):

```typescript
const TRIGGER = '@fetch';

// Validation
const isFetchMessage = (body: string): boolean => {
  return body.toLowerCase().startsWith(TRIGGER);
};

// Command extraction
const extractCommand = (body: string): string => {
  return body.slice(TRIGGER.length).trim();
};
```

### 2.3 Response Formatting

Responses are formatted for WhatsApp readability:

```
[Status emoji] [One-line summary]

[Key details - 2-3 lines max]

[Next action or question]
```

---

## 3. Security API

### 3.1 Security Gate

**File:** `fetch-app/src/security/gate.ts`

```typescript
class SecurityGate {
  constructor(ownerNumber: string)
  
  // Check if message should be processed
  isAllowed(message: Message): boolean
  
  // Check if sender is the owner
  isOwner(senderId: string, participantId?: string): boolean
}
```

### 3.2 Rate Limiter

**File:** `fetch-app/src/security/rateLimiter.ts`

```typescript
class RateLimiter {
  constructor(maxRequests: number = 30, windowMs: number = 60000)
  
  isAllowed(key: string): boolean
  getRemainingRequests(key: string): number
  reset(key: string): void
}
```

| Setting | Default |
|---------|---------|
| Max Requests | 30 per minute |
| Window | 60 seconds |

### 3.3 Input Validator

**Blocked Patterns:**

| Pattern | Risk |
|---------|------|
| `$(...)` | Command substitution |
| `` `...` `` | Backtick execution |
| `; rm`, `&& rm` | Shell injection |
| `\| sh`, `\| bash` | Pipe to shell |
| `../` | Path traversal |
| `eval(` | JavaScript eval |
| `__proto__` | Prototype pollution |

---

## 4. Agent API

### 4.1 Intent Classification

**File:** `fetch-app/src/agent/intent.ts`

```typescript
type IntentType = 'conversation' | 'workspace' | 'task';

interface IntentClassification {
  intent: IntentType;
  confidence: number;
  reasoning: string;
}

function classifyIntent(message: string): IntentClassification
```

**Intent Types:**

| Intent | Description | Examples |
|--------|-------------|----------|
| `conversation` | Casual chat, greetings | "Hello!", "Thanks" |
| `workspace` | Project management | "List projects", "Status" |
| `task` | Complex coding work | "Build a REST API", "Fix this bug" |

### 4.2 Agent Core (Orchestrator)

**File:** `fetch-app/src/agent/core.ts`

```typescript
class AgentCore {
  constructor(session: Session, toolRegistry: ToolRegistry)
  
  // Process a user message through intent classification
  async processMessage(message: string): Promise<string[]>
}
```

### 4.3 Prompts

**File:** `fetch-app/src/agent/prompts.ts`

| Constant | Purpose |
|----------|---------|
| `CORE_IDENTITY` | Fetch's personality and ethics |
| `CAPABILITIES` | What Fetch can do |
| `TOOL_REFERENCE` | Complete tool documentation |
| `UNDERSTANDING_PATTERNS` | How to interpret vague requests |

---

## 5. Harness System

### 5.1 Harness Interface

**File:** `fetch-app/src/harness/types.ts`

```typescript
interface HarnessAdapter {
  name: string;
  executable: string;
  
  buildConfig(task: TaskConfig): HarnessConfig;
  parseOutputLine(line: string): ParsedOutput;
  detectQuestion(line: string): boolean;
  extractSummary(output: string): string;
}
```

### 5.2 Available Harnesses

| Harness | CLI | Description | Best For |
|---------|-----|-------------|----------|
| `claude` | `claude --print` | Anthropic Claude Code | Complex refactoring, multi-file |
| `gemini` | `gemini` | Google Gemini CLI | Quick edits, explanations |
| `copilot` | `gh copilot suggest` | GitHub Copilot | Suggestions, commands |

### 5.3 Harness Registry

**File:** `fetch-app/src/harness/registry.ts`

```typescript
class HarnessRegistry {
  get(name: string): HarnessAdapter | undefined;
  has(name: string): boolean;
  execute(name: string, config: HarnessConfig): Promise<HarnessResult>;
  listAdapters(): HarnessAdapter[];
}
```

### 5.4 Harness Execution

**File:** `fetch-app/src/harness/executor.ts`

```typescript
class HarnessExecutor extends EventEmitter {
  registerAdapter(adapter: HarnessAdapter): void;
  execute(execution: HarnessExecution): Promise<HarnessResult>;
  sendInput(executionId: string, input: string): void;
  cancel(executionId: string): void;
}
```

---

## 6. Session API

### 6.1 Session Store

**File:** `fetch-app/src/session/store.ts`

```typescript
class SessionStore {
  constructor(dbPath: string = '/app/data/sessions.db')
  
  init(): Promise<void>
  getOrCreate(userId: string): Promise<Session>
  getById(sessionId: string): Promise<Session | undefined>
  getByUserId(userId: string): Promise<Session | undefined>
  update(session: Session): Promise<void>
  delete(sessionId: string): Promise<boolean>
  clear(sessionId: string): Promise<Session | undefined>
  cleanup(): Promise<number>
  getAll(): Promise<Session[]>
  count(): Promise<number>
  close(): void
}
```

### 6.2 Session Interface

```typescript
interface Session {
  id: string;                    // WhatsApp JID
  startedAt: string;             // ISO timestamp
  lastActivity: string;
  messages: Message[];           // Last 30 in context
  currentTask?: Task;
  currentProject?: ProjectContext;
  availableProjects?: string[];
}

interface ProjectContext {
  name: string;
  path: string;
  gitBranch?: string;
  hasUncommitted?: boolean;
}
```

---

## 7. Status API

### 7.1 Endpoints

**Base URL:** `http://localhost:8765`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | System status |
| `/health` | GET | Health check |
| `/logout` | POST | Disconnect WhatsApp |
| `/docs` | GET | Documentation site |

### 7.2 Status Response

```typescript
interface StatusResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  whatsapp: {
    connected: boolean;
    authenticated: boolean;
    qrPending?: boolean;
  };
  uptime: number;
  version: string;
}
```

### 7.3 Example Requests

```bash
# Get status
curl http://localhost:8765/status

# Health check  
curl http://localhost:8765/health

# Disconnect WhatsApp
curl -X POST http://localhost:8765/logout

# Access documentation
open http://localhost:8765/docs
```

---

## 8. Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `OWNER_PHONE_NUMBER` | Your WhatsApp number | `15551234567` |
| `OPENROUTER_API_KEY` | OpenRouter API key | `sk-or-v1-xxx` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MODEL` | `openai/gpt-4.1-nano` | LLM model for orchestration |
| `ENABLE_CLAUDE` | `false` | Enable Claude CLI harness |
| `ENABLE_GEMINI` | `false` | Enable Gemini CLI harness |
| `ENABLE_COPILOT` | `true` | Enable Copilot CLI harness |
| `LOG_LEVEL` | `info` | Logging level (debug/info/warn/error) |
| `PORT` | `8765` | Status API port |
| `FETCH_V2_ENABLED` | `true` | Enable V2 orchestrator |

---

## 9. Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `AUTH_FAILED` | Whitelist check failed | Use authorized phone number |
| `RATE_LIMITED` | Too many requests | Wait 60 seconds |
| `INVALID_INPUT` | Blocked pattern detected | Remove shell injection patterns |
| `VALIDATION_ERROR` | Schema validation failed | Check tool parameters |
| `TOOL_FAILED` | Tool execution error | Check tool-specific error |
| `TASK_FAILED` | Task execution failed | Check harness logs |
| `TIMEOUT` | Execution timeout (5 min) | Simplify task scope |
| `LLM_ERROR` | OpenRouter API error | Check API key/quota |
| `HARNESS_ERROR` | CLI tool error | Check harness authentication |

---

*Fetch API Reference v2.1.0 - Last updated: February 3, 2026*
