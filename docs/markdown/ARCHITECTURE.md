# Architecture

## System Overview

<!-- DIAGRAM:architecture -->

Fetch runs as two Docker containers managed by a Go TUI:

- **Bridge** (Node.js) — Connects to WhatsApp, runs the agent core, manages sessions and tasks
- **Kennel** (Ubuntu) — Sandboxed container where AI CLIs (Claude Code, Gemini, Copilot) execute against the workspace
- **Manager** (Go, runs on host) — TUI for starting/stopping Docker, editing config, viewing logs

The Bridge communicates with the Kennel by running `docker exec` commands into it. The workspace directory is mounted into both containers.

## Message Flow

<!-- DIAGRAM:messageflow -->

1. WhatsApp message arrives via whatsapp-web.js
2. **SecurityGate** checks `@fetch` trigger, phone whitelist, rate limit, input validation
3. **Instinct layer** checks for deterministic commands (`/stop`, `/status`, `/help`) — if matched, returns immediately without LLM
4. **Intent classifier** analyzes the message:
   - **conversation** → Direct LLM response (no tools)
   - **inquiry** → Read-only tools, single cycle
   - **action** → Full tool access, ReAct loop, harness delegation
5. **Agent core** runs the appropriate handler with session context and activated skills
6. For action intents, the LLM enters a ReAct loop calling orchestrator tools
7. `task_create` tool spawns a CLI process in the Kennel container
8. Response is formatted and sent back via WhatsApp

## Boot Sequence

The Bridge starts with this ordered initialization:

1. `validateEnv()` — Zod schema validates all environment variables (fail-fast)
2. Start HTTP status API on port 8765
3. Initialize mode system (load persisted mode from SQLite)
4. Start proactive system (scheduler, watcher, polling)
5. Create WhatsApp Bridge client
6. WhatsApp authenticates (QR code or cached session)
7. Bridge `ready` event fires — system is operational

## Shutdown Sequence

On SIGINT/SIGTERM or unhandled exception:

1. Stop proactive system (scheduler, watchers)
2. Kill all harness processes (`spawner.killAll()`)
3. Destroy WhatsApp bridge connection
4. Close SQLite databases (flush WAL)
5. `process.exit()`

Global `unhandledRejection` and `uncaughtException` handlers trigger this same shutdown path.

## Module Map

```
src/
├── index.ts              # Boot + shutdown orchestration
├── config/
│   ├── env.ts            # Zod-validated env with Proxy (lazy reads)
│   └── paths.ts          # Centralized path constants
├── bridge/
│   └── client.ts         # WhatsApp client, QR auth, reconnection (exponential backoff)
├── security/
│   ├── gate.ts           # @fetch trigger + phone authorization
│   ├── rateLimiter.ts    # Sliding window rate limiter with periodic eviction
│   ├── validator.ts      # Input sanitization (injection, traversal)
│   └── whitelist.ts      # Trusted phone number management
├── handler/
│   └── index.ts          # Message entry point, formatting, dispatch
├── instincts/            # Deterministic fast-path handlers (one file per instinct)
├── agent/
│   ├── core.ts           # ReAct loop, tool calling, harness delegation
│   ├── intent.ts         # Intent classification (conversation/inquiry/action)
│   ├── format.ts         # Response formatting
│   └── prompts.ts        # System prompt builders
├── commands/
│   ├── parser.ts         # Lightweight router (~240 lines)
│   ├── task.ts           # /stop, /pause, /resume, /cancel
│   ├── context.ts        # /context files, /context clear
│   ├── project.ts        # /project, /clone, /init, git commands
│   ├── settings.ts       # /verbose, /autocommit, /auto, /mode
│   └── identity-commands.ts  # /identity, /skill, /thread
├── modes/
│   └── handlers/         # State machine: ALERT, WORKING, WAITING, GUARDING, RESTING
├── harness/
│   ├── base.ts           # AbstractHarnessAdapter (shared logic)
│   ├── claude.ts         # Claude Code adapter
│   ├── gemini.ts         # Gemini CLI adapter
│   ├── copilot.ts        # Copilot CLI adapter
│   ├── registry.ts       # Adapter registry (single source)
│   ├── executor.ts       # Task execution via pool
│   └── spawner.ts        # Child process management + killAll
├── identity/
│   ├── manager.ts        # System prompt builder, hot-reload watcher
│   └── loader.ts         # Parse COLLAR.md, ALPHA.md, agents/*.md
├── skills/
│   └── manager.ts        # Skill discovery, activation, management
├── session/
│   ├── manager.ts        # Session CRUD, delegates task ops to TaskManager
│   ├── store.ts          # SQLite persistence (sessions.db, WAL mode)
│   └── types.ts          # Session, Message, Preferences interfaces
├── task/
│   ├── manager.ts        # Task lifecycle, single source of truth
│   ├── store.ts          # SQLite persistence (tasks.db)
│   ├── scheduler.ts      # Cron-based job scheduler (supports one-shot)
│   └── types.ts          # Task, CronJob, TaskStatus interfaces
├── proactive/
│   ├── commands.ts       # /remind, /schedule, /cron handlers
│   └── watcher.ts        # File/git watcher (EventEmitter with typed events)
├── tools/
│   ├── registry.ts       # Tool registry (11 tools)
│   ├── workspace.ts      # Workspace tools (list, select, status, create, delete)
│   ├── task.ts           # Task tools (create, status, cancel, respond)
│   └── interaction.ts    # Interaction tools (ask_user, report_progress)
├── conversation/
│   └── summarizer.ts     # Conversation summarization
├── transcription/
│   └── index.ts          # whisper.cpp voice transcription
├── vision/
│   └── index.ts          # Image analysis via OpenRouter
├── workspace/
│   ├── manager.ts        # Project discovery and management
│   ├── repo-map.ts       # Repository structure mapping
│   └── symbols.ts        # Symbol extraction
└── utils/
    ├── logger.ts         # Colored logger with LOG_LEVEL filtering
    ├── id.ts             # ID generators (ses_, tsk_, etc.)
    └── docker.ts         # Docker exec helpers
```

## Docker Architecture

<!-- DIAGRAM:architecture -->

### Container Communication

The Bridge container has the Docker socket mounted read-only. It spawns harness processes inside the Kennel using:

```
docker exec fetch-kennel claude --task "..." --workspace /workspace/project
```

### Volume Mounts

| Volume | Bridge | Kennel | Mode |
|--------|--------|--------|------|
| `./workspace` | ✅ | ✅ | read-write |
| `./data` | ✅ | — | read-write |
| `docker.sock` | ✅ | — | read-only |
| `~/.config/gh` | — | ✅ | read-only |
| `~/.config/claude-code` | — | ✅ | read-only |
| `~/.gemini` | — | ✅ | read-only |

## Database Schema

### sessions.db

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `sessions` | Session blobs | `id`, `user_id`, `data` (JSON), `created_at`, `updated_at` |
| `summaries` | Conversation summaries | `id`, `session_id`, `summary`, `created_at` |
| `conversation_threads` | Thread management | `thread_id`, `session_id`, `title`, `created_at` |
| `meta` | Key-value metadata | `key`, `value` |

### tasks.db

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `tasks` | Task records | `id`, `session_id`, `goal`, `status`, `harness`, `result`, `iterations` |

Both databases use WAL (Write-Ahead Logging) mode for concurrent read/write access without locking.

## Error Recovery

| Failure | Recovery |
|---------|----------|
| Bridge crash | Mode and task state persisted to SQLite; tasks resume on restart |
| WhatsApp disconnect | Exponential backoff reconnection (5s base, 5min cap, 10 max retries) |
| Harness timeout | Task marked as failed, user notified |
| Unhandled rejection | Global handler triggers graceful shutdown |
| LLM API failure | Retry with backoff, then fail task with error message |
