# 🧠 Context Pipeline

> Fetch's memory system — how conversations persist across turns, how old context is compressed, and how tool call history stays visible to the LLM without leaking raw data to WhatsApp.

<!-- DIAGRAM:contextpipeline -->

---

## Overview

The Context Pipeline solves a core problem in conversational AI: **multi-turn memory**. Without it, every WhatsApp message is a blank slate — the LLM has no idea what tools it called, what workspaces are selected, or what tasks it started.

The pipeline provides three layers of memory:

| Layer | What It Does | Status |
|-------|-------------|--------|
| **Sliding Window** | Last 20 messages in full OpenAI multi-turn format (user, assistant, tool calls, tool results) | ✅ Shipped |
| **Compaction** | When messages exceed 40, older ones are LLM-summarized into a single digest and the array shrinks | ✅ Shipped |
| **BM25 Recall** | Full-text search across all messages (including compacted ones) for precision retrieval | 🔜 Planned |
| **Vector Search** | Semantic similarity search for when keyword matching isn't enough | 🔜 Planned |

**Key principle:** Tool calls are internal plumbing. The LLM sees them in history for context, but WhatsApp responses only contain clean natural language. The user never sees raw tool call data.

---

## How It Works

### Message Flow

```
WhatsApp message arrives
        ↓
  SessionManager.addUserMessage()     ← stores message, triggers compaction check
        ↓
  agent/core.ts → buildMessageHistory()  ← builds OpenAI-format array with tool_calls + tool results
        ↓
  OpenAI API → tool_calls → execute
        ↓
  SessionManager.addAssistantToolCallMessage()  ← persists what tools were called
  SessionManager.addToolMessage()               ← persists what each tool returned
        ↓
  SessionManager.addAssistantMessage()   ← stores final response text
        ↓
  WhatsApp ← only the response text (never raw tool data)
```

### Multi-Turn Format

Fetch uses the **OpenAI Function Calling Protocol** — the industry standard used by ChatGPT, Claude API, LangChain, Vercel AI SDK, and every production agent framework:

- **Assistant messages** carry `tool_calls` — what tools the LLM wants to invoke
- **Tool messages** carry results with a matching `tool_call_id` — what the tool returned
- **User/assistant messages** are standard `{role, content}` pairs

This means the LLM can see across turns: "I selected workspace `test-api` two messages ago, so I know we're working in that project."

### Sliding Window

The most recent **20 messages** (configurable via `FETCH_HISTORY_WINDOW`) are sent to the LLM in full. This covers approximately 10 conversation turns or 5 tool-call rounds.

Messages include all metadata:
- User text
- Assistant responses
- Tool call requests (which tool, what arguments)
- Tool results (what the tool returned)

### Compaction

When the session exceeds **40 messages** (configurable via `FETCH_COMPACTION_THRESHOLD`), the pipeline compacts:

1. Everything **before** the sliding window is collected
2. An LLM generates a concise summary of those older messages (~500 tokens)
3. The summary replaces those messages in `session.metadata.compactionSummary`
4. The message array shrinks back to the window size

The compaction summary is injected into the system prompt as a `## Conversation History 🧠` section, giving the LLM awareness of the full conversation even after hundreds of messages.

**Why compaction over rolling summaries:**
- Message array never grows unbounded
- One summary, refreshed each cycle — simpler than chained summaries
- Token-bounded: system prompt + summary (~500 tok) + last 20 messages is always predictable
- This is how Claude Code, Cursor, and Windsurf manage long conversations

### Proactive Notifications

The pipeline includes **task completion hooks**. When an AI harness finishes a task:

1. A `task:completed` or `task:failed` event fires
2. The handler adds a completion message to the session history
3. A WhatsApp notification is sent proactively — the user doesn't have to ask "is it done?"

```
🐕 ✅ Task finished!

Created Express API with 3 routes, JWT auth middleware, and Vitest test suite.
```

### Tool Context Passthrough

Tools receive a `ToolContext` object containing the `sessionId` and `autonomyLevel`, allowing:

- Tasks to be linked to their originating session
- Task goals to be framed using conversation context (via `frameTaskGoal()`)
- Tool results to be persisted back to the correct session
- The `ask_user` autonomy guard to know whether to auto-approve confirmation questions

---

## Configuration

All pipeline parameters live in a single config module (`config/pipeline.ts`) and are tunable via environment variables. No code changes or Docker rebuilds needed — just set the env var and restart.

### Environment Variables (36 parameters)

**Context Window**

| Variable | Default | Description |
|----------|---------|-------------|
| `FETCH_HISTORY_WINDOW` | `20` | Messages in the sliding window sent to the LLM |
| `FETCH_COMPACTION_THRESHOLD` | `40` | Trigger compaction when messages exceed this count |
| `FETCH_COMPACTION_MAX_TOKENS` | `500` | Max tokens for the LLM-generated compaction summary |
| `FETCH_COMPACTION_MODEL` | `SUMMARY_MODEL` | Model used for compaction (cheap + fast recommended) |

**Agent LLM**

| Variable | Default | Description |
|----------|---------|-------------|
| `FETCH_MAX_TOOL_CALLS` | `5` | Max tool call rounds per single user message |
| `FETCH_TOOL_MAX_TOKENS` | `2048` | Token budget for LLM responses |
| `FETCH_TOOL_TEMPERATURE` | `0.3` | Temperature for LLM responses (0.0–1.0) |
| `FETCH_FRAME_MAX_TOKENS` | `200` | Token budget for task framing prompts |

**Circuit Breaker**

| Variable | Default | Description |
|----------|---------|-------------|
| `FETCH_CB_THRESHOLD` | `3` | Errors before circuit breaker opens |
| `FETCH_CB_BACKOFF` | `1000,5000,30000` | Backoff schedule (ms, comma-separated) |
| `FETCH_MAX_RETRIES` | `3` | Max retries for retriable errors |
| `FETCH_RETRY_BACKOFF` | `0,1000,3000,10000` | Retry backoff schedule (ms, comma-separated) |
| `FETCH_CB_RESET_MS` | `300000` | Resets error count after this period of no errors (ms) |

**Task Execution**

| Variable | Default | Description |
|----------|---------|-------------|
| `FETCH_TASK_TIMEOUT` | `300000` | Task execution timeout (ms) |
| `FETCH_HARNESS_TIMEOUT` | `300000` | AI harness execution timeout (ms) |
| `FETCH_TASK_MAX_RETRIES` | `1` | Max task retries |

**WhatsApp Formatting**

| Variable | Default | Description |
|----------|---------|-------------|
| `FETCH_WA_MAX_LENGTH` | `4000` | Max characters per WhatsApp message |
| `FETCH_WA_LINE_WIDTH` | `40` | Max chars per line for mobile readability |

**Rate Limiting**

| Variable | Default | Description |
|----------|---------|-------------|
| `FETCH_RATE_LIMIT_MAX` | `30` | Requests per rate limit window |
| `FETCH_RATE_LIMIT_WINDOW` | `60000` | Rate limit window duration (ms) |

**Bridge / Reconnection**

| Variable | Default | Description |
|----------|---------|-------------|
| `FETCH_MAX_RECONNECT` | `10` | Max reconnect attempts before giving up |
| `FETCH_RECONNECT_BASE_DELAY` | `5000` | Base delay for exponential backoff reconnect (ms) |
| `FETCH_RECONNECT_MAX_DELAY` | `300000` | Max delay cap for reconnect (ms) |
| `FETCH_RECONNECT_JITTER` | `2000` | Max jitter added to reconnect delay (ms) |
| `FETCH_DEDUP_TTL` | `30000` | Message deduplication cache TTL (ms) |
| `FETCH_PROGRESS_THROTTLE` | `3000` | Throttle interval for progress updates (ms) |

**Session / Memory**

| Variable | Default | Description |
|----------|---------|-------------|
| `FETCH_RECENT_MSG_LIMIT` | `50` | Default recent messages limit for getRecentMessages() |
| `FETCH_TRUNCATION_LIMIT` | `100` | Max messages before hard truncation |
| `FETCH_REPO_MAP_TTL` | `300000` | Repo map staleness check (ms) |

**Workspace**

| Variable | Default | Description |
|----------|---------|-------------|
| `FETCH_WORKSPACE_CACHE_TTL` | `30000` | Workspace info cache TTL (ms) |
| `FETCH_GIT_TIMEOUT` | `5000` | Git command execution timeout (ms) |

### Docker Compose Example

```yaml
services:
  fetch-bridge:
    environment:
      # Longer conversations
      - FETCH_HISTORY_WINDOW=30
      - FETCH_COMPACTION_THRESHOLD=60
      # Tighter budget for cheaper models
      - FETCH_TOOL_MAX_TOKENS=300
      # Production rate limiting
      - FETCH_RATE_LIMIT_MAX=15
```

### TUI Tuning

All pipeline parameters are editable from the **Fetch TUI** (Go Manager) under **Configure → Edit Configuration**. The editor shows all 31 configurable `FETCH_*` parameters organized by subsystem with scrollable navigation. Model selection is also inside Configure at **Configure → Select Model**. The TUI writes to the same `.env` file that Docker Compose reads, so changes apply on next container restart.

### Scaling Guide

| Scenario | What to Tune | Suggested Values |
|----------|-------------|-----------------|
| Longer conversations | `FETCH_HISTORY_WINDOW`, `FETCH_COMPACTION_THRESHOLD` | 30, 60 |
| Cheaper model (8K context) | `FETCH_HISTORY_WINDOW`, `FETCH_TOOL_MAX_TOKENS` | 10, 300 |
| Large context model (200K) | `FETCH_HISTORY_WINDOW`, `FETCH_COMPACTION_THRESHOLD` | 50, 100 |
| High-traffic (multiple users) | `FETCH_RATE_LIMIT_MAX`, `FETCH_RATE_LIMIT_WINDOW` | 60, 60000 |
| Slow harness (large repos) | `FETCH_HARNESS_TIMEOUT`, `FETCH_TASK_TIMEOUT` | 600000, 600000 |
| Minimal resource usage | All token limits | Halve each default |

---

## Token Budget

The pipeline is designed to stay well within context limits for any modern model.

| Component | Tokens (est.) | Notes |
|-----------|---------------|-------|
| System prompt (identity + context) | ~800 | Identity, skills, project state |
| Compaction summary | ~500 | One summary, refreshed each cycle |
| Sliding window (20 messages) | ~4,000 | Mix of user, assistant, tool messages |
| Tool call messages in window | ~2,000 | Part of the 20-message window |
| Repo map + project context | ~500 | Workspace awareness |
| BM25 recalled context (planned) | ~1,500 | Top 5 results × 300 tokens each |
| **Total** | **~9,300** | **~7% of 128K context** |

WhatsApp messages average 20–50 tokens (not 200), so the window is efficient. Compaction is aggressive — everything before the window becomes ~500 tokens regardless of how many messages were condensed. Even on a 32K-context model, the pipeline uses under 30% of available space.

---

## Architecture

### Key Modules

| Module | Responsibility |
|--------|---------------|
| `config/pipeline.ts` | Single source of truth for all pipeline parameters |
| `session/manager.ts` | Message persistence, compaction triggers, session lifecycle |
| `agent/core.ts` | `buildMessageHistory()` — converts session messages to OpenAI multi-turn format |
| `agent/prompts.ts` | `buildContextSection()` — injects compaction summary and recalled memory into system prompt |
| `tools/registry.ts` | Tool execution with `ToolContext` passthrough (sessionId + autonomyLevel) |
| `handler/index.ts` | Task completion event listeners, WhatsApp sender registration |
| `bridge/client.ts` | Proactive WhatsApp message delivery |

### Data Flow

```
config/pipeline.ts ─────────────── read by all modules for thresholds/limits
         │
session/manager.ts ─── addUserMessage() ──→ compactIfNeeded() ──→ store.update()
         │                                        │
         │                              generateCompactionSummary()
         │                                        │
         │                              session.metadata.compactionSummary
         │
agent/core.ts ─── buildMessageHistory() ──→ OpenAI multi-turn array
         │
agent/prompts.ts ─── buildContextSection() ──→ system prompt with summary + recall
         │
handler/index.ts ─── task:completed event ──→ addAssistantMessage() + WhatsApp notification
```

---

## Roadmap

### ✅ Shipped (v3.4.0)

- **Centralized configuration** — 31 magic numbers replaced with `pipeline.*` config, tunable via env vars
- **OpenAI multi-turn format** — `buildMessageHistory()` emits proper `tool_calls` + `tool_call_id` messages
- **Tool call persistence** — assistant tool-call requests and tool results stored in session
- **20-message sliding window** — up from 10, configurable via `FETCH_HISTORY_WINDOW`
- **Compaction engine** — LLM-generated summaries when messages exceed threshold
- **Tool context passthrough** — `ToolContext` carries `sessionId` through the tool registry
- **Task framing** — `frameTaskGoal()` produces self-contained goals for harnesses
- **Proactive notifications** — task completion/failure events trigger WhatsApp messages
- **TUI pipeline tuning** — Go TUI config editor supports all `FETCH_*` parameters

### ✅ Shipped (v3.5.0)

- **Conversation tools** — `handleConversation()` now has read-only access to `workspace_list`, `workspace_select`, `workspace_status` (max 2 tool calls) so it can answer workspace questions without hallucinating
- **Dynamic prompt rebuild** — System prompt at `messages[0]` is replaced after `workspace_select`, `workspace_create`, or `task_create` so the LLM always sees current project/git/task state
- **Autonomy guard** — `ask_user` tool intercepts unnecessary confirmation questions ("Shall I?", "Would you like me to?") in non-supervised modes and auto-approves with "Yes, proceed."
- **ToolContext.autonomyLevel** — Session’s autonomy preference flows through the tool registry to `ask_user` for guard decisions
- **10 project types** — `detectProjectType()` now recognizes Node, TypeScript, Python, Rust, Go, Java, Ruby, PHP, .NET (with glob pattern support)
- **7 autonomy rules** — System prompt includes highest-priority directives enforcing agentic behavior (act first, summarize after)
- **Pipeline token budget increase** — `toolMaxTokens` 500→2048 for richer responses
- **Intent refinement** — Short-message cutoff reduced from 15 to 5 chars, with action verb exceptions; new greeting patterns ("hi <name>")

### ✅ Shipped (v4.0.0) — LLM-First Architecture

- **Single path** — Every message (except 5 safety escapes) takes the same single path through the LLM with all 12 tools. No more conversation/action handler split or intent classification
- **Removed instinct layer** — 12 deterministic handlers deleted; replaced by 5 safety escapes (`/stop`, `/undo`, `/clear`, `/help`, `/status`)
- **Removed intent classifier** — ~200 regex patterns deleted; the LLM inherently knows intent
- **Removed mode detector** — Regex-based classification eliminated
- **12 tools** — Added `workspace_sync` (commit + push to GitHub) bringing total from 11 to 12
- **Docker exec container field** — Harness adapters set `container: 'fetch-kennel'`; spawner wraps with `docker exec`
- **GitHub auto-sync** — `workspace_create` automatically creates a GitHub repo and pushes initial commit when `GH_TOKEN` is configured
- **Kennel entrypoint** — Custom `entrypoint.sh` configures `gh` CLI auth and git identity from `GH_TOKEN`
- **Net result** — ~2,800 lines deleted, 17 files removed, zero regressions. 185 tests pass

### 🔜 Phase 2: BM25 Memory & Precision Recall

Compaction provides the gist of older conversation, but sometimes you need specific details — "what was the port number we chose?" BM25 retrieval provides keyword-based precision recall from the full message history, including messages that were compacted away.

**How it works:**
- Messages are indexed in SQLite FTS5 **before** compaction
- On each new message, a BM25 search runs against the current query
- Top results (scored by relevance × recency) are injected into the system prompt as a `## Relevant Memory 🧠` section
- Controlled by `FETCH_RECALL_LIMIT`, `FETCH_RECALL_SNIPPET_TOKENS`, and `FETCH_RECALL_DECAY`

### 🔮 Phase 3: Vector Similarity

Semantic search for when BM25 keyword matching isn't enough. "What was that auth fix?" should find messages about "JWT token refresh" even without keyword overlap.

**Planned approach:**
- `all-MiniLM-L6-v2` embeddings (22MB ONNX model, runs on CPU in Node.js)
- 384-dimensional vectors stored in SQLite, cosine similarity in JavaScript
- Hybrid scoring: `α × BM25 + (1-α) × cosine_similarity` where α = 0.6
- Indexed at the same points as FTS5 — when messages, tool results, and summaries are added
