# Architecture

## System Overview

<!-- DIAGRAM:architecture -->

Fetch runs as two Docker containers managed by a Go TUI:

- **Bridge** (Node.js) — Connects to WhatsApp, runs the agent core, manages sessions and tasks
- **Kennel** (Ubuntu) — Sandboxed container where AI CLIs (Claude Code, Gemini, Copilot) execute against the workspace
- **Manager** (Go, runs on host) — TUI for starting/stopping Docker, editing config, viewing logs

The Bridge communicates with the Kennel by running `docker exec` commands into it. The workspace directory is mounted into both containers. The Bridge container has the Docker CLI installed and the Docker socket mounted so it can control the Kennel directly.

## Message Flow (v4.0 — LLM-First)

<!-- DIAGRAM:messageflow -->

1. WhatsApp message arrives via whatsapp-web.js
2. **SecurityGate** checks `@fetch` trigger, phone whitelist, rate limit, input validation
3. **Safety Gate** checks for 5 deterministic escape commands (`/stop`, `/undo`, `/clear`, `/help`, `/status`) — if matched, responds immediately without LLM
4. **Everything else** goes to the LLM with **all 13 tools** available
5. **Agent core** builds message history in OpenAI multi-turn format (with `tool_calls` + `tool_call_id`) and runs the LLM
6. The LLM enters a ReAct loop — it decides whether to chat, call tools, or delegate to a harness
7. **System prompt rebuilds** after state-changing tools (`workspace_select`, `workspace_create`, `task_create`) so the LLM always sees current context
8. `task_create` tool spawns a CLI process in the Kennel container via `docker exec`
9. Response is formatted and sent back via WhatsApp

> **v4.0 Change:** The instinct layer, intent classifier, and mode detector have been removed. There is no longer a conversation/action split — every message takes the same single path through the LLM with full tool access. The LLM naturally responds to "hi" without calling tools and to "fix the bug" by calling `task_create`.

## Boot Sequence

The Bridge starts with this ordered initialization:

1. `validateEnv()` — Zod schema validates all environment variables (fail-fast)
2. Start HTTP status API on port 8765
3. Create WhatsApp Bridge client
4. WhatsApp authenticates (QR code or cached session)
5. Bridge `ready` event fires — system is operational

## Shutdown Sequence

On SIGINT/SIGTERM or unhandled exception:

1. Kill all harness processes (`spawner.killAll()`)
2. Destroy WhatsApp bridge connection
3. Close SQLite databases (flush WAL)
4. `process.exit()`

Global `unhandledRejection` and `uncaughtException` handlers trigger this same shutdown path.

## Dependencies (Runtime)

| Package | Purpose | Used By |
|---------|---------|---------|
| `openai` | OpenAI-compatible SDK — pointed at **OpenRouter** (`baseURL: openrouter.ai/api/v1`) | `agent/core.ts` (ReAct loop), `vision/index.ts` (image analysis), `session/manager.ts` (compaction) |
| `whatsapp-web.js` | WhatsApp Web client via Puppeteer | `bridge/client.ts` |
| `better-sqlite3` | SQLite with WAL mode for sessions & tasks | `session/store.ts`, `task/store.ts` |
| `zod` | Schema validation (env, tool inputs, IDs) | `config/env.ts`, `validation/`, `tools/loader.ts` |
| `dockerode` | Docker API for container management | `utils/docker.ts` |
| `gray-matter` | YAML frontmatter parsing for skills & agents | `skills/loader.ts`, `identity/loader.ts` |
| `chokidar` | File watcher for identity hot-reload | `identity/manager.ts` |
| `nanoid` | Collision-resistant ID generation | `utils/id.ts` |
| `strip-ansi` | Strip ANSI codes from harness CLI output | `harness/output-parser.ts` |
| `dotenv` | Load `.env` file | `config/env.ts` |

> **Note:** The `openai` npm package is **not** used to call OpenAI directly. It serves as an OpenAI-compatible client for **OpenRouter**, which routes to any model (GPT-4o, Claude, Gemini, etc.). Claude Code, Gemini CLI, and GitHub Copilot CLI are invoked as **CLI processes** in the Kennel container via `docker exec` — they do not use SDK packages in the Bridge.

## Module Map

```
src/
├── index.ts              # Boot + shutdown orchestration
├── config/
│   ├── env.ts            # Zod-validated env with Proxy (lazy reads)
│   ├── pipeline.ts       # Context pipeline tuning (31 params, FETCH_* env overrides)
│   └── paths.ts          # Centralized path constants
├── api/
│   └── status.ts         # HTTP status API (port 8765), docs server, health check
├── bridge/
│   └── client.ts         # WhatsApp client, QR auth, reconnection (exponential backoff)
├── security/
│   ├── index.ts          # Barrel exports
│   ├── gate.ts           # @fetch trigger + phone authorization
│   ├── rateLimiter.ts    # Sliding window rate limiter with periodic eviction
│   ├── validator.ts      # Input sanitization (injection, traversal)
│   └── whitelist.ts      # Trusted phone number management
├── handler/
│   └── index.ts          # Message entry point, session lifecycle, safety-gate dispatch, response building
├── agent/
│   ├── core.ts           # Single-path LLM handler, ReAct loop, all 13 tools
│   ├── format.ts         # Response formatting
│   ├── prompts.ts        # System prompt builders
│   └── whatsapp-format.ts # WhatsApp-specific formatting
├── commands/
│   ├── index.ts          # Barrel exports
│   ├── parser.ts         # Safety gate — 5 deterministic escape commands
│   ├── task.ts           # /stop, /undo handlers (kill task, git reset)
│   └── types.ts          # Command result types
├── harness/
│   ├── base.ts           # AbstractHarnessAdapter (shared logic)
│   ├── claude.ts         # Claude Code adapter (container: 'fetch-kennel')
│   ├── gemini.ts         # Gemini CLI adapter (container: 'fetch-kennel')
│   ├── copilot.ts        # Copilot CLI adapter (container: 'fetch-kennel')
│   ├── registry.ts       # Adapter registry (single source)
│   ├── executor.ts       # Task execution via pool
│   ├── spawner.ts        # Process spawn with docker exec wrapping
│   ├── pool.ts           # Concurrency management (max 2 parallel agents)
│   ├── output-parser.ts  # Harness output parsing
│   └── types.ts          # HarnessConfig (includes container field)
├── identity/
│   ├── manager.ts        # System prompt builder, hot-reload watcher
│   ├── loader.ts         # Parse COLLAR.md, ALPHA.md, agents/*.md
│   ├── types.ts          # AgentIdentity, PackMember interfaces
│   └── docs/             # See [IDENTITY_SYSTEM.md](./IDENTITY_SYSTEM.md) for details
├── skills/
│   ├── index.ts          # Barrel re-exports
│   ├── loader.ts         # Parse SKILL.md frontmatter (gray-matter)
│   ├── manager.ts        # Skill discovery, activation, management
│   ├── types.ts          # Skill, SkillConfig, SkillRequirements
│   └── builtin/          # 7 built-in skills (git, docker, testing, etc.)
├── session/
│   ├── manager.ts        # Session CRUD, messages, compaction, repo-map cache
│   ├── store.ts          # SQLite persistence (sessions.db, WAL mode)
│   └── types.ts          # Session, Message, Preferences interfaces
├── task/
│   ├── index.ts           # Barrel exports
│   ├── manager.ts        # Task lifecycle, single source of truth
│   ├── store.ts          # SQLite persistence (tasks.db)
│   ├── integration.ts    # TaskIntegration — bridges harness events to task state
│   └── types.ts          # Task, TaskStatus, TaskConstraints interfaces
├── tools/
│   ├── index.ts          # Barrel exports for tools module
│   ├── registry.ts       # Tool registry (13 tools) with custom tool hot-reload
│   ├── types.ts          # ToolContext, ToolResult, DangerLevel interfaces
│   ├── loader.ts         # Custom tool loader (data/tools/*.json → shell handlers)
│   ├── workspace.ts      # Workspace tools (list, select, status, create, delete, sync, publish)
│   ├── task.ts           # Task tools (create, status, cancel, respond)
│   └── interaction.ts    # Interaction tools (ask_user with autonomy guard, report_progress)
├── validation/
│   ├── common.ts         # Reusable Zod schemas (IDs, paths, timestamps, strings)
│   └── tools.ts          # Zod schemas for all 13 tool inputs
├── transcription/
│   └── index.ts          # whisper.cpp voice transcription
├── vision/
│   └── index.ts          # Image analysis via OpenRouter
├── workspace/
│   ├── manager.ts        # Project discovery, GitHub sync, workspace lifecycle
│   ├── repo-map.ts       # Repository structure mapping
│   ├── symbols.ts        # Symbol extraction
│   └── types.ts          # Workspace, GitStatus, WorkspaceEvent types
└── utils/
    ├── logger.ts         # Colored logger with LOG_LEVEL filtering
    ├── id.ts             # ID generators (tsk_, prg_ prefixes via nanoid)
    └── docker.ts         # Docker exec helpers
```

## Context Pipeline

<!-- DIAGRAM:contextpipeline -->

The context pipeline ensures the LLM has full conversational memory across turns:

1. **Message Persistence** — All messages (user, assistant, tool calls, tool results) are persisted through `SessionManager` methods, not bare array pushes
2. **OpenAI Multi-Turn Format** — `buildMessageHistory()` emits proper format: `assistant` messages carry `tool_calls`, `tool` messages carry results with matching `tool_call_id`
3. **Sliding Window** — Last `pipeline.historyWindow` (default 20) messages are sent to the LLM
4. **Compaction** — When total messages exceed `pipeline.compactionThreshold` (default 40), older messages are LLM-summarized into `session.metadata.compactionSummary` and the array is trimmed
5. **Task Completion Hooks** — `task:completed` / `task:failed` events write to session history and push WhatsApp notifications
6. **Session-Aware Tools** — `ToolContext { sessionId, autonomyLevel }` flows through the registry to tool handlers
7. **Dynamic Prompt Rebuild** — System prompt at `messages[0]` is replaced after `workspace_select`, `workspace_create`, or `task_create` so the LLM always sees current state
8. **Task Goal Framing** — `frameTaskGoal()` expands raw user text into self-contained goals before harness dispatch

All parameters are tunable via `config/pipeline.ts` (31 settings, overridable via `FETCH_*` env vars).

## Docker Architecture

<!-- DIAGRAM:docker -->

### Container Communication

The Bridge container has the Docker socket mounted read-only **and the Docker CLI installed**. It controls the Kennel using `docker exec`:

```
docker exec -w /workspace/my-project -e GOAL="..." fetch-kennel claude --print --dangerously-skip-permissions -p "..."
```

The harness spawner automatically wraps commands with `docker exec` when the adapter config includes `container: 'fetch-kennel'`. This is the core of the dual-container architecture: Bridge (brain) controls Kennel (muscle).

### Kennel Entrypoint

The Kennel container uses a custom entrypoint (`kennel/entrypoint.sh`) that:

1. Checks for `GH_TOKEN` environment variable
2. Configures `gh` CLI authentication from the token
3. Sets git identity to match the GitHub account
4. Then runs the CMD (`tail -f /dev/null` to keep alive)

This enables `workspace_sync` and `workspace_create` to push to GitHub.

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
