# 🔧 Fetch Architecture Deep Dive — Task & Harness Execution

> **Part 2 of the Testing Guide**
> **Last Updated:** 2025-02-07
> **Version:** 3.4.0+

---

## Table of Contents

1. [Overview](#overview)
2. [The 5-Layer Pipeline](#the-5-layer-pipeline)
3. [Layer 1: User Message → Tool Call](#layer-1-user-message--tool-call)
4. [Layer 2: task_create → TaskManager](#layer-2-task_create--taskmanager)
5. [Layer 3: TaskIntegration → HarnessExecutor](#layer-3-taskintegration--harnessexecutor)
6. [Layer 4: Pool → Spawner → Process](#layer-4-pool--spawner--process)
7. [Layer 5: Completion Detection](#layer-5-completion-detection)
8. [Execution Paths (Bridge vs Kennel)](#execution-paths-bridge-vs-kennel)
9. [The Task State Machine](#the-task-state-machine)
10. [Harness Adapters](#harness-adapters)
11. [Event Flow & Notifications](#event-flow--notifications)
12. [Key Files Reference](#key-files-reference)

---

## Overview

When a user asks Fetch to do coding work (e.g., _"add a health check endpoint"_), the request flows through a 5-layer pipeline that transforms a WhatsApp message into a running CLI process, monitors it, and reports back.

```
┌─────────────────────────────────────────────────────────────────┐
│                        WhatsApp Message                         │
│              "add a health check endpoint"                      │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 1: Agent Core (core.ts)                                   │
│  Intent: action → LLM calls task_create tool                     │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 2: Tool Handler (tools/task.ts)                           │
│  Frames goal, resolves workspace, creates task                   │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 3: Integration (task/integration.ts)                      │
│  Selects agent, transitions state, calls executor                │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 4: Pool → Spawner (harness/pool.ts → spawner.ts)          │
│  Manages concurrency, spawns child_process                       │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Layer 5: CLI Process (claude / gemini / gh copilot)             │
│  Runs in container, output streamed, exit code = completion      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: User Message → Tool Call

**File:** `fetch-app/src/agent/core.ts`

When a message arrives, the agent core:

1. **Classifies intent** via `classifyIntent()` — determines if this is `conversation` (no tools) or `action` (tools needed)
2. If `action`, sends the message to the LLM with the full tool schema attached
3. The LLM decides which tool(s) to call — for coding work it calls `task_create`
4. The agent core's tool loop executes the tool call via the `ToolRegistry`

```
User: "add a health check endpoint"
  → Intent: action
  → LLM response: tool_call { name: "task_create", arguments: { goal: "...", workspace: "my-api" } }
  → Registry dispatches to handleTaskCreate()
```

The tool call happens **synchronously** from the LLM's perspective — the tool returns a result (task ID + status), and the LLM formats a user-facing response like _"I've started working on that!"_.

---

## Layer 2: task_create → TaskManager

**File:** `fetch-app/src/tools/task.ts`

The `handleTaskCreate()` handler does 5 things:

### 2a. Goal Framing

```typescript
framedGoal = await frameTaskGoal(goal, session);
```

The raw user message ("add a health check endpoint") is rewritten into a **self-contained prompt** that the coding CLI can understand without any chat context. This includes relevant project info, file context, and the specific request.

### 2b. Workspace Resolution

```typescript
const workspaceId = workspace ?? workspaceManager.getActiveWorkspaceId();
const workspaceData = await workspaceManager.getWorkspace(workspaceId);
```

If the user didn't specify a workspace, it falls back to whichever project is currently active in the session. If no project is selected, the tool returns an error.

### 2c. Single-Task Constraint

```typescript
if (manager.hasRunningTask()) {
  return { error: `Cannot create task: another task (${currentTaskId}) is already running` };
}
```

Only **one task can run at a time** per TaskManager instance. This prevents conflicting file modifications.

### 2d. Task Creation

```typescript
const task = await manager.createTask({
  goal: framedGoal,
  agent: agent ?? 'auto',
  workspace: workspaceId,
  timeout,
}, sessionId);
```

The `TaskManager` creates a `Task` object with:

| Field | Value |
|-------|-------|
| `id` | `tsk_{nanoid(10)}` (e.g., `tsk_V1StGXR8_Z`) |
| `status` | `pending` |
| `goal` | The framed prompt |
| `agent` | `auto`, `claude`, `gemini`, or `copilot` |
| `workspace` | Project directory name |
| `sessionId` | User's WhatsApp JID |
| `constraints` | `{ timeoutMs: 300000, requireApproval: false, maxRetries: 1 }` |

The task is stored in-memory (`Map<TaskId, Task>`) and persisted to disk via `TaskStore`.

### 2e. Fire-and-Forget Execution

```typescript
integration.executeTask(task, (taskId, message, percent) => {
  console.log(`[Task ${taskId}] ${percent}% - ${message}`);
}).then(result => {
  console.log(`[Task ${task.id}] Completed:`, result.success ? 'SUCCESS' : 'FAILED');
}).catch(err => {
  console.error(`[Task ${task.id}] Error:`, err);
});
```

**This is not awaited.** The tool handler returns immediately with the task ID, while execution runs asynchronously in the background. The user gets a quick confirmation message while the harness works.

---

## Layer 3: TaskIntegration → HarnessExecutor

**File:** `fetch-app/src/task/integration.ts`

The `TaskIntegration` class bridges the task layer and the harness layer:

### 3a. Agent Selection

```typescript
private selectAgent(agent: string): AgentType {
  if (agent === 'auto') {
    return 'claude'; // Default — future: intelligent routing
  }
  return agent as AgentType;
}
```

Currently `auto` always picks `claude`. Future versions will route based on task complexity (simple fixes → gemini, complex refactors → claude).

### 3b. State Transition

```typescript
await this.manager.startTask(task.id);
```

Transitions the task from `pending` → `running` and emits a `task:started` event.

### 3c. Executor Call

```typescript
const result = await executor.execute(
  task.id,      // tsk_xxx
  agent,        // 'claude' | 'gemini' | 'copilot'
  task.goal,    // The framed prompt
  workspace.path, // Absolute path like /workspace/my-api
  timeoutMs     // Default 600000 (10 min)
);
```

### 3d. Result Processing

When the executor returns, `processResult()` handles the outcome:

- **Success** → `manager.completeTask(taskId, result)` → status becomes `completed`
- **Failure** → `manager.failTask(taskId, error)` → status becomes `failed`

### 3e. Event Routing

The integration subscribes to all harness events and routes them to the task layer:

| Harness Event | Task Action |
|---------------|-------------|
| `harness:output` | Emits `task:output` with session ID |
| `harness:progress` | Emits `task:progress` |
| `harness:file_op` | Emits `task:file_op` |
| `harness:question` | Calls `manager.pauseTask()`, emits `task:question` |
| `harness:completed` | Emits `task:completed` |
| `harness:failed` | Emits `task:failed` |

---

## Layer 4: Pool → Spawner → Process

### The Pool (`fetch-app/src/harness/pool.ts`)

The `HarnessPool` manages **concurrency** — max 2 parallel harness processes by default.

```typescript
const config: PoolConfig = {
  maxConcurrent: 2,
  defaultTimeoutMs: DEFAULT_HARNESS_TIMEOUT_MS
};
```

When `acquire()` is called:
- If slots are available → immediately spawns via `HarnessSpawner`
- If pool is full → request is queued; next completion frees a slot and processes the queue

### The Spawner (`fetch-app/src/harness/spawner.ts`)

The `HarnessSpawner` actually creates the child process:

```typescript
const child = spawn(config.command, config.args, {
  cwd: config.cwd,
  env: { ...process.env, ...config.env },
  stdio: ['pipe', 'pipe', 'pipe']  // stdin, stdout, stderr all piped
});
```

Each spawned process gets:
- An ID: `hrn_{nanoid(8)}` (e.g., `hrn_Xy7zW9qP`)
- Its own stdout/stderr listeners
- A timeout timer
- An entry in the `instances` map

### Stream Monitoring

The spawner attaches listeners to stdout and stderr:

```typescript
child.stdout.on('data', (data) => {
  instance.stdout.push(text);
  this.emit('output', { id, type: 'stdout', data: text });

  // Naive question detection
  if (text.includes('?')) {
    instance.status = 'waiting_input';
    this.emit('status', { id, status: 'waiting_input' });
  }
});
```

All output is:
1. **Stored** in the instance's `stdout[]` / `stderr[]` arrays
2. **Emitted** as events for the executor to process
3. **Parsed** by the adapter for special patterns (questions, progress, completion)

---

## Layer 5: Completion Detection

Three mechanisms work together to detect when a task is done:

### A. Process Exit Code (Primary)

```typescript
child.on('close', (code) => {
  const finalStatus = code === 0 ? 'completed' : 'failed';
  instance.status = finalStatus;
  this.emit('status', { id, status: finalStatus, code });
});
```

This is the **definitive** signal. When the CLI process exits:
- Exit code `0` → `completed`
- Exit code `!= 0` → `failed`

### B. Output Pattern Matching (Secondary)

Each adapter defines patterns specific to its CLI. For Claude:

```typescript
// Questions
const QUESTION_PATTERN = /^\s*\?\s+(.+)/m;

// File operations
const FILE_EDIT_PATTERN = /^(Edited|Created|Deleted|Modified)\s+(.+)$/m;

// Progress spinners
const PROGRESS_PATTERN = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+(.+)$/m;

// Completion signals
const COMPLETION_PATTERNS = [
  /^Done\.?$/im,
  /^Completed\.?$/im,
  /^Finished\.?$/im,
  /^Task completed/im,
];
```

These are used to:
- Detect **questions** → pause the task, notify the user
- Track **progress** → emit progress events
- Detect **file changes** → track modified files
- Signal **completion** → early completion detection before process exit

### C. Timeout (Safety Net)

```typescript
if (config.timeoutMs > 0) {
  setTimeout(() => this.timeout(id), config.timeoutMs);
}

private timeout(id: HarnessId): void {
  if (instance.status === 'running' || instance.status === 'waiting_input') {
    this.kill(id); // SIGTERM
  }
}
```

If the process hasn't exited within the timeout (default 5-10 minutes), it gets killed. The task transitions to `failed`.

---

## Execution Paths (Bridge vs Kennel)

There are **two** ways Fetch can execute CLI tools:

### Path 1: HarnessSpawner (V3 — Current)

```
fetch-bridge container
  └── child_process.spawn('claude', ['--print', '-p', '...'])
      └── Process runs INSIDE the bridge container
```

The spawner uses Node's `child_process.spawn()` directly. The CLI tools would need to be available inside the bridge container for this to work.

### Path 2: DockerExecutor (Legacy — `executor/docker.ts`)

```
fetch-bridge container
  └── Docker API (/var/run/docker.sock)
      └── docker exec fetch-kennel claude --print -p "..."
          └── Process runs INSIDE the kennel container
```

The `DockerExecutor` connects to the Docker API and runs commands inside the `fetch-kennel` container. The kennel is a separate container with:
- CLI tools installed (claude, gemini, gh copilot)
- `/workspace` volume mounted (shared with bridge)
- Auth credentials mounted (~/.config/gh/, ~/.config/claude-code/, etc.)

### Which Path Is Used?

The V3 harness system (pool/spawner) is the **active** path. The `DockerExecutor` in `executor/docker.ts` is the older approach. The kennel container is still needed because the spawner in the bridge will likely `docker exec` into it for the actual CLI execution (the CLI binaries live in the kennel, not the bridge).

### Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│              fetch-bridge (Node.js)                  │
│                                                     │
│  WhatsApp ↔ Agent Core ↔ Tool Registry              │
│                              │                      │
│                     TaskManager + Integration        │
│                              │                      │
│                    HarnessExecutor                   │
│                         │                           │
│                    HarnessPool (max: 2)              │
│                         │                           │
│                   HarnessSpawner                    │
│                    spawn(command)                    │
│                         │                           │
└─────────────────────────┼───────────────────────────┘
                          │ Docker API or direct spawn
                          ▼
┌─────────────────────────────────────────────────────┐
│              fetch-kennel (sandbox)                   │
│                                                     │
│  Installed CLIs:                                    │
│  • claude (Claude Code CLI)                         │
│  • gemini (Gemini CLI)                              │
│  • gh copilot (GitHub Copilot CLI)                  │
│                                                     │
│  Volumes:                                           │
│  • /workspace ← ./workspace (project files)         │
│  • ~/.config/gh ← host gh auth                      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## The Task State Machine

```
                    ┌─────────────┐
                    │   pending   │
                    └──────┬──────┘
                           │ startTask()
                           ▼
                    ┌─────────────┐
           ┌───────│   running   │────────┐
           │       └──────┬──────┘        │
           │              │               │
     question?       exit code 0     exit code != 0
           │              │            or timeout
           ▼              ▼               │
    ┌──────────────┐ ┌──────────┐         │
    │waiting_input │ │completed │         │
    └──────┬───────┘ └──────────┘         │
           │                              ▼
      user responds                ┌──────────┐
           │                       │  failed   │
           └─── back to running    └──────────┘

          /stop or /cancel from ANY state:
                           ▼
                    ┌──────────────┐
                    │  cancelled   │
                    └──────────────┘
```

### State Transitions

| From | To | Trigger |
|------|----|---------|
| `pending` | `running` | `manager.startTask()` |
| `pending` | `cancelled` | User sends `/stop` |
| `running` | `waiting_input` | Question detected in CLI output |
| `running` | `completed` | Process exits with code 0 |
| `running` | `failed` | Process exits with code != 0, or timeout |
| `running` | `cancelled` | User sends `/stop` or `/cancel` |
| `waiting_input` | `running` | User responds via `task_respond` |
| `waiting_input` | `completed` | Process exits while waiting |
| `waiting_input` | `failed` | Timeout while waiting |
| `waiting_input` | `cancelled` | User sends `/stop` |
| `failed` | `cancelled` | Cleanup |

### Valid Transitions (Enforced)

```typescript
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending:       ['running', 'cancelled'],
  running:       ['waiting_input', 'completed', 'failed', 'cancelled'],
  waiting_input: ['running', 'completed', 'failed', 'cancelled'],
  completed:     [],           // Terminal state
  failed:        ['cancelled'], // Can only be cancelled after failure
  cancelled:     [],           // Terminal state
  paused:        ['running', 'cancelled'],
};
```

Invalid transitions are rejected, preventing impossible state changes.

---

## Harness Adapters

Each CLI tool has an adapter that knows how to invoke it and parse its output.

### Adapter Interface

```typescript
interface HarnessAdapter {
  readonly agent: AgentType;
  buildConfig(goal, workspacePath, timeoutMs): HarnessConfig;
  parseOutputLine(line): HarnessOutputEventType | null;
  detectQuestion(output): string | null;
  formatResponse(response): string;
  extractSummary(output): string | null;
  extractFileOperations(output): FileOperations;
}
```

### Claude Adapter (`harness/claude.ts`)

| Property | Value |
|----------|-------|
| Command | `claude` |
| Args | `--print --dangerously-skip-permissions -p "<goal>"` |
| Env | `CI=true TERM=dumb` |
| Question Pattern | `/^\s*\?\s+(.+)/m` |
| File Edit Pattern | `/^(Edited\|Created\|Deleted\|Modified)\s+(.+)$/m` |
| Progress Pattern | `/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+(.+)$/m` |
| Completion | `Done.`, `Completed.`, `Finished.`, `Task completed` |

### Gemini Adapter (`harness/gemini.ts`)

| Property | Value |
|----------|-------|
| Command | `gemini` |
| Mode | Interactive CLI with prompt piping |

### Copilot Adapter (`harness/copilot.ts`)

| Property | Value |
|----------|-------|
| Command | `gh copilot suggest` |
| Limitation | Suggestions only — cannot directly modify files |
| Interactive | No |

### Adapter Capabilities

| Capability | Claude | Gemini | Copilot |
|-----------|--------|--------|---------|
| Modify files | ✅ | ✅ | ❌ (suggestions only) |
| Execute commands | ✅ | ✅ | ✅ |
| Interactive mode | ✅ | ✅ | ❌ |
| Question detection | ✅ | ✅ | ❌ |

### Agent Selection (Current)

```typescript
// 'auto' defaults to claude
// Future: intelligent routing based on task complexity
//   - Simple fix (1-3 files) → gemini (fast)
//   - Complex refactor (5+ files) → claude (thorough)
//   - GitHub-specific → copilot
```

---

## Event Flow & Notifications

### Event Chain

```
CLI Process stdout
  → HarnessSpawner.emit('output')
    → HarnessPool.emit('output')
      → HarnessExecutor.emit('harness:output')
        → TaskIntegration.emit('task:output', { taskId, sessionId })
          → (Future: WhatsApp notification to user)
```

### Question Flow (Interactive)

```
1. CLI outputs: "? Do you want to create a new file? (y/n)"
2. Spawner detects '?' → status = 'waiting_input'
3. Executor emits 'harness:question'
4. Integration calls manager.pauseTask() → task status = 'waiting_input'
5. Integration emits 'task:question' with sessionId
6. (Future: sends WhatsApp message to user asking the question)
7. User responds: "yes"
8. Handler calls integration.respondToTask(taskId, "yes")
9. Executor.sendInput(harnessId, "yes\n") → writes to child.stdin
10. Spawner updates status → 'running'
11. Task resumes
```

### Completion Notification Flow

```
1. CLI process exits (code 0)
2. Spawner: status → 'completed', emits event
3. Pool.waitFor() resolves
4. Executor builds HarnessResult { success: true, output: "..." }
5. Integration.processResult() → manager.completeTask()
6. Task status → 'completed'
7. Integration emits 'task:completed' with sessionId
8. (Progress callback logs completion)
```

---

## Key Files Reference

| File | Role | Key Exports |
|------|------|-------------|
| `tools/task.ts` | Tool handlers for `task_create`, `task_status`, `task_cancel`, `task_respond` | `handleTaskCreate()` |
| `task/manager.ts` | Task lifecycle, state machine, persistence | `TaskManager`, `getTaskManager()` |
| `task/types.ts` | Task domain types (`TaskId`, `TaskStatus`, `Task`, `CronJob`) | Type definitions |
| `task/integration.ts` | Bridges task layer ↔ harness layer | `TaskIntegration`, `getTaskIntegration()` |
| `task/store.ts` | SQLite persistence for tasks | `TaskStore` |
| `harness/executor.ts` | Manages harness process lifecycle | `HarnessExecutor`, `getHarnessExecutor()` |
| `harness/pool.ts` | Concurrency management (max 2 parallel) | `HarnessPool`, `getHarnessPool()` |
| `harness/spawner.ts` | Actual `child_process.spawn()` and stream handling | `HarnessSpawner` |
| `harness/registry.ts` | Maps agent types to adapters | `getAdapter()`, `listAgents()` |
| `harness/types.ts` | Harness domain types (`HarnessId`, `HarnessConfig`, etc.) | Type definitions |
| `harness/claude.ts` | Claude Code CLI adapter | `ClaudeAdapter` |
| `harness/gemini.ts` | Gemini CLI adapter | `GeminiAdapter` |
| `harness/copilot.ts` | GitHub Copilot CLI adapter | `CopilotAdapter` |
| `harness/base.ts` | Abstract base adapter with shared logic | `AbstractHarnessAdapter` |
| `executor/docker.ts` | Legacy Docker exec path into kennel | `DockerExecutor` |

---

## Summary

| Concept | Answer |
|---------|--------|
| **How tasks start** | LLM calls `task_create` tool → TaskManager creates task → Integration fires-and-forgets execution |
| **How harnesses run** | Pool manages concurrency → Spawner does `child_process.spawn()` with adapter-built config |
| **Where they run** | CLI processes inside the kennel container (sandbox with tools + workspace volume) |
| **How completion is detected** | Process exit code (primary), output pattern matching (secondary), timeout (safety net) |
| **How state is tracked** | TaskManager state machine with enforced valid transitions, persisted to SQLite |
| **How users are notified** | Progress callbacks log updates; task status queryable via `/task` or `task_status` tool |
| **How questions work** | Output parsing detects `?` → task pauses → user responds → stdin piped back to process |
| **Concurrency limit** | Max 2 parallel harnesses (configurable via pool) |
| **Timeout** | Default 5-10 min per task, SIGTERM on expiry |
| **Single-task constraint** | Only one task per user at a time (checked at creation) |
