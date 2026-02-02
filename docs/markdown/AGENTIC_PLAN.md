# Fetch: Agentic Architecture

A deep dive into Fetch's autonomous agent framework — how it reasons, acts, and completes multi-step coding tasks.

---

## Executive Summary

Fetch transforms WhatsApp messages into autonomous coding sessions. The key insight: WhatsApp's constraints (no rich UI, async messaging) push us toward a **transparent, recoverable, user-friendly** architecture.

---

## Design Principles

### 1. WhatsApp-Native Design
- All output is plain text (mobile readable)
- Diffs displayed as compact, scannable blocks
- Commands are simple words, not complex syntax
- Responses chunked for mobile readability

### 2. Git as the Undo Button
- Every approved change = automatic commit
- User can always say "undo" to revert
- Branch isolation for risky changes
- No fear of breaking things

### 3. Progressive Autonomy
- Start **supervised** (ask before each action)
- User can say "auto" to enable autonomous mode
- Agent checks in at milestones, not every step
- Always interruptible with "stop" or "pause"

### 4. Conversation as Context
- Full message history = agent memory
- Files mentioned become "active" context
- Context persists across sessions
- Clear commands to manage what agent "knows"

---

## Architecture Overview

<!-- DIAGRAM:architecture -->

---

## The ReAct Loop

Fetch uses the **ReAct (Reason + Act)** pattern for multi-step task execution:

<!-- DIAGRAM:react -->

### Loop Steps

1. **OBSERVE** — Receive user message + context
2. **DECIDE** — LLM determines next action
3. **EXECUTE** — Run the chosen tool
4. **REFLECT** — Update plan based on results
5. **LOOP** — Repeat until task complete or blocked

### Decision Types

| Decision | Description |
|----------|-------------|
| `use_tool` | Execute a tool (may need approval) |
| `ask_user` | Request clarification |
| `report_progress` | Send status update |
| `task_complete` | Signal success |
| `task_blocked` | Signal failure/need help |

---

## Session Management

<!-- DIAGRAM:session -->

### Session State

```typescript
interface Session {
  id: string;                     // WhatsApp JID
  messages: Message[];            // Last 30 messages in context
  currentTask?: AgentTask;        // Active task
  preferences: {
    autonomyLevel: 'supervised' | 'semi-autonomous' | 'autonomous';
    autoCommit: boolean;
    verboseMode: boolean;
  };
}
```

### Task State

```typescript
interface AgentTask {
  id: string;
  goal: string;                   // What user asked for
  status: TaskStatus;             // planning | executing | awaiting_approval | completed | failed
  iterations: number;
  maxIterations: number;          // Safety limit (25)
  filesModified: string[];
  commitsCreated: string[];
  pendingApproval?: ApprovalRequest;
}
```

### Persistence

**Why lowdb (JSON file)?**

| Factor | lowdb | SQLite | Vector DB |
|--------|-------|--------|-----------|
| Single user | ✅ Perfect | Overkill | Overkill |
| Resource use | ✅ Minimal | OK | Heavy |
| Human-readable | ✅ Yes | No | No |
| Complexity | ✅ None | Medium | High |

---

## Tool Registry

Fetch includes **24 built-in tools** for complete development workflows:

<!-- DIAGRAM:tools -->

### Auto-Approve Logic

| Tool Type | Auto-Approve |
|-----------|--------------|
| Read operations | ✅ Always |
| Code analysis | ✅ Always |
| Tests/Lint (no fix) | ✅ Always |
| Write operations | ❌ Ask |
| Git modifications | ❌ Ask |
| Shell commands | ❌ Ask |

### Approval Flow

```
Agent wants to edit file
         │
         ▼
Is mode autonomous? ───YES───▶ Execute
         │
         NO
         │
         ▼
Show diff + ask user
         │
    ┌────┴────┐
    │         │
   YES       NO
    │         │
    ▼         ▼
Execute    Skip
```

---

## WhatsApp Commands

### User Commands

| Command | Description |
|---------|-------------|
| `@fetch help` | Show available commands |
| `@fetch status` | Show current task status |
| `@fetch undo` | Revert last change |
| `@fetch undo all` | Revert all session changes |
| `@fetch auto` | Toggle autonomous mode |
| `@fetch supervised` | Return to supervised mode |
| `@fetch stop` | Cancel current task |
| `@fetch clear` | Clear conversation history |

### Approval Responses

| Response | Effect |
|----------|--------|
| `yes`, `y`, `👍` | Approve pending action |
| `no`, `n`, `👎` | Reject action |
| `skip` | Skip and continue |
| `yes all` | Approve all (switch to autonomous) |

---

## Message Formatting

### Diff Display

```
📝 *Edit: src/auth.ts*
─────────────────────
Line 45:
- const expired = new Date(exp) < new Date();
+ const expired = exp < Date.now() / 1000;
─────────────────────
Apply? (yes/no)
```

### Progress Updates

```
🔄 *Working on: Fix auth bug*

✅ 1. Read session.ts
✅ 2. Found expiry issue  
⏳ 3. Preparing fix...
⬚ 4. Run tests
⬚ 5. Commit changes
```

### Task Completion

```
✅ *Task Complete*

Fixed the session expiry bug.

📁 *Modified:*
• src/auth/session.ts

📝 *Commits:*
• a1b2c3d fix: use UTC for token expiry

🧪 *Tests:* 12/12 passing

Say "undo" to revert.
```

---

## LLM Configuration

### Model Choice

```typescript
const MODEL = process.env.AGENT_MODEL || 'openai/gpt-4o-mini';
```

**Why OpenRouter?**

OpenRouter provides access to **100+ AI models** through a single API, allowing you to switch models anytime:

| Model | Best For | Cost |
|-------|----------|------|
| `openai/gpt-4o-mini` | Fast, affordable, good reasoning | Low |
| `openai/gpt-4o` | Best overall quality | Medium |
| `anthropic/claude-3-5-sonnet` | Excellent coding | Medium |
| `google/gemini-2.0-flash-exp:free` | Free tier | Free |
| `deepseek/deepseek-chat` | Very affordable | Very Low |
| `meta-llama/llama-3.1-70b-instruct` | Open source | Low |

**Switch models via TUI**: Select "🤖 Select Model" from the menu.

### System Prompt Structure

```typescript
const systemPrompt = `You are Fetch, an AI coding assistant.

## Capabilities
- Read/edit files in /workspace
- Run shell commands
- Manage git

## Context
- Active files: ${activeFiles}
- Mode: ${autonomyLevel}
- Auto-commit: ${autoCommit}

## Repository
${repoMap}

## Guidelines
1. Be concise (mobile display)
2. Show diffs before changes
3. Run tests after code changes
4. Commit with clear messages
5. Ask for clarification when needed`;
```

---

## Security Considerations

### 5-Layer Protection

<!-- DIAGRAM:security -->

### Tool Isolation

- All shell commands run in Docker sandbox
- No network access in Kennel container
- Resource limits (2GB RAM, 2 CPU)
- Workspace is the only mounted volume

### Safe Defaults

- Supervised mode by default
- Destructive operations always require approval
- Git undo available for quick recovery
- Max 25 iterations per task (prevent runaway)

---

## Implementation Details

### Key Files

| File | Purpose |
|------|---------|
| `agent/core.ts` | ReAct loop implementation |
| `agent/format.ts` | WhatsApp message formatting |
| `session/types.ts` | TypeScript interfaces |
| `session/store.ts` | lowdb persistence |
| `session/manager.ts` | Session lifecycle |
| `tools/registry.ts` | Tool registration |
| `tools/*.ts` | Individual tool implementations |

### Error Handling

```typescript
// Agent gracefully handles failures
try {
  result = await executeTool(tool, args);
} catch (error) {
  if (isRecoverable(error)) {
    // Try alternative approach
    return { success: false, retry: true };
  } else {
    // Signal blocked
    return taskBlocked(error.message);
  }
}
```

---

## Future Enhancements

| Feature | Priority | Notes |
|---------|----------|-------|
| Multi-file edits | High | Batch related changes |
| Branch strategies | Medium | Auto-create for risky changes |
| Long-term memory | Low | Embeddings for project context |
| Web UI | Low | Optional dashboard |

---

*Architecture documentation for Fetch v0.1.0*
