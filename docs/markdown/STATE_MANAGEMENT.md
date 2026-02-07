# State Management

## Overview

Fetch uses SQLite (WAL mode) for persistence and in-memory singletons for runtime state. All persistent state survives crashes and restarts.

## Persistence

### sessions.db

| Table | Schema | Purpose |
|-------|--------|---------|
| `sessions` | `id TEXT PK, user_id TEXT, data TEXT, created_at TEXT, updated_at TEXT` | Session blobs (JSON containing messages, preferences, context) |
| `summaries` | `id TEXT PK, session_id TEXT, summary TEXT, created_at TEXT` | Conversation summaries for context compression |
| `conversation_threads` | `thread_id TEXT PK, session_id TEXT, title TEXT, created_at TEXT, archived_at TEXT` | Thread management |
| `meta` | `key TEXT PK, value TEXT` | Key-value metadata store |

### tasks.db

| Table | Schema | Purpose |
|-------|--------|---------|
| `tasks` | `id TEXT PK, session_id TEXT, goal TEXT, status TEXT, harness TEXT, result TEXT, iterations INT, max_iterations INT, created_at TEXT, updated_at TEXT` | Task lifecycle records |

### Filesystem

| Path | Purpose |
|------|---------|
| `data/.wwebjs_auth/` | WhatsApp session (auto-managed by whatsapp-web.js) |
| `data/identity/` | COLLAR.md, ALPHA.md (watched for changes) |
| `data/agents/` | Pack profiles — claude.md, gemini.md, copilot.md (watched) |
| `data/skills/` | Skill definition files (watched) |
| `data/tools/` | Custom tool definitions |
| `data/whitelist.json` | Trusted phone numbers |

## Singletons

| Singleton | Module | Pattern | State |
|-----------|--------|---------|-------|
| `SessionManager` | session/manager.ts | Module-level instance | Active sessions cache |
| `SessionStore` | session/store.ts | Module-level instance | SQLite connection + prepared statements |
| `TaskManager` | task/manager.ts | Static `getInstance()` | Running tasks Map + event emitters |
| `TaskStore` | task/store.ts | Module-level instance | SQLite connection + prepared statements |
| `IdentityManager` | identity/manager.ts | Module-level instance | Loaded identity + watchers |
| `SkillsManager` | skills/manager.ts | Module-level instance | Loaded skills + watchers |
| `HarnessRegistry` | harness/registry.ts | Module-level instance | Registered adapter Map |
| `HarnessExecutor` | harness/executor.ts | Module-level instance | Active task execution state |
| `HarnessSpawner` | harness/spawner.ts | Module-level instance | Active child processes |
| `ModeManager` | modes/manager.ts | Module-level instance | Current mode + mode stack |
| `SecurityGate` | security/gate.ts | Static instance | Trigger + whitelist config |
| `RateLimiter` | security/rateLimiter.ts | Module-level instance | Per-key timestamp arrays |
| `ToolRegistry` | tools/registry.ts | Module-level instance | Registered tool Map |
| `WorkspaceManager` | workspace/manager.ts | Module-level instance | Discovered projects |

## Event Emitters

| Emitter | Events | Consumers |
|---------|--------|-----------|
| `TaskManager` | `task:created`, `task:updated`, `task:completed` | TaskIntegration, Handler |
| `TaskIntegration` | `progress`, `complete`, `error` | Agent Core |
| `HarnessExecutor` | `output`, `complete`, `error` | TaskManager |
| `HarnessSpawner` | `spawn`, `exit`, `error` | HarnessExecutor |
| `WatcherService` | `file:add`, `file:change`, `file:remove`, `git:behind` | ProactiveSystem |
| `WorkspaceManager` | `project:selected`, `project:created` | SessionManager |

## Boot Order

Critical dependency: SessionStore and TaskStore must initialize before anything that queries sessions or tasks.

```
1. validateEnv()           — Fail-fast on missing/invalid env vars
2. startStatusServer()     — HTTP API on :8765
3. initializeModes()       — Load persisted mode from SQLite
4. startProactiveSystem()  — Scheduler, watcher, polling
5. new Bridge()            — WhatsApp client
6. bridge.initialize()     — QR auth or cached session
7. bridge.on('ready')      — System operational
```

## Task Lifecycle

TaskManager is the single source of truth for task state. SessionManager delegates all task operations to TaskManager.

```
create → pending
start  → running
         ├─ ask_user  → waiting_input → (user responds) → running
         ├─ complete  → completed
         ├─ fail      → failed
         └─ cancel    → cancelled
```

Tasks are persisted to `tasks.db` on every state transition. On restart, incomplete tasks are detected and can be resumed or cleaned up.
