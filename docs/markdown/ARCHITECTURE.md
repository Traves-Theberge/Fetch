# 🐕 Fetch — Architecture Reference

> Deep technical architecture documentation covering initialization, message flow,
> data persistence, Docker topology, security model, and error recovery.

---

## Table of Contents

1. [Initialization Sequence](#1-initialization-sequence)
2. [Message Flow](#2-message-flow)
3. [Data Flow](#3-data-flow)
4. [Docker Architecture](#4-docker-architecture)
5. [Database Schema](#5-database-schema)
6. [Security Architecture](#6-security-architecture)
7. [Hot-Reload Architecture](#7-hot-reload-architecture)
8. [Error Recovery](#8-error-recovery)

---

## 1. Initialization Sequence

When `fetch-bridge` starts, the following sequence executes in order:

```
Boot
 │
 ├─ 1. Environment Loading
 │     dotenv loads .env → process.env
 │     Centralized paths.ts resolves DATA_DIR
 │
 ├─ 2. Database Initialization
 │     sessions.db → CREATE TABLE IF NOT EXISTS, PRAGMA journal_mode=WAL
 │     tasks.db    → CREATE TABLE IF NOT EXISTS, PRAGMA journal_mode=WAL
 │
 ├─ 3. Identity System
 │     IdentityLoader reads COLLAR.md → AgentIdentity
 │     IdentityLoader reads ALPHA.md  → owner context
 │     IdentityLoader reads AGENTS.md → pack definitions
 │     IdentityManager starts chokidar watcher on data/identity/
 │
 ├─ 4. Instinct Registration
 │     InstinctRegistry.registerBuiltins() → 12 handlers sorted by priority
 │     Safety (100-90) → Info (80-75) → Meta (70-55)
 │
 ├─ 5. Mode Restoration
 │     ModeManager reads persisted mode from sessions.db
 │     If stuck mode (WORKING/WAITING/GUARDING) → reset to ALERT
 │
 ├─ 6. Skill Loading
 │     SkillManager loads 7 built-in skills from src/skills/builtin/
 │     SkillManager scans data/skills/ for user-defined skills
 │     Starts chokidar watcher on data/skills/
 │
 ├─ 7. Tool Registration
 │     ToolRegistry registers 11 orchestrator tools
 │     ToolRegistry scans data/tools/ for custom tool JSON
 │     Starts chokidar watcher on data/tools/
 │
 ├─ 8. Harness System
 │     HarnessRegistry registers enabled adapters (claude/gemini/copilot)
 │     HarnessPool initialized (max concurrent: 2)
 │
 ├─ 9. Proactive System
 │     ProactiveLoader reads data/POLLING.md
 │     PollingService starts interval tasks
 │     WatcherService starts file/git watchers
 │
 ├─ 10. Status API
 │      Express server starts on PORT (default: 8765)
 │      Routes: /api/status, /docs/*
 │
 └─ 11. WhatsApp Client
       whatsapp-web.js initializes with Puppeteer
       If authenticated → Ready (ALERT mode)
       If not → Generate QR code → Wait for scan
       On authenticated → Ready
```

**Startup time:** ~5-15 seconds (mostly Chromium startup for WhatsApp).

---

## 2. Message Flow

### 2.1 Complete Request-Response Cycle

```
WhatsApp User
  │  "📱 @fetch refactor the auth module"
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│  Bridge: Message Handler (handler/index.ts)              │
│                                                          │
│  1. Extract sender JID, body, timestamp, isGroup         │
│  2. Pass to Security Pipeline                            │
│     ├─ Layer 1: isOwner(senderId)?          ✓ pass       │
│     ├─ Layer 2: isWhitelisted(senderId)?    ✓ pass       │
│     ├─ Layer 3: hasFetchTrigger(body)?      ✓ pass       │
│     ├─ Layer 4: isRateLimited(senderId)?    ✓ pass       │
│     ├─ Layer 5: validateInput(body)?        ✓ pass       │
│     ├─ Layer 6: checkPathTraversal(body)?   ✓ pass       │
│     └─ Layer 7: (Docker isolation handled later)         │
│                                                          │
│  3. Strip @fetch prefix → "refactor the auth module"     │
│  4. Get or create Session from sessions.db               │
│  5. Add user message to session history                  │
│                                                          │
│  6. INSTINCT CHECK                                       │
│     InstinctRegistry.check("refactor the auth module")   │
│     → No instinct match (not a command)                  │
│                                                          │
│  7. MODE CHECK                                           │
│     ModeManager.currentMode = ALERT                      │
│     → ALERT mode: pass through to agent                  │
│                                                          │
│  8. SKILL MATCH                                          │
│     SkillManager.match("refactor the auth module")       │
│     → Match: "typescript" skill (trigger: "refactor")    │
│     → Skill instructions injected into system prompt     │
│                                                          │
│  9. AGENT PROCESSING                                     │
│     IdentityManager.buildSystemPrompt(session, skills)   │
│     IntentClassifier.classify(message)                   │
│     → Intent: TASK (confidence: 0.92)                    │
│                                                          │
│  10. LLM ReAct Loop (via OpenRouter)                     │
│      Iteration 1:                                        │
│        LLM decides: workspace_status()                   │
│        → Execute tool → Return result to LLM             │
│      Iteration 2:                                        │
│        LLM decides: task_create(                         │
│          goal: "Refactor auth module",                   │
│          agent: "claude"                                 │
│        )                                                 │
│        → TaskManager creates task, mode → WORKING        │
│        → HarnessPool spawns Claude in Kennel             │
│                                                          │
│  11. HARNESS EXECUTION (in Kennel container)             │
│      Spawner: claude --print "Refactor auth module..."   │
│      OutputParser streams stdout/stderr                  │
│      → Progress updates sent via report_progress         │
│      → Questions detected → ask_user → mode WAITING      │
│      → Completion detected → extract summary             │
│                                                          │
│  12. RESPONSE FORMATTING                                 │
│      WhatsAppFormatter.format(result)                    │
│      → Truncate for mobile, add emojis, format code      │
│                                                          │
│  13. SEND RESPONSE                                       │
│      whatsapp-web.js client.sendMessage(chat, response)  │
│      → Session updated, mode → ALERT                     │
└─────────────────────────────────────────────────────────┘
  │
  ▼
WhatsApp User
  "✅ Refactored auth module — 3 files modified 🦴"
```

### 2.2 Short-Circuit Paths

Not every message goes through all 13 steps:

| Path | Steps | Example |
|------|-------|---------|
| Security reject | 1-2 | Unauthorized number → silent drop |
| Instinct match | 1-6 | `@fetch help` → instant response |
| Mode intercept | 1-7 | WAITING mode + response → route to task_respond |
| Conversation | 1-9 | `@fetch hello!` → LLM response, no tools |
| Full task | 1-13 | `@fetch refactor auth` → harness delegation |

---

## 3. Data Flow

### 3.1 Component Interaction

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ WhatsApp │────▶│ Handler  │────▶│ Security │
│ (client) │     │          │     │ Pipeline │
└──────────┘     └──────────┘     └────┬─────┘
                                       │ ✓ allowed
                                       ▼
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Session  │◀───▶│ Instinct │◀────│ Message  │
│ Store    │     │ Registry │     │ Router   │
│ (SQLite) │     └────┬─────┘     └──────────┘
└──────────┘          │ no match
                      ▼
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Identity │────▶│  Mode    │────▶│  Skill   │
│ Manager  │     │ Manager  │     │ Manager  │
└──────────┘     └────┬─────┘     └────┬─────┘
                      │ pass           │ enriched
                      ▼                ▼
                 ┌──────────────────────────┐
                 │     Agent Core (LLM)     │
                 │  Intent → ReAct Loop     │
                 │  Tools: 11 orchestrator  │
                 └────────────┬─────────────┘
                              │ task_create
                              ▼
┌──────────┐     ┌──────────────────────────┐
│  Task    │◀───▶│    Harness Pool          │
│  Store   │     │  ┌────────┐ ┌────────┐  │
│ (SQLite) │     │  │ Claude │ │ Gemini │  │
└──────────┘     │  └────┬───┘ └────┬───┘  │
                 └───────┼──────────┼───────┘
                         │          │
                         ▼          ▼
                 ┌──────────────────────────┐
                 │   Kennel (Docker)         │
                 │   /workspace (mounted)    │
                 └──────────────────────────┘
```

### 3.2 Data Stores

| Store | Technology | Access Pattern |
|-------|------------|----------------|
| Session state | SQLite WAL (`sessions.db`) | Read/write per message |
| Task lifecycle | SQLite WAL (`tasks.db`) | Read/write per task operation |
| Identity | Markdown files (hot-reloaded) | Read on boot + file change |
| Skills | YAML+Markdown files (hot-reloaded) | Read on boot + file change |
| Tools | JSON files (hot-reloaded) | Read on boot + file change |
| WhatsApp auth | Chromium profile (`.wwebjs_auth/`) | Managed by Puppeteer |

---

## 4. Docker Architecture

### 4.1 Container Topology

```
┌─────────────────────────────────────────────────────┐
│                    Host Machine                      │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  fetch-bridge                                    │ │
│  │  Node.js 20 + Chromium (Puppeteer)              │ │
│  │  Port: 8765:8765                                │ │
│  │                                                  │ │
│  │  Volumes:                                        │ │
│  │   ./data:/app/data              (persistent)     │ │
│  │   /var/run/docker.sock (ro)     (container mgmt) │ │
│  │                                                  │ │
│  │  Environment: .env (all variables)               │ │
│  └─────────────────────────────────────────────────┘ │
│                        │                             │
│                        │ Docker socket               │
│                        ▼                             │
│  ┌─────────────────────────────────────────────────┐ │
│  │  fetch-kennel                                    │ │
│  │  Ubuntu 22.04 + Claude CLI + Gemini CLI + gh    │ │
│  │  No exposed ports                               │ │
│  │                                                  │ │
│  │  Volumes:                                        │ │
│  │   ./workspace:/workspace        (code sandbox)   │ │
│  │   ./config/github:/root/.config/gh (ro, auth)   │ │
│  │   ./config/claude:/root/.config/claude (ro)     │ │
│  │                                                  │ │
│  │  Limits: 2 GB RAM, 2 CPUs                       │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 4.2 Inter-Container Communication

The Bridge controls the Kennel via the Docker socket (`/var/run/docker.sock`):
- **Spawning:** `docker exec fetch-kennel <command>` via Dockerode API
- **I/O:** stdin/stdout/stderr streams for harness communication
- **No network:** Containers don't communicate over TCP — only via Docker exec

### 4.3 Volume Mounts

| Host Path | Container Path | Container | Access | Purpose |
|-----------|---------------|-----------|--------|---------|
| `./data` | `/app/data` | bridge | read-write | Sessions, tasks, identity, skills, tools |
| `./workspace` | `/workspace` | kennel | read-write | User code projects |
| `./config/github` | `/root/.config/gh` | kennel | read-only | GitHub CLI authentication |
| `./config/claude` | `/root/.config/claude` | kennel | read-only | Claude CLI authentication |
| `/var/run/docker.sock` | `/var/run/docker.sock` | bridge | read-only | Container management |

---

## 5. Database Schema

### 5.1 sessions.db

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE,
  data        TEXT NOT NULL,        -- JSON blob: messages, task, project, preferences
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL DEFAULT (datetime('now', '+7 days'))
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

**Session JSON blob (`data` column):**

```json
{
  "messages": [
    { "id": "msg_abc", "role": "user", "content": "...", "timestamp": "..." },
    { "id": "msg_def", "role": "assistant", "content": "...", "timestamp": "..." }
  ],
  "currentTask": { "id": "tsk_xyz", "goal": "...", "status": "running" },
  "currentProject": { "name": "my-api", "path": "/workspace/my-api", "gitBranch": "main" },
  "availableProjects": ["my-api", "web-client"],
  "mode": "ALERT",
  "summaries": [
    { "range": [0, 19], "summary": "User asked about auth module..." }
  ]
}
```

### 5.2 tasks.db

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  goal        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  agent       TEXT,                -- claude | gemini | copilot
  workspace   TEXT,
  result      TEXT,               -- JSON: output, files modified, errors
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tasks_session ON tasks(session_id);
CREATE INDEX idx_tasks_status ON tasks(status);

PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

**Task status values:** `pending` → `running` → `waiting_input` → `completed` | `failed` | `cancelled`

---

## 6. Security Architecture

### 6.1 Seven-Layer Model

```
┌─────────────────────────────────────────────────┐
│  Incoming WhatsApp Message                       │
│                                                  │
│  Layer 1: Owner Verification                     │
│  ├─ Is sender === OWNER_PHONE_NUMBER?            │
│  ├─ YES → proceed                                │
│  └─ NO  → Layer 2                                │
│                                                  │
│  Layer 2: Whitelist Check                        │
│  ├─ Is sender in TRUSTED_PHONE_NUMBERS?          │
│  ├─ YES → proceed                                │
│  └─ NO  → SILENT DROP (no response)              │
│                                                  │
│  Layer 3: @fetch Trigger Gate                    │
│  ├─ Does body contain @fetch?                    │
│  ├─ YES → strip prefix, proceed                  │
│  └─ NO  → SILENT DROP                            │
│                                                  │
│  Layer 4: Rate Limiting                          │
│  ├─ < 30 requests in 60s window?                 │
│  ├─ YES → proceed                                │
│  └─ NO  → "⏰ Slow down! Rate limited."          │
│                                                  │
│  Layer 5: Input Validation                       │
│  ├─ No $(...), backticks, ; rm, | sh, eval?      │
│  ├─ Under 10,000 chars?                          │
│  ├─ CLEAN → proceed                              │
│  └─ DIRTY → "⚠️ Blocked: potentially unsafe"     │
│                                                  │
│  Layer 6: Path Traversal Protection              │
│  ├─ No ../ sequences in any file references?     │
│  ├─ Resolves within /workspace?                  │
│  ├─ SAFE → proceed                               │
│  └─ UNSAFE → "🔒 Path outside sandbox"           │
│                                                  │
│  Layer 7: Docker Isolation                       │
│  ├─ All CLI execution via docker exec            │
│  ├─ Array-based arguments (no shell injection)   │
│  ├─ Resource limits enforced                     │
│  └─ Read-only config mounts                      │
│                                                  │
│  ✅ Message processed safely                     │
└─────────────────────────────────────────────────┘
```

### 6.2 Trust Model

| Entity | Trust Level | Capabilities |
|--------|-------------|-------------|
| Owner | Full | All commands, /trust management, dangerous operations |
| Whitelisted | Standard | @fetch commands, task creation, workspace operations |
| Unknown | None | Silently ignored — no response sent |

---

## 7. Hot-Reload Architecture

Fetch uses `chokidar` file watchers for live configuration updates without restart:

### 7.1 Watched Paths

| Watcher | Path | Pattern | Debounce | On Change |
|---------|------|---------|----------|-----------|
| Identity | `data/identity/` | `*.md` | 500ms | Reload AgentIdentity, rebuild system prompt |
| Skills | `data/skills/` | `*/SKILL.md` | 500ms | Reload skill, update SkillManager registry |
| Tools | `data/tools/` | `*.json` | 500ms | Reload tool, update ToolRegistry |
| Polling | `data/` | `POLLING.md` | 1000ms | Reload polling config, restart polling service |

### 7.2 Reload Sequence

```
File change detected (chokidar)
  │
  ├─ Debounce (500ms)
  │
  ├─ Read new file content
  │
  ├─ Parse and validate
  │  ├─ Valid → Update registry/manager in-memory
  │  └─ Invalid → Log warning, keep previous state
  │
  └─ Next message uses updated state
```

**Key property:** Hot-reload is **non-breaking**. If a file has syntax errors, the previous valid state is preserved. The system never enters an inconsistent state from a bad config edit.

---

## 8. Error Recovery

### 8.1 Crash Recovery

SQLite WAL mode provides crash safety:

```
Normal write:
  1. Write to WAL file (append-only)
  2. Checkpoint WAL → main database (periodic)

Crash scenario:
  1. Process crashes mid-write
  2. On restart: WAL file replayed
  3. Committed transactions recovered
  4. Uncommitted transactions discarded
  → Database always consistent
```

### 8.2 Mode Reset on Boot

```
Boot → Read persisted mode from sessions.db
  │
  ├─ Mode = ALERT     → Keep (normal)
  ├─ Mode = RESTING   → Keep (normal)
  ├─ Mode = WORKING   → Reset to ALERT (task interrupted)
  ├─ Mode = WAITING   → Reset to ALERT (input lost)
  └─ Mode = GUARDING  → Reset to ALERT (approval lost)
```

### 8.3 Task Cleanup

On boot, the TaskManager scans for orphaned tasks:
- `status = running` → Set to `failed` with reason "Process interrupted"
- `status = waiting_input` → Set to `failed` with reason "Process interrupted"
- `status = pending` (queued) → Kept for manual retry

### 8.4 Harness Timeout

| Scenario | Timeout | Recovery |
|----------|---------|----------|
| Simple task | 5 minutes | Kill process, report timeout to user |
| Complex task | 15 minutes | Kill process, report timeout with partial output |
| Question detection | 2 minutes | If no question text extracted, report stall |

### 8.5 WhatsApp Reconnection

```
Disconnect detected
  │
  ├─ Attempt 1: Automatic reconnect (whatsapp-web.js)
  │  └─ If auth valid → Reconnected
  │
  ├─ Attempt 2-5: Exponential backoff (5s, 10s, 20s, 40s)
  │  └─ If auth expired → QR code regenerated
  │
  └─ After 5 failures: Log critical error, wait for manual intervention
```

### 8.6 LLM API Failure

```
OpenRouter API call fails
  │
  ├─ 429 (Rate Limited) → Retry after Retry-After header
  ├─ 500 (Server Error) → Retry once after 2s
  ├─ 401 (Auth Error)   → Report "API key invalid" to user
  ├─ Timeout            → Report "LLM timeout" to user
  └─ Other              → Report error, no retry
```

---

*Architecture Reference for Fetch v3.1.2*
