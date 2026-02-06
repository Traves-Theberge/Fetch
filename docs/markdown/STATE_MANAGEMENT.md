# State Management Architecture

> Generated from code audit — February 5, 2026  
> Covers all singleton managers, persistence layers, event buses, and identified redundancies.

---

## Overview

Fetch has **22 stateful singletons** organized into 6 layers. State is distributed across **2 SQLite databases**, **filesystem watchers**, and **in-memory stores**.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Entry Point                              │
│                       src/index.ts                              │
│   Boots: StatusAPI → ModeManager → ProactiveSystem → Bridge    │
└────────┬────────────────────────┬───────────────────────────────┘
         │                        │
┌────────▼────────┐      ┌────────▼────────────────────────────┐
│  Bridge Layer   │      │         Handler Layer               │
│  bridge/client  │─────▶│  handler/index.ts                   │
│  (WhatsApp)     │      │  Refs: SessionManager, TaskManager  │
└─────────────────┘      └────────┬────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────┐
         │                        │                    │
┌────────▼────────┐      ┌────────▼────────┐  ┌───────▼────────┐
│  Agent Core     │      │  Instinct       │  │  Command       │
│  agent/core.ts  │      │  Registry       │  │  Parser        │
│  (LLM Loop)     │      │  (Deterministic)│  │  (Slash cmds)  │
└────────┬────────┘      └─────────────────┘  └────────────────┘
         │
         │  Uses ▼
┌────────┴───────────────────────────────────────────────┐
│               State Management Layer                    │
│                                                         │
│  SessionManager ─── SessionStore (sessions.db)          │
│  TaskManager ────── TaskStore (tasks.db)                │
│  ModeManager ────── SessionStore meta KV                │
│  IdentityManager ── Filesystem (data/identity/)         │
│  SkillManager ───── Filesystem (data/skills/)           │
│  ToolRegistry ───── Filesystem (data/tools/)            │
│  WorkspaceManager ─ In-memory (Docker volumes)          │
└────────┬───────────────────────────────────────────────┘
         │
┌────────▼───────────────────────────────────────────────┐
│              Execution Layer                             │
│                                                         │
│  TaskIntegration ── Orchestrates task → harness flow    │
│  HarnessExecutor ── Manages execution lifecycle         │
│  HarnessPool ────── Concurrency limits & queueing       │
│  HarnessSpawner ─── Process spawn/kill                  │
└─────────────────────────────────────────────────────────┘
```

---

## Persistence Map

### SQLite: `sessions.db`

| Table | Owner (DDL) | Operated By | Content |
|:------|:------------|:------------|:--------|
| `sessions` | SessionStore | SessionStore, SessionManager | Full session JSON blobs |
| `session_meta` | SessionStore | SessionStore, **ModeManager** | Key-value pairs (`FETCH_MODE`) |
| `conversation_summaries` | SessionStore | **ConversationSummarizer** | Thread summaries |
| `conversation_threads` | SessionStore | **session/ThreadManager** | Thread metadata + snapshots |

### SQLite: `tasks.db`

| Table | Owner (DDL) | Operated By | Content |
|:------|:------------|:------------|:--------|
| `tasks` | TaskStore | TaskStore, TaskManager | Task records |
| `task_metadata` | TaskStore | TaskStore | Task key-value metadata |
| `cron_jobs` | TaskStore | **⚠️ Nobody** | Dead table — never read or written |

### Filesystem (Hot-Reloaded via chokidar)

| Path | Watcher | Content |
|:-----|:--------|:--------|
| `data/identity/*.md` | IdentityManager | Agent persona, traits, behavior directives |
| `data/agents/*.md` | IdentityManager | Pack member profiles (YAML frontmatter → PackMember[]) |
| `data/skills/` | SkillManager | User-defined skill instructions |
| `src/skills/builtin/` | SkillManager | Built-in skill definitions |
| `data/tools/*.json` | ToolRegistry | Custom shell-based tool definitions |

### In-Memory Only (Lost on Restart)

| Manager | Lost State | Severity |
|:--------|:-----------|:---------|
| conversation/ThreadManager | All threads, active thread ID | 🔴 High |
| TaskScheduler | All cron jobs | 🔴 High |
| WorkspaceManager | Active workspace selection, cache | 🟡 Medium |
| ModeManager | Transition history | 🟢 Low |
| TaskQueue | Queue state | 🟢 Low (re-synced from TaskManager) |
| Status API | Uptime, message count | 🟢 Low (runtime metrics) |

---

## Singleton Inventory

### Pattern A: `static getInstance()` (Class-based)

| Manager | File | State Owned |
|:--------|:-----|:------------|
| ModeManager | `modes/manager.ts` | currentState, history, handlers map |
| IdentityManager | `identity/manager.ts` | identity, pack (PackMember[]), initialized, watchers (identity/ + agents/) |
| HarnessPool | `harness/pool.ts` | queue, config, spawner ref |
| TaskScheduler | `task/scheduler.ts` | jobs map, intervals, timers |
| ProactiveSystem | `proactive/index.ts` | polling + watcher refs |
| PollingService | `proactive/polling.ts` | intervals, config, running flag |
| WatcherService | `proactive/watcher.ts` | watchers map, config |
| session/ThreadManager | `session/thread-manager.ts` | (stateless — operates on DB) |
| conversation/ThreadManager | `conversation/thread.ts` | threads map, activeThreadId |
| ConversationSummarizer | `conversation/summarizer.ts` | OpenAI client, store ref |

### Pattern B: Module-level `let` + Factory Function

| Manager | File | Factory Function |
|:--------|:-----|:-----------------|
| SessionStore | `session/store.ts` | `getSessionStore()` |
| SessionManager | `session/manager.ts` | `getSessionManager()` (async) |
| TaskStore | `task/store.ts` | `getTaskStore()` |
| TaskManager | `task/manager.ts` | `getTaskManager()` (async) |
| SkillManager | `skills/manager.ts` | `getSkillManager()` |
| InstinctRegistry | `instincts/index.ts` | `getInstinctRegistry()` |
| WhitelistStore | `security/whitelist.ts` | `getWhitelistStore()` (async) |
| TaskIntegration | `task/integration.ts` | `getTaskIntegration()` |

### Pattern C: Exported `const` Instance

| Manager | File | Export |
|:--------|:-----|:-------|
| TaskQueue | `task/queue.ts` | `taskQueue` |
| HarnessExecutor | `harness/executor.ts` | `getHarnessExecutor()` |
| ModeDetector | `conversation/detector.ts` | `modeDetector` |
| workspaceManager | `workspace/manager.ts` | `workspaceManager` |

---

## Event Emitters

```
TaskManager (EventEmitter)
  ├── task:created
  ├── task:started
  ├── task:progress
  ├── task:waiting_input
  ├── task:completed
  ├── task:failed
  ├── task:cancelled
  ├── task:timeout
  └── task:file_op

TaskIntegration (EventEmitter)
  ├── task:progress
  ├── task:file_op
  ├── task:question
  ├── task:completed
  ├── task:failed
  └── task:cancelled

HarnessExecutor (EventEmitter)
  ├── harness:started
  ├── harness:output
  ├── harness:progress
  ├── harness:file_op
  ├── harness:question
  ├── harness:completed
  └── harness:failed

HarnessPool (EventEmitter)
  ├── status (forwarded from Spawner)
  └── output (forwarded from Spawner)

HarnessSpawner (EventEmitter)
  ├── status
  └── output

TaskQueue (EventEmitter)
  ├── queue:added
  ├── queue:started
  ├── queue:completed
  └── queue:failed

WorkspaceManager (EventEmitter)
  └── workspace:changed
```

**Note**: ModeManager does NOT emit events despite being a state machine.  
Bridge listens to TaskIntegration events for WhatsApp progress messages.

---

## Initialization Order

```
index.ts main() sequence:
  1. startStatusServer()        → Status API (port 3000)
  2. initModes()                → ModeManager + mode handlers registered
  3. getProactiveSystem().start() → Polling + Watcher services
  4. new Bridge().initialize()
     ├── cleanupChromeLocks()
     ├── SecurityGate.create()  → WhitelistStore loaded
     ├── initializeHandler()
     │   ├── getSessionManager() → SessionStore.init() → sessions.db tables
     │   ├── getTaskManager()    → TaskStore.init() → tasks.db tables
     │   └── sync TaskQueue from TaskManager
     ├── setupEventHandlers()   → WhatsApp message routing
     ├── setupTaskProgressListeners() → Bridge ←── TaskIntegration events
     └── client.initialize()    → Puppeteer/Chrome launched
```

**Critical dependency**: SessionStore must init before ModeManager.init(), ConversationSummarizer, or session/ThreadManager can function. The current boot order calls `initModes()` before `initializeHandler()`, meaning ModeManager.init() accesses SessionStore before it's initialized. This works only because ModeManager catches the error silently.

---

## Redundancies & Issues

### 🔴 1. Two ThreadManagers

| | `session/thread-manager.ts` | `conversation/thread.ts` |
|:--|:--|:--|
| **Persistence** | SQLite (conversation_threads table) | In-memory only |
| **Thread type** | Full context snapshots (messages, mode, project) | Lightweight (title, mode, metadata) |
| **Used by** | SessionManager → commands/parser.ts, instincts/thread.ts | `agent/core.ts` |
| **Status** | Active (SQLite-backed) | Active but ephemeral |

**Verdict**: Both are actively used but serve overlapping purposes. `session/ThreadManager` persists threads to SQLite; `conversation/ThreadManager` tracks lightweight in-memory threads for the agent loop. These should eventually be unified into a single persistent ThreadManager.

### 🔴 2. Dual Task Tracking

Two completely separate "task" concepts exist:

| | `session/types.ts → AgentTask` | `task/types.ts → Task` |
|:--|:--|:--|
| **Managed by** | SessionManager (on Session object) | TaskManager + TaskStore |
| **Persisted in** | sessions.db (JSON blob) | tasks.db (structured rows) |
| **Has plan steps** | ✅ Yes (`PlanStep[]`) | ❌ No |
| **Has iterations** | ✅ Yes (`iterations`, `maxIterations`) | ❌ No |
| **Has harness execution** | Via `harness` string field | Via separate `HarnessExecution` table concept |
| **Has approval flow** | ✅ `pendingApproval` | ✅ `pendingQuestion` |

Creating a task via `TaskManager.create()` does NOT create an `AgentTask` on the session, and vice versa. The handler bridges them manually but they can drift out of sync.

### 🔴 3. Dead `cron_jobs` Table

`TaskStore` creates a `cron_jobs` table in tasks.db, but `TaskScheduler` stores jobs in a `Map<string, ScheduledJob>` in memory. The table is never read or written.

### 🟡 4. HarnessExecutor's Parallel Process Map

`HarnessExecutor` maintains its own `processes: Map<HarnessId, ChildProcess>` alongside `HarnessPool`→`HarnessSpawner` which has its own `processes: Map<HarnessId, ChildProcess>`. The executor populates its map in the direct-spawn path but the pool-delegated path bypasses it, causing `killExecution()` to fail when the pool was used.

### 🟡 5. Two "Mode" Naming Collisions

- **FetchMode** (modes/types.ts): System state machine — `ALERT`, `WORKING`, `WAITING`, `GUARDING`
- **ConversationMode** (conversation/detector.ts): Per-message intent — `TASK`, `EXPLORATION`, `TEACHING`, `CHAT`

Both called "mode" in logs and variable names, causing confusion.

---

## Recommended State Flow (Target)

```
                    ┌──────────────┐
                    │   Bridge     │
                    │  (WhatsApp)  │
                    └──────┬───────┘
                           │ message
                    ┌──────▼───────┐
                    │   Handler    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐   ┌▼──────┐   ┌─▼──────────┐
       │  Instincts  │   │ Agent │   │  Commands   │
       │(Deterministic│   │ Core  │   │  (Slash)    │
       └─────────────┘   │(LLM)  │   └────────────┘
                          └───┬───┘
                              │
                    ┌─────────▼─────────┐
                    │  SessionManager   │  ← Single source of truth
                    │  (Session object) │     for user state
                    └─────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
       ┌──────▼──────┐ ┌─────▼─────┐ ┌───────▼───────┐
       │ TaskManager │ │   Mode    │ │   Memory      │
       │ (tasks.db)  │ │  Manager  │ │  Manager      │
       └──────┬──────┘ └───────────┘ └───────────────┘
              │
       ┌──────▼──────────┐
       │ TaskIntegration  │
       │ (Execution)      │
       └──────┬───────────┘
              │
       ┌──────▼──────┐
       │ HarnessPool │ → Spawner → Process
       └─────────────┘
```

---

## Database Schema Summary

### sessions.db

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,        -- JSON blob of Session object
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE session_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- Used keys: FETCH_MODE

CREATE TABLE memory_facts (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    category TEXT,
    content TEXT,
    confidence REAL DEFAULT 1.0,
    source TEXT,
    created_at TEXT,
    updated_at TEXT,
    access_count INTEGER DEFAULT 0
);

CREATE TABLE working_context (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    content TEXT,
    relevance REAL DEFAULT 1.0,
    created_at TEXT,
    expires_at TEXT
);

CREATE TABLE conversation_summaries (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    thread_id TEXT,
    summary TEXT,
    message_range TEXT,
    created_at TEXT
);

CREATE TABLE conversation_threads (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    metadata TEXT,
    snapshot TEXT,
    created_at TEXT,
    updated_at TEXT
);
```

### tasks.db

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    goal TEXT NOT NULL,
    workspace TEXT NOT NULL,
    agent TEXT NOT NULL,
    agent_selection TEXT DEFAULT 'auto',
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'normal',
    constraints TEXT,          -- JSON
    progress TEXT,             -- JSON array
    result TEXT,               -- JSON
    pending_question TEXT,
    retry_count INTEGER DEFAULT 0,
    session_id TEXT NOT NULL,
    created_at TEXT,
    started_at TEXT,
    completed_at TEXT
);

CREATE TABLE task_metadata (
    task_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (task_id, key)
);

CREATE TABLE cron_jobs (       -- ⚠️ DEAD TABLE
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    command TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    last_run TEXT,
    next_run TEXT,
    created_at TEXT
);
```
