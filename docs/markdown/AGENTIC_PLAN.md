# Fetch: Agentic Architecture

A deep dive into Fetch's autonomous agent framework — how it reasons, acts, and completes multi-step coding tasks.

---

## Executive Summary

Fetch transforms WhatsApp messages into intelligent coding assistance through a **4-mode architecture**. The key insight: WhatsApp's constraints (no rich UI, async messaging) push us toward a **transparent, recoverable, user-friendly** design that matches response complexity to user intent.

---

## The Orchestrator Architecture (V3)

Fetch v3 moves beyond simple intent classification to a **State-Machine Driven Orchestrator**.

### The Hierarchy

1.  **The Administrator (User)**: Helper commands, high-level intent.
2.  **The Orchestrator (Fetch)**: Maintains context, plans tasks, guards safety, and orchestrates the sub-agents.
3.  **The Sub-agents (Harnesses)**: Specialized agents (Claude Code, Gemini CLI, Copilot CLI) that perform the actual heavy lifting (coding, terminal execution).

---

## 🧠 Cognitive Architecture

Fetch's "brain" is composed of layers, processed in order:

### 1. Reflex Layer (System Rules)
Before LLM processing, message content is checked against deterministic patterns.
*   **Speed:** < 5ms
*   **Function:** Safety, immediate control (`stop`, `status`), mode switching.
*   **Example:** User types "STOP!" -> System immediately halts current process.

### 2. Mode System (State Machine)
The core of the agent is a finite state machine. The current **Mode** determines how the agent perceives and reacts to input.

| Mode | Trigger | Behavior |
|------|---------|----------|
| **ALERT** 🟢 | Default | Listening for commands. Assessing intent. |
| **WORKING** 🔵 | Task Start | Focusing on task execution. Ignores chit-chat. |
| **WAITING** 🟠 | Question | Paused, expecting specific user input. |
| **GUARDING** 🔴 | High Risk | Locked down. Requires explicit approval to proceed. |
| **RESTING** 💤 | Inactivity | Low-power monitoring (future). |

### 3. Skill & Tool Layer (Capabilities)
If no reflex or mode-lock intercepts the message, the **Orchestrator** plans a response using:
*   **Skills**: Modular capabilities (Git, Docker, Test) loaded from `data/skills/`.
*   **Tools**: Discrete actions (search_files, read_file).
*   **Harnesses**: Delegating complex coding tasks to external CLIs.

---

## Task Execution Flow

<!-- DIAGRAM:stateflow -->

### The Harness System

Unlike V2, Fetch V3 does not try to write all code itself. It "unleashes" specialized harnesses:
- **Claude Code**: Best for complex refactoring and reasoning.
- **Gemini CLI**: Good for fast context retrieval and simple scripts.
- **GitHub Copilot CLI**: Excellent for shell commands and explanations.

Fetch wraps these CLIs in a standardized **Harness Adapter**, handling stdin/stdout, error recovery, and context injection.

- Simple greetings don't need tool calls
- Complex requests get full task treatment

### 2. WhatsApp-Native Design
- All output is plain text (mobile readable)
- Diffs displayed as compact, scannable blocks
- Commands are simple words, not complex syntax
- Responses chunked for mobile readability

### 3. Git as the Undo Button
- Every approved change = automatic commit
- User can always say "undo" to revert
- Branch isolation for risky changes
- No fear of breaking things

### 4. Progressive Autonomy
- Start **supervised** (ask before each action)
- User can say "auto" to enable autonomous mode
- Agent checks in at milestones, not every step
- Always interruptible with "stop" or "pause"

### 5. Project Awareness
- Scan `/workspace` for git repositories
- Track active project in session
- Include git status in context
- Auto-detect project type (node, python, etc.)

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
  currentProject?: ProjectContext; // Active project
  availableProjects: string[];    // Projects in /workspace
  preferences: {
    autonomyLevel: 'supervised' | 'semi-autonomous' | 'autonomous';
    autoCommit: boolean;
    verboseMode: boolean;
  };
}

interface ProjectContext {
  name: string;                   // Directory name
  path: string;                   // Full path in /workspace
  type?: string;                  // node, python, go, etc.
  gitBranch?: string;             // Current git branch
  gitStatus?: string;             // Clean/dirty indicator
}
```

### Intent Classification (V2)

```typescript
interface IntentClassification {
  intent: IntentType;
  confidence: number;
  reasoning: string;
}

type IntentType = 'conversation' | 'workspace' | 'task';

// Pattern matching for each type:
const CONVERSATION_PATTERNS = ['hello', 'hi', 'hey', 'thanks', 'thank you'];
const WORKSPACE_PATTERNS = ['list', 'show', 'projects', 'status', 'switch', 'workspace'];
const TASK_PATTERNS = ['build', 'create', 'implement', 'refactor', 'fix', 'add'];
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

Sessions are stored in SQLite (`/app/data/sessions.db`) using `better-sqlite3` with WAL mode for optimal single-user performance and crash safety.

---

## Tool Registry

Fetch includes **11 orchestrator tools** for workspace management, task control, and user interaction:

### Workspace Tools (5)

| Tool | Auto-Approve | Description |
|------|--------------|-------------|
| `workspace_list` | ✅ | List all projects |
| `workspace_select` | ✅ | Select active project |
| `workspace_status` | ✅ | Git status & branch |
| `workspace_create` | ❌ | Create new project |
| `workspace_delete` | ❌ | Delete a project |

### Task Tools (4)

| Tool | Auto-Approve | Description |
|------|--------------|-------------|
| `task_create` | ❌ | Start a coding task |
| `task_status` | ✅ | Get task progress |
| `task_cancel` | ❌ | Cancel running task |
| `task_respond` | ✅ | Answer agent question |

### Interaction Tools (2)

| Tool | Auto-Approve | Description |
|------|--------------|-------------|
| `ask_user` | ✅ | Ask clarifying question |
| `report_progress` | ✅ | Report task progress |

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

### System Commands

| Command | Description |
|---------|-------------|
| `@fetch help` | Show available commands |
| `@fetch ping` | Connectivity test |
| `@fetch task` | Show current task status |

### Project Commands

| Command | Description |
|---------|-------------|
| `@fetch /projects` | List available projects |
| `@fetch /project <name>` | Switch to project |
| `@fetch /clone <url>` | Clone a repository |
| `@fetch /init <name>` | Initialize new project |
| `@fetch /status` | Git status |
| `@fetch /diff` | Show uncommitted changes |
| `@fetch /log [n]` | Show recent commits |

### Control Commands

| Command | Description |
|---------|-------------|
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
| `agent/core.ts` | Main orchestrator, routes by intent |
| `agent/intent.ts` | Intent classification patterns |
| `agent/conversation.ts` | Conversation mode (no tools) |
| `agent/inquiry.ts` | Inquiry mode (read-only) |
| `agent/action.ts` | Action mode (single edit cycle) |
| `agent/prompts.ts` | Centralized system prompts |
| `agent/format.ts` | WhatsApp message formatting |
| `agent/whatsapp-format.ts` | Mobile-friendly utilities |
| `session/types.ts` | TypeScript interfaces |
| `session/store.ts` | SQLite persistence |
| `session/manager.ts` | Session lifecycle |
| `session/project.ts` | Project scanner |
| `commands/parser.ts` | Command parsing |
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
| Semantic search | High | Find code by meaning |
| Multi-file actions | High | Batch related changes |
| Branch strategies | Medium | Auto-create for risky changes |
| Long-term memory | Low | Embeddings for project context |
| Web UI | Low | Optional dashboard |

---

*Architecture documentation for Fetch v0.2.0*
