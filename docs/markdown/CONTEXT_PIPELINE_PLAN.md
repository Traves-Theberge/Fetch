# 🧠 Context Pipeline — Iron-Clad Implementation Plan

> **Goal:** Make Fetch context-aware across turns — tool call memory, task completion hooks, 20-message sliding window with compaction, and OpenAI-standard multi-turn format.
>
> **Industry Standard:** OpenAI Function Calling Protocol — `assistant` messages carry `tool_calls`, `tool` messages carry results with matching `tool_call_id`. This is how ChatGPT, Claude API, and every production agent framework (LangChain, Vercel AI SDK, AutoGen) maintain multi-turn tool state.
>
> **Key Principle:** Tool calls are internal plumbing — the LLM sees them in history for context, but WhatsApp responses only contain the final text. The user never sees raw tool call data.

---

## Architecture: Before → After

### Current (Broken)

```
WhatsApp → handler/index.ts → session.messages.push({role, content})  ← BARE TEXT ONLY
                ↓
         agent/core.ts → buildMessageHistory() → .map(m => ({role, content}))  ← STRIPS EVERYTHING
                ↓
         OpenAI API → tool_calls → execute → results stay in LOCAL array → LOST after response
                ↓
         handler/index.ts → session.messages.push({role: 'assistant', content: text})  ← BARE TEXT AGAIN
```

**Result:** Every turn is a blank slate. The LLM has no memory of tools it called, workspaces it selected, or tasks it started.

### Target (Fixed)

```
WhatsApp → handler/index.ts → sManager.addUserMessage(session, text)
                ↓
         agent/core.ts → buildMessageHistory() → FULL OpenAI format with tool_calls + tool results
                ↓                                  (internal only — never sent to WhatsApp)
         OpenAI API → tool_calls → execute → sManager.addAssistantToolCallMessage() + sManager.addToolMessage()
                ↓
         handler/index.ts → sManager.addAssistantMessage(session, response.text)
                ↓
         Compaction triggers when messages > 40 → condense older messages into summary → shrink array
                ↓
         Task completion → event listener → sManager.addAssistantMessage() → WhatsApp notification
                ↓
         WhatsApp ← only response.text + task notifications (NEVER raw tool call data)
```

**Result:** Full conversation graph persisted internally. LLM sees what tools were called, what they returned, and what tasks completed — across turns. User sees only clean natural language responses.

---

## Phase 0: Configuration Layer (Do This First)

> **Problem:** 44 magic numbers scattered across 17 source files. Every threshold, limit, token budget, and timeout is a hardcoded constant. Nothing is tunable without a code change + Docker rebuild.
>
> **Goal:** One config module, one source of truth. Every pipeline parameter reads from it. Tunable via env vars for quick adjustments, with sane defaults that work out of the box.

### 0.1 — The Config Module

**New file:** `fetch-app/src/config/pipeline.ts`

```typescript
import { env } from './env.js';

/**
 * Pipeline configuration — single source of truth for all context pipeline tuning.
 *
 * Every value has a sane default. Override via env vars for quick tuning
 * without code changes. All consumers import from here, never hardcode.
 *
 * Naming: FETCH_<CATEGORY>_<PARAM> for env vars
 */
export const pipeline = {
  // ─── Context Window ────────────────────────────────────────
  /** Messages in the sliding window sent to the LLM */
  historyWindow:     int('FETCH_HISTORY_WINDOW', 20),
  /** Compact when total messages exceed this */
  compactionThreshold: int('FETCH_COMPACTION_THRESHOLD', 40),
  /** Max tokens for LLM-generated compaction summary */
  compactionMaxTokens: int('FETCH_COMPACTION_MAX_TOKENS', 500),
  /** Model for compaction summaries (cheap + fast) */
  compactionModel:   str('FETCH_COMPACTION_MODEL', env.SUMMARY_MODEL),

  // ─── Agent LLM ────────────────────────────────────────────
  /** Max tool call rounds per single user message */
  maxToolCalls:      int('FETCH_MAX_TOOL_CALLS', 5),
  /** Token budget for conversation (no tools) responses */
  chatMaxTokens:     int('FETCH_CHAT_MAX_TOKENS', 300),
  /** Temperature for conversation responses */
  chatTemperature:   float('FETCH_CHAT_TEMPERATURE', 0.7),
  /** Token budget for tool-calling responses */
  toolMaxTokens:     int('FETCH_TOOL_MAX_TOKENS', 500),
  /** Temperature for tool-calling responses */
  toolTemperature:   float('FETCH_TOOL_TEMPERATURE', 0.3),
  /** Token budget for task framing prompt */
  frameMaxTokens:    int('FETCH_FRAME_MAX_TOKENS', 200),

  // ─── BM25 Memory (Phase 2) ────────────────────────────────
  /** Max recalled results injected into context */
  recallLimit:       int('FETCH_RECALL_LIMIT', 5),
  /** Max tokens per recalled result snippet */
  recallSnippetTokens: int('FETCH_RECALL_SNIPPET_TOKENS', 300),
  /** Recency decay factor (higher = faster decay) */
  recallDecayFactor: float('FETCH_RECALL_DECAY', 0.1),

  // ─── Circuit Breaker ──────────────────────────────────────
  /** Errors before circuit opens */
  circuitBreakerThreshold: int('FETCH_CB_THRESHOLD', 5),
  /** Backoff schedule (ms) */
  circuitBreakerBackoff: ints('FETCH_CB_BACKOFF', [1000, 2000, 5000]),
  /** Max retries for retriable errors */
  maxRetries:        int('FETCH_MAX_RETRIES', 2),

  // ─── Task Execution ───────────────────────────────────────
  /** Default task timeout (ms) */
  taskTimeout:       int('FETCH_TASK_TIMEOUT', 300_000),
  /** Default harness timeout (ms) */
  harnessTimeout:    int('FETCH_HARNESS_TIMEOUT', 300_000),

  // ─── WhatsApp Formatting ──────────────────────────────────
  /** Max characters per WhatsApp message */
  whatsappMaxLength: int('FETCH_WA_MAX_LENGTH', 4000),
  /** Max chars per line for mobile readability */
  whatsappLineWidth: int('FETCH_WA_LINE_WIDTH', 60),

  // ─── Rate Limiting ────────────────────────────────────────
  /** Requests per rate limit window */
  rateLimitMax:      int('FETCH_RATE_LIMIT_MAX', 30),
  /** Rate limit window (ms) */
  rateLimitWindow:   int('FETCH_RATE_LIMIT_WINDOW', 60_000),
} as const;

// ─── Helpers ───────────────────────────────────────────────
function int(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
}
function float(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseFloat(v) : fallback;
}
function str(key: string, fallback: string): string {
  return process.env[key] || fallback;
}
function ints(key: string, fallback: number[]): number[] {
  const v = process.env[key];
  return v ? v.split(',').map(Number) : fallback;
}

export type PipelineConfig = typeof pipeline;
```

### 0.2 — Why This Shape

| Design Decision | Rationale |
|----------------|-----------|
| **Single `pipeline` object** | One import, one place to look. No config scattered across files. |
| **Env var overrides** | Tune in `docker-compose.yml` without code changes or Docker rebuild. |
| **`as const`** | Full type safety — consumers get literal types, not `number`. |
| **Grouped by subsystem** | Context, agent, memory, circuit breaker, tasks, formatting, rate limiting. |
| **Sane defaults** | Works out of the box. Override only what you need. |
| **No runtime reload** | Read once at import. Restart to apply changes. Simple, predictable. |

### 0.3 — How Consumers Use It

Before (hardcoded):
```typescript
// agent/core.ts
const MAX_TOOL_CALLS = 5;
// ...
function buildMessageHistory(session: Session, maxMessages = 10) {
```

After (configurable):
```typescript
// agent/core.ts
import { pipeline } from '../config/pipeline.js';
// ...
function buildMessageHistory(session: Session, maxMessages = pipeline.historyWindow) {
```

Every `const` in the audit → replaced with `pipeline.<param>`. One import, zero magic numbers.

### 0.4 — Docker Compose Integration

```yaml
# docker-compose.yml — tune without rebuild
services:
  fetch-bridge:
    environment:
      # Scale up for longer conversations
      - FETCH_HISTORY_WINDOW=30
      - FETCH_COMPACTION_THRESHOLD=60
      # Tighter token budget for cheaper models
      - FETCH_CHAT_MAX_TOKENS=200
      - FETCH_TOOL_MAX_TOKENS=300
      # Faster rate limiting for production
      - FETCH_RATE_LIMIT_MAX=15
```

### 0.5 — Scaling Guide

| Scenario | What to Tune | Suggested Values |
|----------|-------------|-----------------|
| **Longer conversations** | `FETCH_HISTORY_WINDOW`, `FETCH_COMPACTION_THRESHOLD` | 30, 60 |
| **Cheaper model (8K context)** | `FETCH_HISTORY_WINDOW`, `FETCH_CHAT_MAX_TOKENS` | 10, 150 |
| **Large context model (200K)** | `FETCH_HISTORY_WINDOW`, `FETCH_COMPACTION_THRESHOLD` | 50, 100 |
| **High-traffic (multiple users)** | `FETCH_RATE_LIMIT_MAX`, `FETCH_RATE_LIMIT_WINDOW` | 60, 60000 |
| **Precision recall needed** | `FETCH_RECALL_LIMIT`, `FETCH_RECALL_SNIPPET_TOKENS` | 10, 500 |
| **Slow harness (large repos)** | `FETCH_HARNESS_TIMEOUT`, `FETCH_TASK_TIMEOUT` | 600000, 600000 |
| **Minimal resource usage** | All token limits | halve each |

### 0.6 — TUI Pipeline Tuning (Go Manager)

> **Goal:** Let the Alpha tune pipeline parameters from the Fetch TUI without editing `.env` by hand. Same fields, same env vars, same file — just a nicer UI.

**File:** `manager/internal/config/editor.go`

**How it works:** The TUI config editor already reads/writes `.env` via `ConfigField{Key, Value, Label, Help, Masked}`. Pipeline tuning = add new `ConfigField` entries with `FETCH_*` keys. The Node.js `config/pipeline.ts` reads the same env vars from the same `.env` file that Docker Compose passes through.

**New fields added to `NewEditor()`:**

```go
// ─── Pipeline Tuning ──────────────────────────────────────
{Key: "FETCH_HISTORY_WINDOW", Label: "History Window", Help: "Messages in sliding window (default: 20)"},
{Key: "FETCH_COMPACTION_THRESHOLD", Label: "Compaction Threshold", Help: "Compact when messages exceed this (default: 40)"},
{Key: "FETCH_CHAT_MAX_TOKENS", Label: "Chat Max Tokens", Help: "Token budget for chat responses (default: 300)"},
{Key: "FETCH_TOOL_MAX_TOKENS", Label: "Tool Max Tokens", Help: "Token budget for tool responses (default: 500)"},
{Key: "FETCH_CHAT_TEMPERATURE", Label: "Chat Temperature", Help: "LLM creativity 0.0-1.0 (default: 0.7)"},
{Key: "FETCH_TOOL_TEMPERATURE", Label: "Tool Temperature", Help: "LLM precision 0.0-1.0 (default: 0.3)"},
{Key: "FETCH_MAX_TOOL_CALLS", Label: "Max Tool Calls", Help: "Tool call rounds per message (default: 5)"},
{Key: "FETCH_RATE_LIMIT_MAX", Label: "Rate Limit Max", Help: "Requests per window (default: 30)"},
{Key: "FETCH_TASK_TIMEOUT", Label: "Task Timeout (ms)", Help: "Task execution timeout (default: 300000)"},
{Key: "FETCH_HARNESS_TIMEOUT", Label: "Harness Timeout (ms)", Help: "AI harness timeout (default: 300000)"},
```

**Rendering:** The existing `View()` method renders all fields in a list. To visually separate pipeline tuning from core config, we add a **section separator** — a disabled `ConfigField` with `IsSeparator: true` that renders as `─── Pipeline Tuning ───` instead of a key-value pair.

**View change in `editor.go`:**
```go
type ConfigField struct {
    Key         string
    Value       string
    Label       string
    Help        string
    Masked      bool
    IsSeparator bool  // NEW — renders as section header, not editable
}
```

In `View()`:
```go
if field.IsSeparator {
    s += "\n" + separatorStyle.Render(field.Label) + "\n"
    continue
}
```

In `Update()` — skip separators during navigation:
```go
case "up", "k":
    for i := e.cursor - 1; i >= 0; i-- {
        if !e.fields[i].IsSeparator { e.cursor = i; break }
    }
```

**Data flow:**
```
TUI Editor → saves → .env file → Docker Compose reads → process.env → config/pipeline.ts → all consumers
```

No new data path. The `.env` file IS the configuration layer. The TUI just makes it user-friendly.

---

## Phase 0 Checklist ✅ (Completed — commit `1db8814`)

- [x] **0.1** Create `config/pipeline.ts` with all pipeline parameters
- [x] **0.2** `agent/core.ts` — Replace all 15 magic numbers with `pipeline.*` imports
- [x] **0.3** `session/manager.ts` — Replace truncation limit with `pipeline.compactionThreshold` / `pipeline.historyWindow`
- [x] **0.4** `conversation/summarizer.ts` — Replace `SUMMARY_THRESHOLD` with `pipeline.compactionThreshold`
- [x] **0.5** `agent/whatsapp-format.ts` — Replace formatting limits with `pipeline.whatsappMaxLength` / `pipeline.whatsappLineWidth`
- [x] **0.6** `security/rateLimiter.ts` — Replace rate limit constants with `pipeline.rateLimitMax` / `pipeline.rateLimitWindow`
- [x] **0.7** `bridge/client.ts` — Replace timeout/retry constants with `pipeline.*`
- [x] **0.8** `task/types.ts` + `task/manager.ts` — Replace timeout defaults with `pipeline.taskTimeout`
- [x] **0.9** `harness/types.ts` — Replace harness timeout with `pipeline.harnessTimeout`
- [x] **0.10** `validation/common.ts` — Replace validation limits with `pipeline.*`
- [x] **0.11** `manager/internal/config/editor.go` — Add `IsSeparator` field, pipeline `FETCH_*` fields, skip-separator navigation
- [x] **0.T** Unit test: verify defaults, verify env var overrides
- [x] **0.R** Update `docker-compose.yml` with commented-out tuning examples

---

## The 10 Broken Pipes

| # | Problem | File | Line | Impact |
|---|---------|------|------|--------|
| 1 | Handler bypasses SessionManager API | `handler/index.ts` | 121-131 | Tool calls, summarizer, truncation all dead |
| 2 | `buildMessageHistory()` strips tool data | `agent/core.ts` | 688-693 | LLM sees only `{role, content}`, no tool memory |
| 3 | Tool call results live in local array only | `agent/core.ts` | 546, 606-609 | Results vanish after response |
| 4 | `maxMessages` defaults to 10 (5 turns) | `agent/core.ts` | 687 | Context permanently lost after 5 exchanges |
| 5 | No compaction / memory management | `session/manager.ts` | 269 | Messages grow unbounded, no condensation of older context |
| 6 | Task completions not in session | `task/integration.ts` | 252-258 | User never learns task finished unless they ask |
| 7 | No WhatsApp notification on task complete | `task/integration.ts` | 252 | Event emitted, nobody listens to send message |
| 8 | `sessionId` not passed to tools | `agent/core.ts` | 604 | Tasks created with `sessionId: 'unknown'` |
| 9 | `buildTaskFramePrompt()` never called | `agent/core.ts` | N/A | Harness gets raw user text, not framed goal |
| 10 | `filesModified` hardcoded to `[]` | `task/integration.ts` | 303 | Task results have no file change data |

---

## Phase 1: Wire the Pipes

> **Goal:** Use the existing SessionManager API. Fix the message format. Bump to 20 messages. Fire the summarizer. Hook task completions.
>
> **Estimated effort:** 6 files, ~200 lines changed
>
> **Risk:** Low — all APIs already exist, we're just calling them

### 1.1 — Handler: Use SessionManager API

**File:** `handler/index.ts`
**Lines:** 119-133 (the `session.messages.push()` block)

**Current code:**
```typescript
// Update session message history
session.messages = session.messages || [];
session.messages.push(
  { id: nanoid(), role: 'user', content: message, timestamp: new Date().toISOString() },
  { id: nanoid(), role: 'assistant', content: response.text, timestamp: new Date().toISOString() }
);
await sManager.updateSession(session);
```

**Replace with:**
```typescript
// Store user message via SessionManager (triggers summarizer + truncation)
await sManager.addUserMessage(session, message);

// Store assistant response
await sManager.addAssistantMessage(session, response.text);
```

**Why:** `addUserMessage()` calls `summarizer.checkAndSummarize()` in background. `addAssistantMessage()` uses `createMessage()` which includes proper IDs and timestamps. Both persist immediately via `store.update()`.

**Unlocks:** Summarizer (#5), proper message IDs, truncation.

---

### 1.2 — Agent Core: Persist Tool Calls to Session

**File:** `agent/core.ts`
**Function:** `handleWithTools()` (lines 540-660)

**Current:** Tool calls stored in local `toolCalls` array. Results added to local `messages` array for the OpenAI loop. Neither written to `session.messages`.

**Change:** After each tool call round, write the assistant tool-call message and each tool result to the session:

```typescript
// After: messages.push(assistantMessage);
// ADD: Persist assistant's tool_call request to session
const sManager = await getSessionManager();
await sManager.addAssistantToolCallMessage(
  session,
  assistantMessage.content || '',
  currentToolCalls.map(tc => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments
  }))
);

// After each: messages.push({ role: 'tool', tool_call_id, content });
// ADD: Persist tool result to session
await sManager.addToolMessage(
  session,
  { name: toolName, args: toolArgs, result: result.output, duration: Date.now() - toolStart },
  JSON.stringify(result),
  toolCall.id
);
```

**Also in `handleConversation()`:** No tool calls here, no changes needed — conversation turns are already handled by 1.1.

**Unlocks:** Tool memory (#1, #3), session persistence of tool interactions.

---

### 1.3 — Agent Core: Fix `buildMessageHistory()` for OpenAI Multi-Turn Format

**File:** `agent/core.ts`
**Function:** `buildMessageHistory()` (lines 685-694)

**Current:**
```typescript
function buildMessageHistory(session: Session, maxMessages = 10) {
  return session.messages.slice(-maxMessages).map((msg: Message) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));
}
```

**Replace with:**
```typescript
function buildMessageHistory(
  session: Session,
  maxMessages = 20
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const recent = session.messages.slice(-maxMessages);
  const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  for (const msg of recent) {
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      // Assistant message requesting tool calls — OpenAI format
      result.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });
    } else if (msg.role === 'tool' && msg.toolCall) {
      // Tool result message — must have tool_call_id
      result.push({
        role: 'tool',
        tool_call_id: msg.id, // We stored tool_call_id as the message id
        content: msg.content,
      });
    } else {
      // Regular user or assistant message
      result.push({
        role: msg.role === 'tool' ? 'assistant' : (msg.role as 'user' | 'assistant'),
        content: msg.content,
      });
    }
  }

  return result;
}
```

**Why:** OpenAI's API requires `tool_calls` on assistant messages and `tool_call_id` on tool result messages for proper multi-turn. Without this, the API either rejects the request or the LLM has zero tool memory. This is the **industry standard** format used by every agent framework.

**Key design decision:** `maxMessages = 20` (not 10). 20 messages ≈ 10 turns, or ~5 tool call rounds. With `max_tokens: 500` per response, this is roughly 10k-15k tokens of history — well within budget for any modern model.

**Unlocks:** Tool memory visible to LLM (#2, #4), proper multi-turn conversations.

---

### 1.4 — Agent Core: Pass `sessionId` Through Tool Execution

**File:** `agent/core.ts`
**Function:** `handleWithTools()` (line 604)

**Current:**
```typescript
const result = await registry.execute(toolName, toolArgs);
```

**Change approach — inject `sessionId` into args for task tools:**
```typescript
// Pass sessionId for tools that need it (task_create, task_respond)
const enrichedArgs = ['task_create', 'task_respond'].includes(toolName)
  ? { ...toolArgs, _sessionId: session.id }
  : toolArgs;
const result = await registry.execute(toolName, enrichedArgs);
```

**File:** `tools/task.ts`
**Function:** `handleTaskCreate()` (line 58)

**Change:** Extract `_sessionId` from input before validation:
```typescript
export async function handleTaskCreate(input: unknown, sessionId?: string): Promise<ToolResult> {
  // Extract injected sessionId from enriched args
  const rawInput = input as Record<string, unknown>;
  const resolvedSessionId = sessionId ?? (rawInput._sessionId as string) ?? undefined;
  const cleanInput = { ...rawInput };
  delete cleanInput._sessionId;
  
  const parseResult = TaskCreateInputSchema.safeParse(cleanInput);
  // ... rest uses resolvedSessionId instead of sessionId
```

**Alternative (cleaner):** Add a `context` parameter to `registry.execute()`:
```typescript
// registry.ts
public async execute(name: string, args: unknown, context?: { sessionId?: string }): Promise<ToolResult>

// Then in task.ts, the handler signature becomes:
// handler: (args: unknown, context?: { sessionId?: string }) => Promise<ToolResult>
```

**Recommendation:** Use the `context` approach — it's cleaner and extensible for future needs (user preferences, workspace context, etc.).

**Unlocks:** Tasks linked to sessions (#8).

---

### 1.5 — Task Completion: Session Notification + WhatsApp Message

**File:** `handler/index.ts`
**Function:** `initializeHandler()` (line 39)

**Add after task integration initialization:**
```typescript
// Subscribe to task completion events
const integration = (await import('../task/integration.js')).getTaskIntegration();

integration.on('task:completed', async ({ taskId, sessionId }) => {
  if (!sessionId || sessionId === 'unknown') return;
  
  const sManager = sessionManager!;
  const session = await sManager.getOrCreateSession(sessionId);
  const taskMgr = await getPersistentTaskManager();
  const task = taskMgr.getTask(taskId);
  
  if (!task) return;
  
  // Add completion message to session history
  const summary = task.result?.summary ?? 'Task completed';
  await sManager.addAssistantMessage(session, `✅ Task completed: ${summary}`);
  
  // Clear active task
  session.activeTaskId = null;
  await sManager.updateSession(session);
  
  // Send WhatsApp notification (if onProgress callback available)
  // This requires storing the WhatsApp send function — see 1.5b
});

integration.on('task:failed', async ({ taskId, sessionId, error }) => {
  if (!sessionId || sessionId === 'unknown') return;
  
  const sManager = sessionManager!;
  const session = await sManager.getOrCreateSession(sessionId);
  
  await sManager.addAssistantMessage(session, `❌ Task failed: ${error ?? 'Unknown error'}`);
  session.activeTaskId = null;
  await sManager.updateSession(session);
});
```

**File:** `handler/index.ts` — **WhatsApp send callback**

The handler doesn't currently have a way to proactively send messages. We need to store the WhatsApp client's `sendMessage` callback:

```typescript
// Module-level
let sendWhatsApp: ((userId: string, text: string) => Promise<void>) | null = null;

export function registerWhatsAppSender(fn: (userId: string, text: string) => Promise<void>): void {
  sendWhatsApp = fn;
}
```

Then in the task completion listener:
```typescript
if (sendWhatsApp) {
  await sendWhatsApp(session.userId, `🐕 ✅ Task finished!\n\n${summary}`);
}
```

**The bridge client (bridge/client.ts)** calls `registerWhatsAppSender` during initialization, providing the actual `sock.sendMessage` wrapper.

**Unlocks:** Task completion visibility (#6, #7), proactive WhatsApp notifications.

---

### 1.6 — Task Framing: Use `buildTaskFramePrompt()`

**File:** `agent/core.ts`
**Function:** `handleWithTools()` — after `task_create` tool call is detected

**Current:** The raw `goal` from tool args goes directly to the harness.

**Change:** When `task_create` is the tool being called, use `frameTaskGoal()` to produce a self-contained goal:

This is already partially implemented — `frameTaskGoal()` exists at line 706 and calls `buildTaskFramePrompt()`. The issue is it's never invoked in the tool pipeline.

**Best insertion point:** In `tools/task.ts` `handleTaskCreate()`, before creating the task:
```typescript
// Frame the goal for the harness (self-contained, no chat references)
const { frameTaskGoal } = await import('../agent/core.js');
const framedGoal = await frameTaskGoal(goal, session);
const task = await manager.createTask({ goal: framedGoal, agent, workspace, timeout }, resolvedSessionId);
```

**This requires** passing `session` to `handleTaskCreate()` — use the `context` parameter from 1.4.

**Unlocks:** Better harness results (#9), self-contained task goals.

---

### 1.7 — Compaction (Claude Code Model)

> **Design:** Replace the current rolling-summaries approach with a compaction model.
> When messages exceed a threshold, condense everything before the sliding window
> into a single summary. The summary replaces those messages — the array shrinks.
> One summary, refreshed each compaction cycle.

**Why compaction over rolling summaries:**
- **Simpler** — no separate `conversation_summaries` table, summary lives in `session.metadata`
- **Self-managing** — message array never grows unbounded
- **Token-bounded** — context is always: system prompt + compaction summary (~500 tok) + last 20 messages
- **Industry standard** — this is how Claude Code, Cursor, and Windsurf manage long conversations

**File:** `session/manager.ts` — New `compactIfNeeded()` method

```typescript
import { pipeline } from '../config/pipeline.js';

async compactIfNeeded(session: Session): Promise<void> {
  if (session.messages.length <= pipeline.compactionThreshold) return;

  const keep = pipeline.historyWindow;
  const oldMessages = session.messages.slice(0, -keep);
  const recentMessages = session.messages.slice(-keep);

  // Build transcript of old messages for summarization
  const transcript = oldMessages.map(m => {
    const role = m.role.toUpperCase();
    let content = m.content;
    if (m.toolCalls) content += ` [Tools: ${m.toolCalls.map(t => t.name).join(', ')}]`;
    if (m.toolCall) content = `[${m.toolCall.name}]: ${m.toolCall.result ?? 'no result'}`;
    return `${role}: ${content}`;
  }).join('\n');

  // LLM-generate compact summary
  const summary = await this.generateCompactionSummary(transcript, session);

  // Replace old messages with summary in metadata
  session.metadata.compactionSummary = summary;
  session.metadata.compactedAt = new Date().toISOString();
  session.metadata.compactedMessageCount = (session.metadata.compactedMessageCount ?? 0) + oldMessages.length;
  session.messages = recentMessages;

  await this.store.update(session);
  logger.info('Compacted session', {
    removed: oldMessages.length,
    remaining: recentMessages.length,
    totalCompacted: session.metadata.compactedMessageCount
  });
}
```

**Trigger:** Called from `addUserMessage()` and `addAssistantMessage()` — replaces the current `summarizer.checkAndSummarize()` call.

**File:** `agent/prompts.ts` `buildContextSection()` — Replace summaries block

```typescript
// Compaction summary (replaces V3.1 rolling summaries)
if (session.metadata?.compactionSummary) {
  parts.push('\n## Conversation History 🧠');
  parts.push(session.metadata.compactionSummary);
  parts.push(`_(${session.metadata.compactedMessageCount} earlier messages condensed)_`);
}
```

**Token budget impact:**
- Compaction summary: ~500 tokens (one summary, refreshed each cycle)
- Replaces: 2 × 500 = 1,000 tokens of rolling summaries
- **Net savings: ~500 tokens** while providing better coverage

**What happens to the existing summarizer:**
- `conversation/summarizer.ts` becomes dead code — remove or keep as fallback
- `conversation_summaries` table stays in schema for backward compat but is no longer written to
- `buildContextSection()` reads from `session.metadata.compactionSummary` instead of `store.getSummaries()`

---

## Phase 1 Checklist

- [x] **1.1** `handler/index.ts` — Replace `session.messages.push()` with `sManager.addUserMessage()` + `sManager.addAssistantMessage()` ✅ (commit TBD)
- [x] **1.2** `agent/core.ts` `handleWithTools()` — Persist tool call messages via `sManager.addAssistantToolCallMessage()` + `sManager.addToolMessage()` ✅
- [x] **1.3** `agent/core.ts` `buildMessageHistory()` — Rewrite to emit OpenAI multi-turn format with `tool_calls` + `tool_call_id`, bump to 20 messages ✅
- [x] **1.4a** `tools/registry.ts` `execute()` — Add `context?: { sessionId?: string }` parameter via `ToolContext` interface ✅
- [x] **1.4b** `agent/core.ts` — Pass `{ sessionId: session.id }` to `registry.execute()` ✅
- [x] **1.4c** `tools/task.ts` `handleTaskCreate()` — Accept `ToolContext` param, use `context.sessionId` ✅
- [x] **1.5a** `handler/index.ts` — Add `task:completed` / `task:failed` event listeners in `initializeHandler()` ✅
- [x] **1.5b** `handler/index.ts` — Add `registerWhatsAppSender()` function ✅
- [x] **1.5c** `bridge/client.ts` — Call `registerWhatsAppSender()` during init ✅
- [x] **1.6** `tools/task.ts` — Call `frameTaskGoal()` before dispatching to harness ✅
- [x] **1.7a** `session/manager.ts` — Add `compactIfNeeded()` + `generateCompactionSummary()` methods ✅
- [x] **1.7b** `session/manager.ts` — Replace `summarizer.checkAndSummarize()` with `this.compactIfNeeded()` in `addUserMessage()` ✅
- [x] **1.7c** `agent/prompts.ts` — Replace `store.getSummaries()` with `session.metadata.compactionSummary` read ✅
- [x] **1.T** 13 new unit tests: buildMessageHistory (6), ToolContext (1), compaction (2), handler API (1), task hooks (2), prompts (1) ✅
- [ ] **1.R** Rebuild Docker, test full flow: message → tool call → task create → task complete → WhatsApp notification

---

## Phase 2: BM25 Memory & Precision Recall

> **Goal:** Compaction gives you the gist of older conversation, but sometimes you need *specific* details ("what was the port number we chose?"). BM25 retrieval provides precision recall from the full message history — even messages that were compacted away.
>
> **How it complements compaction:** Messages are indexed in FTS5 *before* being compacted. The compaction summary gives the LLM general awareness; BM25 recall gives it specific facts when the current query demands them.
>
> **Estimated effort:** 3 new files, 2 modified files, ~400 lines
>
> **Risk:** Medium — new subsystem, but SQLite FTS5 is battle-tested
>
> **GitHub Issue:** #25 (already exists)

### 2.1 — FTS5 Index Schema

**New file:** `fetch-app/src/memory/schema.ts`

```sql
-- Single unified search index across all memory types
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  content,           -- The searchable text
  source_type,       -- 'message' | 'tool_result' | 'task_result' | 'summary'
  source_id,         -- ID of the source record
  session_id,        -- Which session this belongs to
  timestamp,         -- ISO timestamp for recency scoring
  tokenize='porter unicode61'  -- Standard English stemming
);
```

**Why FTS5 over FTS4:** BM25 ranking built-in, better Unicode support, `rank` function for scoring, `highlight()` for snippet extraction.

**Index population:** Triggered alongside `addUserMessage()`, `addToolMessage()`, etc. Each message insert also inserts into FTS5.

---

### 2.2 — Memory Manager

**New file:** `fetch-app/src/memory/manager.ts`

```typescript
export class MemoryManager {
  // Index a message
  async index(entry: MemoryEntry): Promise<void>;
  
  // Search with BM25 ranking
  async search(query: string, sessionId: string, limit?: number): Promise<MemoryResult[]>;
  
  // Hybrid search: BM25 + recency boost
  async recall(query: string, sessionId: string, options?: RecallOptions): Promise<string>;
}
```

**Search strategy:**
1. Run FTS5 `MATCH` query with BM25 ranking
2. Apply recency decay: `score = bm25_score * (1 / (1 + age_hours * 0.1))`
3. Deduplicate (same source_id)
4. Return top-K results formatted as context block

**Integration point:** Called in `buildContextSection()` (prompts.ts) to inject a `## Relevant Memory 🧠` section.

---

### 2.3 — Index Population

**File:** `session/manager.ts` — Add FTS5 indexing alongside each `add*Message()` call

```typescript
async addUserMessage(session: Session, content: string): Promise<Message> {
  const message = createMessage('user', content);
  session.messages.push(message);
  await this.store.update(session);
  
  // Index in FTS5 BEFORE compaction (so compacted messages are still searchable)
  await memoryManager.index({
    content, sourceType: 'message', sourceId: message.id,
    sessionId: session.id, timestamp: message.timestamp
  });
  
  // Compaction check (Phase 1)
  await this.compactIfNeeded(session);
  return message;
}
```

Same pattern for `addToolMessage()`, `addAssistantMessage()`. Key: FTS5 indexing happens *before* compaction — this is how BM25 can recall details from compacted messages.

---

### 2.4 — Context Injection

**File:** `agent/prompts.ts` `buildContextSection()`

**Add after summaries block:**
```typescript
// BM25 Memory Recall (Phase 2)
const memoryManager = getMemoryManager();
const recalled = await memoryManager.recall(currentMessage, session.id, { limit: 5 });
if (recalled) {
  parts.push('\n## Relevant Memory 🧠');
  parts.push(recalled);
}
```

**This requires** passing the current message to `buildContextSection()` — add parameter: `buildContextSection(session: Session, currentMessage?: string)`.

---

## Phase 2 Checklist

- [ ] **2.1** Create `memory/schema.ts` with FTS5 table creation
- [ ] **2.2** Create `memory/manager.ts` with `MemoryManager` class (index, search, recall)
- [ ] **2.3** Create `memory/types.ts` with `MemoryEntry`, `MemoryResult`, `RecallOptions`
- [ ] **2.4** `session/manager.ts` — Add `memoryManager.index()` calls in all `add*Message()` methods
- [ ] **2.5** `session/manager.ts` — Index compaction summaries in FTS5 (so even summaries are searchable)
- [ ] **2.6** `agent/prompts.ts` `buildContextSection()` — Add `currentMessage` param, inject recalled memory
- [ ] **2.7** `agent/core.ts` — Pass current message to `buildContextSection(session, message)`
- [ ] **2.8** Migration: Backfill existing session messages into FTS5 index on first startup
- [ ] **2.T** Unit tests: FTS5 indexing, BM25 search ranking, recency decay, recall formatting
- [ ] **2.R** Integration test: Send 30+ messages, verify older context recalled via BM25

---

## Phase 3: Vector Similarity (Future)

> **Goal:** Semantic search for when BM25 keyword matching isn't enough. "What was that auth fix?" should find messages about "JWT token refresh" even without keyword overlap.
>
> **Estimated effort:** 2 new files, 2 modified files, ~300 lines + model download
>
> **Risk:** Higher — requires embedding model in Docker, increases image size
>
> **Prerequisite:** Phase 2 complete and stable

### 3.1 — Embedding Model

**Model:** `all-MiniLM-L6-v2` (22MB, runs on CPU, 384-dim vectors)
**Runtime:** ONNX via `@xenova/transformers` (runs in Node.js, no Python needed)

### 3.2 — Vector Storage

**SQLite-native approach** using a `vectors` table:
```sql
CREATE TABLE IF NOT EXISTS memory_vectors (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  embedding BLOB NOT NULL,  -- Float32Array as Buffer
  timestamp TEXT NOT NULL
);
```

Cosine similarity computed in JavaScript (384-dim dot product is fast enough for <10k vectors per session).

### 3.3 — Hybrid Retrieval

Combine BM25 and vector scores:
```
final_score = α * normalize(bm25_score) + (1 - α) * cosine_similarity
```

Where `α = 0.6` (favor keyword match, use vectors for semantic gap-filling).

### 3.4 — Embedding Pipeline

Index at the same points as FTS5 — when messages/tools/summaries are added. Batch embedding calls to avoid per-message latency.

---

## Phase 3 Checklist

- [ ] **3.1** Add `@xenova/transformers` to `package.json`
- [ ] **3.2** Create `memory/embeddings.ts` — model loading, embedding generation
- [ ] **3.3** Create `memory/vectors.ts` — vector storage, cosine similarity search
- [ ] **3.4** `memory/manager.ts` — Add `hybridSearch()` combining BM25 + vector scores
- [ ] **3.5** `memory/schema.ts` — Add `memory_vectors` table creation
- [ ] **3.6** Dockerfile — Pre-download `all-MiniLM-L6-v2` ONNX model
- [ ] **3.T** Unit tests: embedding generation, cosine similarity, hybrid scoring
- [ ] **3.R** A/B comparison: BM25-only vs hybrid retrieval quality

---

## Implementation Order & Dependencies

```
Phase 0 (config/pipeline.ts) ──────── FOUNDATION — do this first, everything reads from it
                                   │
Phase 1.1 (handler API) ──────────┐│
Phase 1.3 (buildMessageHistory) ──┤│
Phase 1.4 (sessionId passthrough) ┼┤── All independent, can be done in parallel
Phase 1.5 (task completion hooks) ┤│   (all import pipeline.* for their constants)
Phase 1.6 (task framing) ─────────┘│
Phase 1.7 (compaction) ────────────┘
                                   │
Phase 1.2 (tool call persistence) ─┤── Depends on 1.4 (needs context param)
                                   │
Phase 1.T (tests) ─────────────────┘── After all Phase 1 code changes
Phase 1.R (rebuild + smoke test) ──── After tests pass
                                   │
Phase 2.1-2.3 (FTS5 schema/manager) ─┐
Phase 2.4-2.5 (index population) ────┤── Depends on Phase 1 (session API in use)
Phase 2.6-2.7 (context injection) ───┘   pipeline.recallLimit controls retrieval
Phase 2.T-2.R (tests) ────────────── After Phase 2 code
                                   │
Phase 3 (vectors) ─────────────────── After Phase 2 stable in production
```

---

## Token Budget Analysis

### Phase 1 Budget (Compaction Model)

| Component | Tokens (est.) | Notes |
|-----------|---------------|-------|
| System prompt (identity + context) | ~800 | Identity, skills, project state |
| Compaction summary | ~500 | One summary, refreshed each cycle |
| Sliding window (20 messages) | ~4,000 | Mix of user, assistant, tool messages |
| Tool call messages in window | ~2,000 | `tool_calls` + `tool` results (part of the 20) |
| Repo map + project context | ~500 | Already exists |
| **Phase 1 total** | **~7,800** | ~6% of 128K context |

### Phase 2 Budget (+ BM25 Recall)

| Component | Tokens (est.) | Notes |
|-----------|---------------|-------|
| Phase 1 total | ~7,800 | All of the above |
| BM25 recalled context | ~1,500 | Top 5 results, 300 tokens each |
| **Phase 2 total** | **~9,300** | ~7% of 128K context |

### Why This Works

- **WhatsApp messages are short** — avg 20-50 tokens per user message, not 200
- **Tool results are the biggest items** — but they're bounded by `pipeline.toolMaxTokens` (default 500)
- **Compaction is aggressive** — once you pass `pipeline.compactionThreshold` (40), everything before the window becomes ~`pipeline.compactionMaxTokens` (500) tokens
- **Massive headroom** — 7-9K out of 128K leaves 93%+ for the LLM response and future features
- **No risk of context overflow** — even at 32K model limits, 9K is under 30%
- **Fully tunable** — switch to a cheaper model? Set `FETCH_HISTORY_WINDOW=10 FETCH_CHAT_MAX_TOKENS=150`. Bigger model? `FETCH_HISTORY_WINDOW=50`

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Tool call messages bloat session JSON | Compaction at 40 messages condenses old context; array never exceeds ~20 messages after compaction |
| FTS5 index grows unbounded | Periodic pruning: delete entries older than 30 days for inactive sessions |
| `buildMessageHistory` format rejected by API | Validate format in unit tests against OpenAI's `ChatCompletionMessageParam` type |
| Task completion event fires before session loaded | Queue events, process after session manager is initialized |
| Breaking existing slash commands | Slash commands bypass agent entirely (line 109-114 in handler) — unaffected |
| Docker rebuild time | Only `fetch-bridge` needs rebuild for Phase 1-2; kennel unchanged |

---

## Success Criteria

### Phase 1 Complete When:
1. ✅ Send "select test-api" → tool calls `workspace_select` → send "what workspace am I in?" → LLM answers correctly from tool history (not asking again)
2. ✅ Send "create an Express API" → task starts → task completes → WhatsApp notification received without asking
3. ✅ Send 40+ messages → compaction fires → old messages condensed → summary visible in system prompt context → array shrinks to ~20
4. ✅ All 177+ existing tests still pass + new tests for `buildMessageHistory`, tool persistence, task hooks

### Phase 2 Complete When:
1. ✅ Send 30+ messages → ask about something from message #5 → BM25 retrieves relevant context
2. ✅ FTS5 search returns results ranked by relevance × recency
3. ✅ System prompt includes "Relevant Memory" section with recalled context

### Phase 3 Complete When:
1. ✅ Semantic query ("that auth fix") matches messages about "JWT token refresh"
2. ✅ Hybrid retrieval outperforms BM25-only on semantic gap queries
3. ✅ Embedding latency < 100ms per message on Docker CPU

---

## Files Changed Summary

### Phase 0 (1 new file, ~10 files modified)

| File | Change | Lines |
|------|--------|-------|
| `config/pipeline.ts` | NEW — Centralized pipeline config with env var overrides | ~80 |
| `agent/core.ts` | Replace 15 magic numbers with `pipeline.*` | ~15 |
| `agent/whatsapp-format.ts` | Replace formatting limits | ~4 |
| `session/manager.ts` | Replace truncation limit | ~2 |
| `conversation/summarizer.ts` | Replace threshold | ~2 |
| `security/rateLimiter.ts` | Replace rate limit constants | ~4 |
| `bridge/client.ts` | Replace timeout/retry constants | ~8 |
| `task/types.ts` + `task/manager.ts` | Replace timeout defaults | ~4 |
| `harness/types.ts` | Replace harness timeout | ~2 |
| `validation/common.ts` | Replace validation limits | ~4 |
| `docker-compose.yml` | Add commented tuning examples | ~10 |

### Phase 1 (7 files modified)

| File | Change | Lines |
|------|--------|-------|
| `handler/index.ts` | Use SessionManager API, task event listeners, WhatsApp sender | ~40 |
| `agent/core.ts` | `buildMessageHistory()` rewrite, tool call persistence, sessionId passthrough | ~80 |
| `tools/registry.ts` | Add `context` parameter to `execute()` | ~10 |
| `tools/task.ts` | Accept `context`, use `frameTaskGoal()` | ~20 |
| `bridge/client.ts` | Call `registerWhatsAppSender()` | ~5 |
| `session/manager.ts` | Add `compactIfNeeded()`, replace summarizer trigger | ~60 |
| `agent/prompts.ts` | Read compaction summary from `session.metadata` instead of `store.getSummaries()` | ~10 |

### Phase 2 (3 new files, 3 modified)

| File | Change | Lines |
|------|--------|-------|
| `memory/schema.ts` | NEW — FTS5 table creation | ~40 |
| `memory/manager.ts` | NEW — MemoryManager class | ~200 |
| `memory/types.ts` | NEW — Types for memory system | ~50 |
| `session/manager.ts` | Add FTS5 indexing in `add*Message()` methods + index compaction summaries | ~40 |
| `agent/prompts.ts` | Inject recalled memory in context | ~20 |

### Phase 3 (2 new files, 3 modified)

| File | Change | Lines |
|------|--------|-------|
| `memory/embeddings.ts` | NEW — ONNX embedding pipeline | ~150 |
| `memory/vectors.ts` | NEW — Vector storage + cosine search | ~150 |
| `memory/manager.ts` | Add `hybridSearch()` | ~50 |
| `memory/schema.ts` | Add `memory_vectors` table | ~10 |
| `Dockerfile` | Pre-download ONNX model | ~5 |
