# Fetch - API & Integration Guide

This document provides detailed API reference and integration guidance for Fetch components.

---

## Table of Contents

1. [WhatsApp Message Protocol](#1-whatsapp-message-protocol)
2. [Security API](#2-security-api)
3. [Orchestrator API](#3-orchestrator-api)
4. [Executor API](#4-executor-api)
5. [Task Manager API](#5-task-manager-api)
6. [Manager TUI Interface](#6-manager-tui-interface)
7. [Docker Integration](#7-docker-integration)
8. [Environment Variables](#8-environment-variables)
9. [Integration Examples](#9-integration-examples)

---

## 1. WhatsApp Message Protocol

### 1.1 Inbound Message Flow

```typescript
interface IncomingMessage {
  from: string;          // Sender JID (e.g., "15551234567@c.us")
  to: string;            // Recipient (bot number)
  body: string;          // Message text content
  timestamp: number;     // Unix timestamp
  isGroupMsg: boolean;   // True if from group chat
  id: {
    id: string;          // Message ID
    remote: string;      // Remote JID
  };
}
```

### 1.2 Response Protocol

```typescript
// Send response to user
await message.reply(responseText: string): Promise<Message>;

// Response formatting
interface FormattedResponse {
  header: string;        // "✅ *Task {id}*" or "❌ *Error*"
  description: string;   // Task explanation
  output: string;        // Execution result (code block formatted)
}
```

### 1.3 Message Types Handled

| Type | Handled | Notes |
|------|---------|-------|
| Text | ✅ | Primary input method |
| Media | ❌ | Ignored |
| Location | ❌ | Ignored |
| Contact | ❌ | Ignored |
| Group | ❌ | Blocked at security layer |
| Broadcast | ❌ | Blocked at security layer |

---

## 2. Security API

### 2.1 SecurityGate

**File:** `fetch-app/src/security/gate.ts`

```typescript
class SecurityGate {
  constructor(allowedNumbers: string[])
  
  /**
   * Check if sender is authorized
   * @param senderId - WhatsApp JID (e.g., "15551234567@c.us")
   * @returns true if authorized, false otherwise
   */
  isAuthorized(senderId: string): boolean
  
  /**
   * Normalize phone number to consistent format
   * @param phone - Raw phone number
   * @returns Normalized number without symbols
   */
  private normalizePhoneNumber(phone: string): string
}
```

**Usage:**
```typescript
const gate = new SecurityGate([process.env.OWNER_PHONE_NUMBER!]);

if (!gate.isAuthorized(message.from)) {
  return;  // Silent drop
}
```

### 2.2 RateLimiter

**File:** `fetch-app/src/security/rateLimiter.ts`

```typescript
class RateLimiter {
  constructor(maxRequests: number = 30, windowMs: number = 60000)
  
  /**
   * Check if request is within rate limit
   * @param key - Unique identifier (phone number)
   * @returns true if allowed, false if rate limited
   */
  isAllowed(key: string): boolean
  
  /**
   * Get remaining requests for key
   * @param key - Unique identifier
   * @returns Number of remaining requests in window
   */
  getRemainingRequests(key: string): number
  
  /**
   * Reset rate limit for key
   * @param key - Unique identifier
   */
  reset(key: string): void
}
```

**Usage:**
```typescript
const rateLimiter = new RateLimiter(30, 60000);

if (!rateLimiter.isAllowed(message.from)) {
  await message.reply('🚫 Rate limit exceeded. Please wait.');
  return;
}
```

### 2.3 InputValidator

**File:** `fetch-app/src/security/validator.ts`

```typescript
interface ValidationResult {
  valid: boolean;
  reason?: string;
}

class InputValidator {
  /**
   * Validate user input for dangerous patterns
   * @param input - Raw user input
   * @returns Validation result with reason if invalid
   */
  validate(input: string): ValidationResult
}

// Convenience function
function validateInput(input: string): ValidationResult
```

**Blocked Patterns:**
- Command substitution: `$(...)`
- Backtick execution: `` `...` ``
- Shell injection: `; rm`, `&& rm`, `| sh`
- Path traversal: `../`
- Null bytes: `\x00`
- JavaScript eval: `eval(`, `Function(`
- Prototype pollution: `__proto__`, `constructor[`

**Usage:**
```typescript
const validation = validateInput(message.body);
if (!validation.valid) {
  await message.reply(`🚫 ${validation.reason}`);
  return;
}
```

---

## 3. Orchestrator API

### 3.1 Intent Parsing

**File:** `fetch-app/src/orchestrator/index.ts`

```typescript
interface ActionPlan {
  tool: 'claude' | 'gemini' | 'copilot' | 'status' | 'help';
  args: string[];
  explanation: string;
}

class Orchestrator {
  constructor(apiKey: string)
  
  /**
   * Parse user message and determine action
   * @param message - User's natural language message
   * @returns ActionPlan with tool routing and arguments
   */
  async parseIntent(message: string): Promise<ActionPlan>
  
  /**
   * Execute the action plan
   * @param plan - ActionPlan from parseIntent
   * @param taskId - Task ID for tracking
   * @returns Execution result string
   */
  async execute(plan: ActionPlan, taskId: string): Promise<string>
}
```

### 3.2 Tool Routing Rules

| Intent Keywords | Tool | Example |
|-----------------|------|---------|
| "fix", "refactor", "write code", "implement" | claude | "Fix the auth bug" |
| "explain", "what is", "how does" | gemini | "Explain useEffect" |
| "git", "github", "push", "pull request" | copilot | "Create a PR" |
| "status", "tasks", "running" | status | "Show status" |
| "help", "commands", "?" | help | "Help" |

### 3.3 OpenRouter Integration

```typescript
// System prompt for intent parsing
const systemPrompt = `You are Fetch, an AI routing assistant.
Analyze the user's message and determine which tool should handle it.

Available tools:
- claude: Complex code generation, refactoring, debugging
- gemini: Quick explanations, documentation, simple questions
- copilot: Git operations, GitHub workflows, repository help
- status: Show system status and running tasks
- help: Show available commands

Respond ONLY with JSON:
{
  "tool": "claude|gemini|copilot|status|help",
  "args": ["argument1", "argument2"],
  "explanation": "Brief description of what will be done"
}`;
```

---

## 4. Executor API

### 4.1 Docker Executor

**File:** `fetch-app/src/executor/docker.ts`

```typescript
class DockerExecutor {
  constructor()
  
  /**
   * Execute command in Kennel container
   * @param cmd - Command as array of strings (NEVER concatenated)
   * @returns Command output as string
   * @throws ExecutionError if command fails or times out
   */
  private async execInKennel(cmd: string[]): Promise<string>
  
  /**
   * Run Claude CLI with prompt
   * @param prompt - User prompt
   * @param context - Optional context files
   * @returns Claude's response
   */
  async runClaude(prompt: string, context?: string[]): Promise<string>
  
  /**
   * Run Gemini CLI with prompt
   * @param prompt - User prompt
   * @returns Gemini's response
   */
  async runGemini(prompt: string): Promise<string>
  
  /**
   * Run GitHub Copilot CLI
   * @param subcommand - Copilot subcommand (explain, suggest)
   * @param prompt - User prompt
   * @returns Copilot's response
   */
  async runCopilot(subcommand: string, prompt: string): Promise<string>
  
  /**
   * Check if Kennel container is running
   * @returns true if container is healthy
   */
  async isKennelHealthy(): Promise<boolean>
}
```

### 4.2 Execution Safety

```typescript
// CRITICAL: Commands are ALWAYS passed as arrays
// This prevents any shell injection

// ✅ SAFE - Array-based execution
await this.execInKennel(['claude', '--print', userPrompt]);

// ❌ NEVER DONE - String concatenation
// exec(`claude --print "${userPrompt}"`);  // VULNERABLE!
```

### 4.3 Timeout Configuration

```typescript
const EXECUTION_TIMEOUT = 300000;  // 5 minutes

// Timeout handling
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Execution timed out')), EXECUTION_TIMEOUT);
});

const result = await Promise.race([
  this.execInKennel(cmd),
  timeoutPromise
]);
```

---

## 5. Task Manager API

### 5.1 Task Interface

**File:** `fetch-app/src/tasks/manager.ts`

```typescript
type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
type AgentType = 'claude' | 'gemini' | 'copilot';

interface Task {
  id: string;              // 8-character UUID
  status: TaskStatus;
  agent: AgentType;
  prompt: string;          // Original user message
  args: string[];          // Parsed arguments
  output?: string;         // Execution result
  error?: string;          // Error message if failed
  createdAt: string;       // ISO 8601 timestamp
  updatedAt: string;       // ISO 8601 timestamp
}

class TaskManager {
  constructor(dbPath: string = '/app/data/tasks.json')
  
  /**
   * Create a new task
   * @param agent - AI agent to use
   * @param prompt - User's original message
   * @param args - Parsed arguments
   * @returns Created task
   */
  async create(agent: AgentType, prompt: string, args: string[]): Promise<Task>
  
  /**
   * Update existing task
   * @param task - Task with updated fields
   */
  async update(task: Task): Promise<void>
  
  /**
   * Get task by ID
   * @param id - Task ID
   * @returns Task or undefined
   */
  async get(id: string): Promise<Task | undefined>
  
  /**
   * Get all tasks
   * @param status - Optional status filter
   * @returns Array of tasks
   */
  async getAll(status?: TaskStatus): Promise<Task[]>
  
  /**
   * Get recent tasks
   * @param limit - Maximum number of tasks
   * @returns Array of recent tasks
   */
  async getRecent(limit: number = 10): Promise<Task[]>
}
```

### 5.2 Task Lifecycle

```
┌─────────┐     create()     ┌─────────────┐
│  USER   │ ───────────────▶ │   PENDING   │
│ MESSAGE │                  └──────┬──────┘
└─────────┘                         │
                                    │ update(status: 'IN_PROGRESS')
                                    ▼
                            ┌─────────────────┐
                            │  IN_PROGRESS    │
                            └───────┬─────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
            ┌─────────────┐                 ┌─────────────┐
            │  COMPLETED  │                 │   FAILED    │
            │ (with output)│                │ (with error)│
            └─────────────┘                 └─────────────┘
```

### 5.3 Database Schema

```json
// data/tasks.json
{
  "tasks": [
    {
      "id": "a1b2c3d4",
      "status": "COMPLETED",
      "agent": "claude",
      "prompt": "Fix the auth bug in login.ts",
      "args": ["Fix the auth bug in login.ts"],
      "output": "I've fixed the authentication bug...",
      "createdAt": "2026-02-01T10:30:00.000Z",
      "updatedAt": "2026-02-01T10:31:45.000Z"
    }
  ]
}
```

---

## 6. Manager TUI Interface

### 6.1 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑/k` | Move cursor up |
| `↓/j` | Move cursor down |
| `Enter` | Select menu item |
| `q` | Quit / Go back |
| `Ctrl+C` | Force quit |

### 6.2 Menu Structure

```
┌────────────────────────────────────┐
│           🐕 FETCH                 │
│     Headless AI Development        │
├────────────────────────────────────┤
│  > Start Services                  │
│    Stop Services                   │
│    Configure                       │
│    View Logs                       │
│    Update                          │
│    Status                          │
│    Quit                            │
├────────────────────────────────────┤
│  Bridge: ● Running                 │
│  Kennel: ● Running                 │
└────────────────────────────────────┘
```

### 6.3 Manager Commands

**Start Services:**
```bash
docker compose up -d
```

**Stop Services:**
```bash
docker compose down
```

**View Logs:**
```bash
docker logs --tail 100 fetch-bridge
```

**Update:**
```bash
git pull origin main
docker compose build
docker compose up -d
```

---

## 7. Docker Integration

### 7.1 Container Configuration

**Bridge Container:**
```yaml
fetch-bridge:
  build: ./fetch-app
  container_name: fetch-bridge
  restart: unless-stopped
  environment:
    - OWNER_PHONE_NUMBER=${OWNER_PHONE_NUMBER}
    - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
  volumes:
    - ./data:/app/data
    - /var/run/docker.sock:/var/run/docker.sock:ro
  depends_on:
    - fetch-kennel
```

**Kennel Container:**
```yaml
fetch-kennel:
  build: ./kennel
  container_name: fetch-kennel
  restart: unless-stopped
  environment:
    - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    - GEMINI_API_KEY=${GEMINI_API_KEY}
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

### 7.2 Volume Mounts

| Mount | Purpose | Access |
|-------|---------|--------|
| `./data:/app/data` | Task database, WhatsApp session | Read/Write |
| `./workspace:/workspace` | User code directory | Read/Write |
| `./config/github:/root/.config/gh` | GitHub auth token | Read-Only |
| `./config/claude:/root/.config/claude` | Claude MCP config | Read-Only |
| `/var/run/docker.sock` | Docker API access | Read-Only |

### 7.3 Network Configuration

```yaml
# Default bridge network
networks:
  default:
    driver: bridge
```

Both containers share the default bridge network, allowing Bridge to execute commands in Kennel via Docker API.

---

## 8. Environment Variables

### 8.1 Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OWNER_PHONE_NUMBER` | Your WhatsApp number (no + or spaces) | `15551234567` |
| `OPENROUTER_API_KEY` | OpenRouter API key for intent parsing | `sk-or-v1-...` |

### 8.2 Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Direct Claude API key | - |
| `GEMINI_API_KEY` | Google Gemini API key | - |
| `LOG_LEVEL` | Logging verbosity (info/debug) | `info` |
| `TZ` | Container timezone | `UTC` |
| `NODE_ENV` | Node environment | `production` |

### 8.3 Environment File

```bash
# .env
OWNER_PHONE_NUMBER=15551234567
OPENROUTER_API_KEY=sk-or-v1-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
GEMINI_API_KEY=AIza-your-key-here
LOG_LEVEL=info
TZ=America/New_York
```

---

## 9. Integration Examples

### 9.1 Adding a Custom Command

```typescript
// fetch-app/src/bridge/commands.ts

export const commands: CommandMap = {
  // Existing commands...
  
  // Add new command
  'weather': {
    aliases: ['forecast'],
    description: 'Get weather forecast',
    handler: async (message: Message) => {
      // Your implementation
      const weather = await getWeather();
      return `🌤️ Current weather: ${weather}`;
    }
  }
};
```

### 9.2 Adding a New AI Agent

**Step 1: Update Kennel Dockerfile**
```dockerfile
# kennel/Dockerfile
RUN npm install -g @newagent/cli
```

**Step 2: Add executor method**
```typescript
// fetch-app/src/executor/docker.ts
async runNewAgent(prompt: string): Promise<string> {
  return this.execInKennel(['newagent', 'run', prompt]);
}
```

**Step 3: Update orchestrator routing**
```typescript
// fetch-app/src/orchestrator/index.ts
case 'newagent':
  result = await this.executor.runNewAgent(plan.args[0]);
  break;
```

### 9.3 Custom Output Formatting

```typescript
// fetch-app/src/utils/format.ts
export function formatResponse(task: Task): string {
  const statusEmoji = task.status === 'COMPLETED' ? '✅' : '❌';
  
  return [
    `${statusEmoji} *Task ${task.id}*`,
    '',
    task.prompt,
    '',
    '```',
    sanitizeOutput(task.output || 'No output'),
    '```'
  ].join('\n');
}
```

### 9.4 Webhook Integration

```typescript
// Example: Post task completions to webhook
async function notifyWebhook(task: Task) {
  await fetch(process.env.WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'task_completed',
      task: {
        id: task.id,
        status: task.status,
        agent: task.agent
      }
    })
  });
}
```

---

## Appendix: Type Definitions

### Complete Type Reference

```typescript
// types/index.ts

// Security Types
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

// Task Types
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
export type AgentType = 'claude' | 'gemini' | 'copilot';

export interface Task {
  id: string;
  status: TaskStatus;
  agent: AgentType;
  prompt: string;
  args: string[];
  output?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// Orchestrator Types
export interface ActionPlan {
  tool: AgentType | 'status' | 'help';
  args: string[];
  explanation: string;
}

// Command Types
export interface Command {
  aliases: string[];
  description: string;
  handler: (message: Message) => Promise<string>;
}

export type CommandMap = Record<string, Command>;

// Config Types
export interface AppConfig {
  ownerPhoneNumber: string;
  openRouterApiKey: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  logLevel: 'info' | 'debug';
}
```

---

*API Reference v1.0.0 - February 2026*
