# Fetch: Agentic Architecture

A deep dive into Fetch's autonomous agent framework — how it reasons, acts, and completes multi-step coding tasks.

---

## Executive Summary

Fetch transforms WhatsApp messages into intelligent coding assistance through a **4-mode architecture**. The key insight: WhatsApp's constraints (no rich UI, async messaging) push us toward a **transparent, recoverable, user-friendly** design that matches response complexity to user intent.

---

## The Orchestrator Architecture (V3)

Fetch v3 moves beyond simple intent classification to a **State-Machine Driven Orchestrator**.

### The Hierarchy

1.  **The Alpha (User)**: High-level intent, force overrides, trust management.
2.  **The Orchestrator (Fetch)**: Maintains context, plans tasks, guards safety, and orchestrates the sub-agents.
3.  **The Sub-agents (Harnesses)**: Specialized agents (Claude Code, Gemini CLI, Copilot CLI) that perform the actual heavy lifting (coding, terminal execution).

---

## 🧠 Cognitive Architecture

Fetch's "brain" is composed of layers, processed in order:

### 1. Instinct Layer (System Rules)
Before LLM processing, message content is checked against deterministic instinct handlers in `src/instincts/`.
*   **Speed:** < 5ms
*   **Function:** Safety (`stop`, `undo`, `clear`), info (`help`, `status`, `commands`), meta (`whoami`, `identity`, `skills`, `tools`), scheduling.
*   **Example:** User types "/stop" → `stopInstinct` immediately halts current process.

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
- Harnesses execute autonomously within sandboxed workspace
- Agent checks in at milestones, not every step
- Always interruptible with `/stop` or `/pause`
- Fetch orchestrates, harnesses implement

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

### Intent Classification (V3.2)

```typescript
type IntentType = 'conversation' | 'workspace' | 'task' | 'clarify';

interface ClassifiedIntent {
  type: IntentType;
  confidence: number;
  reason: string;
  entities?: ExtractedEntities;
}
```

The four-intent system (defined in `agent/intent.ts`) classifies messages using pattern matching with confidence scoring. The `clarify` intent handles ambiguous requests that need user input before routing.

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

### General

| Command | Description |
|---------|-------------|
| `@fetch /help` | Show capabilities |
| `@fetch /status` | Current state |
| `@fetch /commands` | List all commands |
| `@fetch /clear` | Reset session |

### Task Control

| Command | Description |
|---------|-------------|
| `@fetch /stop` | Halt current task |
| `@fetch /pause` | Pause current task |
| `@fetch /resume` | Resume paused task |
| `@fetch /undo` | Revert last change |

### Workspace

| Command | Description |
|---------|-------------|
| `@fetch /workspace <path>` | Set workspace |
| `@fetch /workspace` | Show current workspace |
| `@fetch /project` | Project context |

### Skills & Tools

| Command | Description |
|---------|-------------|
| `@fetch /skills` | List available skills |
| `@fetch /tools` | List available tools |
| `@fetch /harness <name>` | Use specific harness |

### Identity & Memory

| Command | Description |
|---------|-------------|
| `@fetch /identity` | Show identity |
| `@fetch /remember <fact>` | Store a fact |
| `@fetch /memory` | Show memory stats |

### Scheduling

| Command | Description |
|---------|-------------|
| `@fetch /remind <msg> in <time>` | Set reminder |
| `@fetch /schedule <msg> at <time>` | Schedule message |
| `@fetch /cron list` | List scheduled jobs |

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

Fetch uses OpenRouter to access 100+ AI models. The agent model is configured via environment:

```dotenv
AGENT_MODEL=anthropic/claude-sonnet-4
```

| Model | Best For | Cost |
|-------|----------|------|
| `anthropic/claude-sonnet-4` | Best overall coding | Medium |
| `anthropic/claude-haiku-4` | Fast, affordable | Low |
| `openai/gpt-4o` | Strong reasoning | Medium |
| `google/gemini-2.5-flash` | Free tier available | Free |
| `deepseek/deepseek-chat` | Very affordable | Very Low |

**Switch models via TUI**: Select "🤖 Select Model" from the menu.

### System Prompt Architecture

The system prompt is dynamically assembled at runtime by `IdentityManager.buildSystemPrompt()` — the single source of truth — from:
- `data/identity/COLLAR.md` — Core personality and directives
- `data/identity/ALPHA.md` — User profile and preferences
- `data/agents/*.md` — Pack member profiles (YAML frontmatter → `PackMember[]`)
- `data/agents/ROUTING.md` — Pack routing rules
- Active skills loaded from `data/skills/` (two-phase: `<available_skills>` → `<activated_skill>`)
- Session context (mode, workspace, memory)

See `identity/manager.ts` for the prompt assembly logic.

---

## Security Considerations

### 7-Layer Security

| Layer | Component |
|-------|----------|
| 1 | Owner Verification |
| 2 | Whitelist Check (Zero Trust Bonding) |
| 3 | @fetch Trigger Required |
| 4 | Rate Limiting |
| 5 | Input Validation |
| 6 | Path Traversal Protection |
| 7 | Docker Isolation |

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
| `agent/intent.ts` | Intent classification (4 intents) |
| `agent/prompts.ts` | Tool definitions and schema helpers (system prompts moved to IdentityManager) |
| `agent/format.ts` | WhatsApp message formatting |
| `agent/whatsapp-format.ts` | Mobile-friendly utilities |
| `identity/manager.ts` | System prompt assembly (`buildSystemPrompt()`) — single source of truth |
| `identity/loader.ts` | Parses COLLAR.md, ALPHA.md, and data/agents/*.md |
| `instincts/index.ts` | Instinct registry and routing |
| `instincts/*.ts` | Individual instinct handlers |
| `harness/index.ts` | Harness pool and spawner |
| `harness/executor.ts` | CLI process execution |
| `session/types.ts` | TypeScript interfaces |
| `session/store.ts` | SQLite persistence |
| `session/manager.ts` | Session lifecycle |
| `security/gate.ts` | Zero Trust Bonding gate |
| `security/validator.ts` | Input validation |
| `commands/parser.ts` | Command parsing |
| `tools/registry.ts` | Tool registration |

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

---

*Agentic Architecture for Fetch v3.2.0*
