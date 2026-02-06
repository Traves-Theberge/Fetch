# Agentic Architecture

## Cognitive Model

Fetch processes every message through three cognitive layers:

### Layer 1: Instincts (Deterministic)

Fast-path pattern matching that bypasses the LLM entirely. Handles slash commands, safety words, and approval responses in <5ms.

Examples: `/stop` → kill task, `/status` → format status, `yes` → approve pending action.

Instincts are defined as individual handler files in `src/instincts/`. Each exports a `match()` predicate and a `handle()` function.

### Layer 2: Intent Classification (Regex + Heuristic)

Analyzes the message text to determine one of three intents:

| Intent | Pattern | Handler |
|--------|---------|---------|
| **conversation** | Greetings, thanks, social | `handleConversation()` — Direct LLM, no tools |
| **inquiry** | Questions about code/status | `handleInquiry()` — Read-only tools, 1 cycle |
| **action** | Coding requests, project ops | `handleWithTools()` — Full ReAct loop |

Classification uses regex pattern matching (not an LLM call) for speed and determinism.

### Layer 3: Mode System (State Machine)

<!-- DIAGRAM:stateflow -->

The agent operates in one of five modes, persisted to SQLite:

| Mode | Emoji | Meaning |
|------|-------|---------|
| **ALERT** | 🟢 | Listening for new messages |
| **WORKING** | 🔵 | Executing a task via harness |
| **WAITING** | 🟠 | Blocked on user input (ask_user) |
| **GUARDING** | 🔴 | Dangerous action pending approval |
| **RESTING** | 💤 | Idle after timeout |

Transitions:
- ALERT → WORKING: task_create tool called
- WORKING → WAITING: ask_user tool called
- WAITING → WORKING: user responds
- ALERT → GUARDING: dangerous action detected
- GUARDING → WORKING: user approves
- GUARDING → ALERT: user denies
- ALERT → RESTING: idle timeout
- RESTING → ALERT: new message arrives

## ReAct Loop

<!-- DIAGRAM:react -->

For action intents, Fetch runs a ReAct (Reason + Act) loop:

1. **Decide** — LLM examines the goal, session context, and tool results
2. **Execute** — LLM calls one of 11 orchestrator tools
3. **Observe** — Tool result is appended to context
4. **Reflect** — LLM decides whether to continue or report completion
5. Loop repeats until task is complete, cancelled, or max iterations reached

The loop uses OpenRouter to call the configured `AGENT_MODEL` with tool definitions, session context, identity prompt, and activated skills.

## Harness Delegation

When the ReAct loop calls `task_create`, Fetch delegates actual coding work to an AI CLI:

1. **Executor** looks up the requested harness from the **Registry**
2. **Spawner** creates a child process via `docker exec` into the Kennel container
3. The harness adapter formats the goal into CLI-specific arguments
4. The CLI process runs against the mounted `/workspace`
5. Output is streamed back, parsed by the adapter, and reported to the user

### Adapter Hierarchy

All three harness adapters extend `AbstractHarnessAdapter`, which provides shared logic for:
- `formatGoal()` — Prepare the task description
- `isQuestion()` — Detect when the harness is asking a question
- `extractSummary()` — Parse completion summary from output
- `extractFileOperations()` — Detect file changes

Individual adapters override CLI-specific behavior (command args, output patterns).

## System Prompt Architecture

The system prompt is built dynamically by `IdentityManager.buildSystemPrompt()`:

1. **COLLAR.md** — Core identity and behavioral rules
2. **ALPHA.md** — Owner info and preferences
3. **Pack profiles** — Available agents as `<available_agents>` XML
4. **Available skills** — Skill summaries as `<available_skills>` XML
5. **Activated skills** — Full instruction bodies for triggered skills
6. **Session context** — Active project, git state, repo map, task state
7. **Tool definitions** — 11 orchestrator tools with Zod schemas

## Proactive System

Beyond responding to messages, Fetch can act proactively:

### Scheduler
Runs cron-based jobs. Supports one-shot reminders (`oneShot: true` flag auto-deletes after execution) and recurring schedules.

### Watcher
Monitors the active workspace for file changes and git state. Extends `EventEmitter` with typed events:
- `file:add` — New file created
- `file:change` — File modified
- `file:remove` — File deleted
- `git:behind` — Local branch is behind remote

### Commands
- `/remind 5m check tests` — One-shot reminder
- `/schedule "0 9 * * *" daily standup` — Recurring cron job
- `/cron list` — View active jobs
- `/cron remove <id>` — Delete a job
