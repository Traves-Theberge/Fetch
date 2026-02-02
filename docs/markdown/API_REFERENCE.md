# Fetch - API Reference

Complete API documentation for Fetch's internal components and integrations.

---

## Table of Contents

1. [WhatsApp Protocol](#1-whatsapp-protocol)
2. [Security API](#2-security-api)
3. [Agent API](#3-agent-api)
4. [Tools API](#4-tools-api)
5. [Session API](#5-session-api)
6. [Status API](#6-status-api)
7. [Environment Variables](#7-environment-variables)

---

## 1. WhatsApp Protocol

### 1.1 Message Flow

<!-- DIAGRAM:dataflow -->

### 1.2 Message Format

```typescript
interface IncomingMessage {
  from: string;          // Sender JID (e.g., "15551234567@c.us")
  body: string;          // Message text
  timestamp: number;     // Unix timestamp
  isGroupMsg: boolean;   // True if from group chat
  participant?: string;  // Sender in group (for verification)
}
```

### 1.3 @fetch Trigger

All messages must start with `@fetch` (case-insensitive):

```typescript
// security/gate.ts
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

---

## 2. Security API

### 2.1 Security Gate

**File:** `fetch-app/src/security/gate.ts`

```typescript
class SecurityGate {
  constructor(ownerNumber: string)
  
  /**
   * Check if message should be processed
   * @param message - WhatsApp message
   * @returns true if authorized and has @fetch trigger
   */
  isAllowed(message: Message): boolean
  
  /**
   * Check if sender is the owner
   * @param senderId - WhatsApp JID
   * @param participantId - Participant ID for group messages
   * @returns true if authorized
   */
  isOwner(senderId: string, participantId?: string): boolean
}
```

### 2.2 Rate Limiter

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
| Max Requests | 30 |
| Window | 60 seconds |

### 2.3 Input Validator

**File:** `fetch-app/src/security/validator.ts`

```typescript
interface ValidationResult {
  valid: boolean;
  reason?: string;
}

function validateInput(input: string): ValidationResult
```

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

## 3. Agent API

### 3.1 Agent Core

**File:** `fetch-app/src/agent/core.ts`

```typescript
class AgentCore {
  constructor(session: Session, toolRegistry: ToolRegistry)
  
  /**
   * Process a user message through the ReAct loop
   * @param message - User's message (with @fetch stripped)
   * @returns Array of response messages
   */
  async processMessage(message: string): Promise<string[]>
  
  /**
   * Handle approval response
   * @param response - User's yes/no/skip response
   * @returns Array of response messages
   */
  async handleApproval(response: string): Promise<string[]>
  
  /**
   * Cancel current task
   */
  cancelTask(): void
}
```

### 3.2 ReAct Loop

```typescript
// Simplified loop structure
while (iterations < maxIterations) {
  const decision = await llm.decide(context);
  
  switch (decision.type) {
    case 'use_tool':
      if (needsApproval(decision.tool)) {
        return askForApproval(decision);
      }
      await executeTool(decision);
      break;
      
    case 'ask_user':
      return formatQuestion(decision.question);
      
    case 'task_complete':
      return formatSuccess(decision.summary);
      
    case 'task_blocked':
      return formatBlocked(decision.reason);
  }
}
```

### 3.3 LLM Integration

```typescript
// OpenRouter configuration
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1'
});

const MODEL = process.env.AGENT_MODEL || 'openai/gpt-4.1-nano';
```

---

## 4. Tools API

### 4.1 Tool Interface

**File:** `fetch-app/src/tools/types.ts`

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;
  autoApprove: boolean;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

interface ToolContext {
  workspacePath: string;
  session: Session;
}
```

### 4.2 Tool Registry

**File:** `fetch-app/src/tools/registry.ts`

```typescript
class ToolRegistry {
  register(tool: Tool): void
  get(name: string): Tool | undefined
  getAll(): Tool[]
  toOpenAIFormat(): OpenAITool[]
}
```

### 4.3 Tool Categories

<!-- DIAGRAM:tools -->

#### File Tools

| Tool | Parameters | Auto-Approve |
|------|------------|--------------|
| `read_file` | `path`, `start_line?`, `end_line?` | ✅ |
| `write_file` | `path`, `content` | ❌ |
| `edit_file` | `path`, `search`, `replace` | ❌ |
| `search_files` | `query`, `path?`, `regex?` | ✅ |
| `list_directory` | `path?`, `recursive?` | ✅ |

#### Code Tools

| Tool | Parameters | Auto-Approve |
|------|------------|--------------|
| `repo_map` | `path?`, `max_depth?` | ✅ |
| `find_definition` | `symbol`, `file_hint?` | ✅ |
| `find_references` | `symbol` | ✅ |
| `get_diagnostics` | `path?` | ✅ |

#### Shell Tools

| Tool | Parameters | Auto-Approve |
|------|------------|--------------|
| `run_command` | `command`, `timeout?` | ❌ |
| `run_tests` | `pattern?`, `coverage?` | ✅ |
| `run_lint` | `path?`, `fix?` | ✅ (unless fix) |

#### Git Tools

| Tool | Parameters | Auto-Approve |
|------|------------|--------------|
| `git_status` | — | ✅ |
| `git_diff` | `path?`, `staged?` | ✅ |
| `git_commit` | `message`, `files?` | ❌ |
| `git_undo` | `hard?`, `count?` | ❌ |
| `git_branch` | `name?`, `checkout?` | ❌ |
| `git_log` | `count?` | ✅ |
| `git_stash` | `action`, `message?` | ❌ |

#### Control Tools

| Tool | Parameters | Auto-Approve |
|------|------------|--------------|
| `ask_user` | `question`, `options?` | ✅ |
| `report_progress` | `message`, `percent?` | ✅ |
| `task_complete` | `summary`, `files_modified?` | ✅ |
| `task_blocked` | `reason`, `suggestion?` | ✅ |
| `think` | `thought` | ✅ |

---

## 5. Session API

### 5.1 Session Store

**File:** `fetch-app/src/session/store.ts`

```typescript
class SessionStore {
  constructor(dbPath: string = './data/sessions.json')
  
  get(id: string): Session | undefined
  create(id: string): Session
  update(session: Session): void
  delete(id: string): void
  cleanup(maxAgeMs: number): void
}
```

### 5.2 Session Interface

```typescript
interface Session {
  id: string;                    // WhatsApp JID
  startedAt: string;             // ISO timestamp
  lastActivity: string;
  messages: Message[];           // Last 30 in context
  currentTask?: AgentTask;
  preferences: SessionPreferences;
}

interface SessionPreferences {
  autonomyLevel: 'supervised' | 'semi-autonomous' | 'autonomous';
  autoCommit: boolean;
  verboseMode: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCall?: ToolCall;
  timestamp: string;
}
```

---

## 6. Status API

### 6.1 Endpoints

**Base URL:** `http://localhost:8765`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | System status |
| `/health` | GET | Health check |
| `/docs` | GET | Documentation site |
| `/docs/*` | GET | Static doc files |

### 6.2 Status Response

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

### 6.3 Example Requests

```bash
# Get status
curl http://localhost:8765/status

# Health check
curl http://localhost:8765/health

# Access documentation
open http://localhost:8765/docs
```

---

## 7. Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `OWNER_PHONE_NUMBER` | WhatsApp number (e.g., `15551234567`) |
| `OPENROUTER_API_KEY` | OpenRouter API key |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MODEL` | `openai/gpt-4.1-nano` | LLM model |
| `ENABLE_CLAUDE` | `false` | Enable Claude CLI |
| `ENABLE_GEMINI` | `false` | Enable Gemini CLI |
| `ENABLE_COPILOT` | `true` | Enable Copilot |
| `LOG_LEVEL` | `info` | Logging level |
| `PORT` | `8765` | Status API port |

---

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_FAILED` | Whitelist check failed |
| `RATE_LIMITED` | Too many requests |
| `INVALID_INPUT` | Blocked pattern detected |
| `TOOL_FAILED` | Tool execution error |
| `TIMEOUT` | Execution timeout |
| `LLM_ERROR` | OpenRouter API error |

---

*API Reference for Fetch v0.1.0*
