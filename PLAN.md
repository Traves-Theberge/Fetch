# Fetch V3.2 — Deep Refinement Plan

> Generated from 4-agent deep audit of every module in the codebase.
> Previous plan (V3.1.2 structure overhaul) completed and shipped as `876cc7d`.

---

## ✅ Status: COMPLETE

All 7 phases have been implemented, verified, and shipped as **v3.3.0**.

| Phase | Status | Version |
|-------|--------|---------|
| Phase 1: Runtime Crash Fixes | ✅ Complete | v3.2.1 |
| Phase 2: Security Hardening | ✅ Complete | v3.2.1 |
| Phase 3: Dead Code Purge | ✅ Complete | v3.2.1 |
| Phase 4: Architecture Simplification | ✅ Complete | v3.3.0 |
| Phase 5: Infrastructure & Reliability | ✅ Complete | v3.3.0 |
| Phase 6: Proactive System Completion | ✅ Complete | v3.3.0 |
| Phase 7: Test Coverage & Strictness | ✅ Complete | v3.3.0 |

**Final test suite:** 13 files, 177 tests, 0 failures. tsc clean with strict unused checks.

---

## Phase 1: Runtime Crash Fixes (P0)

> Things that will throw errors at runtime right now.

### 1.1 — Session Store Schema Mismatch 🔴
**Bug:** `session/store.ts` prepares statements against a `summaries` table that is never created in the `CREATE TABLE` block. Calling `saveSummary()` or `getSummaries()` will crash.
**Second bug:** The `conversation_threads` table DDL defines `(id, session_id, project_id, ...)` but prepared statements query `(thread_id, session_id, title, ...)` — completely different columns.
**Also:** `memory_facts` and `working_context` tables are created but have zero readers/writers — dead schema.
**Fix:** Align the DDL with the prepared statements. Add `summaries` table. Remove dead tables.

### 1.2 — Harness Executor Dead Map Reads 🔴
**Bug:** `executor.ts` `getStatus()` and `sendInput()` read from `this.activeProcesses` Map, but the pool-based `execute()` method never populates it. Only the dead `executeDirectly()` method does. Any call to `getStatus()` throws "Harness not found".
**Fix:** Wire pool-based execution to populate the active processes map, or expose status through the pool.

### 1.3 — `task_respond` Tool Never Sends to Harness 🔴
**Bug:** `tools/task.ts` `task_respond` resumes the task state but has a `// TODO: Send response to harness via stdin`. The tool reports "Response delivered" which is false.
**Fix:** Wire `sendInput()` through the executor/pool to the harness stdin. This depends on 1.2.

### 1.4 — Identity Data Silently Discarded 🔴
**Bug:** The loader parses `owner` from ALPHA.md and `pack` from AGENTS.md, but `identity/manager.ts` `mergeLoaded()` never reads either field. Owner communication preferences and pack routing data are parsed then thrown away.
**Also:** The `pack` field doesn't exist on the `AgentIdentity` type — it's smuggled via `as any` (6 instances of eslint-disable).
**Fix:** Add `owner` and `pack` fields to `AgentIdentity` type. Wire `mergeLoaded()` to consume them. Inject pack context into system prompt.

### 1.5 — Env Validation After Startup 🔴
**Bug:** In `index.ts`, the status server, mode system, and proactive system all start *before* `validateEnvironment()` runs. If `OPENROUTER_API_KEY` is missing, multiple subsystems have already initialized for nothing.
**Fix:** Move env validation to the very first line of `main()`, before any subsystem init.

---

## Phase 2: Security Hardening (P1)

### 2.1 — Shell Injection in Custom Tool Handler
**File:** `tools/registry.ts`
**Bug:** `{{param}}` interpolation into shell command strings. The AI agent controls parameter values, so a prompt injection → arbitrary shell execution.
**Fix:** Use `child_process.execFile` with argument arrays instead of string interpolation, or use a template engine with escaping.

### 2.2 — Shell Injection in Workspace Manager
**File:** `workspace/manager.ts`
**Bug:** Workspace names interpolated directly into shell strings: `` `git clone ... "${name}"` ``. A name containing `'; rm -rf / '` executes.
**Fix:** Validate workspace names against `^[a-zA-Z0-9_-]+$` before any shell use.

### 2.3 — Shell Injection in Command Parser
**File:** `commands/parser.ts`
**Bug:** Git clone URLs and commit SHAs passed to `exec()` without sanitization.
**Fix:** Use `execFile` with argument arrays. Validate SHAs with `/^[0-9a-f]{7,40}$/`.

### 2.4 — Unauthenticated `/api/logout`
**File:** `api/status.ts`
**Bug:** Any HTTP client on the Docker network can POST to `/api/logout` and disconnect WhatsApp.
**Fix:** Require a bearer token (generate on startup, log to console) or restrict to localhost.

### 2.5 — Validator Blocks Legitimate Code
**File:** `security/validator.ts`
**Bug:** The backtick pattern `` /`.*`/ `` rejects any message with inline code (e.g., "fix the \`main\` function"). For a coding assistant, this is a showstopper.
**Fix:** Remove backtick pattern. The real protection is the LLM sandboxing + Docker isolation, not input string scanning.

---

## Phase 3: Dead Code Purge (~1,500 lines)

### 3.1 — Delete `utils/stream.ts` (422 lines)
Zero imports anywhere. Entire file is dead.

### 3.2 — Delete `utils/sanitize.ts` (~80 lines)
Zero imports anywhere. Entire file is dead.

### 3.3 — Gut `agent/prompts.ts` (~450 dead lines)
Keep only `buildOrchestratorPrompt()`. Delete: `buildIntentClassificationPrompt()`, `buildTaskGoalPrompt()`, `buildOutputSummaryPrompt()`, `buildErrorRecoveryPrompt()`, and all their sub-constants (`ORCHESTRATOR_IDENTITY`, `TOOL_DESCRIPTIONS`, etc.). ~80% of the file is unused since intent classification moved to regex.

### 3.4 — Gut `agent/whatsapp-format.ts` (~450 dead lines)
Keep only `formatForWhatsApp()`. Delete: `formatDiff()`, `formatProgressBar()`, `formatToolAction()`, `formatCodeBlock()`, `formatError()`, `formatWarning()`, `formatSuccess()`, `formatInfo()`, `formatSection()`. Only 1 of 10 exports is called.

### 3.5 — Delete `agent/index.ts` (33 lines)
Barrel file with zero importers. Everything imports directly from submodules.

### 3.6 — Delete dead code in `agent/core.ts`
Remove commented-out `getCurrentMode()` and `buildConversationPrompt()` (~80 lines). Remove `undo`/`pause`/`resume` TODO stubs in switch statement.

### 3.7 — Delete dead code in `agent/intent.ts`
Remove `classifyWithLLM()` and `buildClassificationPrompt()` — vestigial LLM classification path, never called.

### 3.8 — Delete dead harness code
- `executor.ts`: Remove `executeDirectly()` (~126 lines), `STREAM_BUFFER_SIZE` constant, dead `handleQuestionDetected()` method.
- `registry.ts`: Remove `getCapabilities()` (hardcoded, never called), `logRegistryStatus()` (never called).
- `output-parser.ts`: Remove standalone `parseHarnessOutput()` export (only used in tests, not production).

### 3.9 — Delete dead security code
- `validator.ts`: Remove `sanitizeForShell()` (never called).
- `security/index.ts`: Remove re-export of `sanitizeForShell`.

### 3.10 — Clean `session/store.ts`
Remove `memory_facts` and `working_context` table DDL and any associated prepared statements — dead schema with zero readers/writers.

### 3.11 — Clean misc dead code
- `utils/logger.ts`: Remove 6 unused color constants, unused `box()` export.
- `config/paths.ts`: Remove `MEMORY_DIR` export (no memory system).
- `format.ts`: Reconcile duplicate help text (exists in both `format.ts` and `prompts.ts`).

---

## Phase 4: Architecture Simplification

### 4.1 — Unify the Dual Task System ⭐ (Biggest Win)
**Problem:** `session/types.ts` defines `SessionTask` and `session/manager.ts` manages tasks on the session object. `task/types.ts` defines `Task` and `task/manager.ts` manages tasks in SQLite + memory Map. These two systems never sync. A tool-created task doesn't appear in the session. A session task doesn't appear in the task manager.
**Fix:** Delete `SessionTask` from session types. Make `session/manager.ts` task methods delegate to `task/manager.ts`. Single source of truth for task state. This also eliminates the `taskApproval` system on sessions (which uses `SessionTask`) and reconciles it with the `Task` state machine.

### 4.2 — Eliminate Redundant Task Queue (265 lines)
**Problem:** `task/queue.ts` is a nullable-variable wrapper with its own event system. `task/manager.ts` already enforces single-task constraint independently. Queue events are never consumed by anything.
**Fix:** Expose `getRunningTask()` and `hasRunningTask()` on `TaskManager`. Delete `task/queue.ts`. Update `tools/task.ts` and `tools/interaction.ts` to use TaskManager directly.

### 4.3 — Centralized Env Config
**Problem:** 12+ env vars read ad-hoc across 11 files with duplicated fallback logic. `OPENROUTER_API_KEY` is read in 4 files, `OWNER_PHONE_NUMBER` in 3.
**Fix:** Create `src/config/env.ts` with a Zod schema that validates all env vars at startup. Export typed constants. All other files import from `env.ts` instead of reading `process.env` directly.

### 4.4 — Extract Harness Base Class
**Problem:** Claude, Gemini, and Copilot adapters share ~60% identical code: `formatGoal()`, `isQuestion()`, `extractSummary()`, `extractFileOperations()`.
**Fix:** Create `AbstractHarnessAdapter` with default implementations. Adapters override only what differs (CLI args, adapter-specific patterns). Eliminates ~200 lines of duplication.

### 4.5 — Fix Dual Harness Registration
**Problem:** `harness/registry.ts` holds adapters in a Map. `harness/executor.ts` also has its own `adapters` Map. In `task/integration.ts`, adapters are fetched via getters and registered on the executor, bypassing the registry entirely.
**Fix:** Single adapter registry. Executor looks up adapters from the registry, not its own map.

### 4.6 — Split Command Parser God Module
**Problem:** `commands/parser.ts` is 1,116 lines handling 25+ commands.
**Fix:** Split into sub-command modules:
- `commands/project.ts` — /project, /list, /clone, /init
- `commands/task.ts` — /status, /cancel, /approve, /reject
- `commands/git.ts` — /git status, /git diff, /git log, /undo
- `commands/config.ts` — /mode, /model, /identity, /skills, /thread
- `commands/system.ts` — /help, /clear, /version, /trust
- `commands/parser.ts` — lightweight router that dispatches to sub-modules

### 4.7 — Fix Formatting Layer
**Problem:** `formatForWhatsApp()` is called inside both `handleConversation()` and `handleWithTools()` in core.ts. Then the handler prepends a mode emoji. Formatting is split across 3 layers.
**Fix:** Remove formatting from agent/core.ts. Format only in handler/index.ts after receiving the raw response. Single formatting point.

### 4.8 — Intent Classifier: Collapse workspace/task
**Problem:** `classifyIntent()` distinguishes `workspace` vs `task` intents, but `handleWithTools()` ignores this — both take the identical LLM+tools path. The distinction serves no purpose at routing.
**Fix:** Merge into a single `action` intent. The tool definitions already handle the workspace-vs-task routing internally.

---

## Phase 5: Infrastructure & Reliability

### 5.1 — WhatsApp Reconnection
**Problem:** The `disconnected` event handler only logs. No reconnection attempt.
**Fix:** Implement exponential backoff reconnection with max retries. Emit status events for the TUI.

### 5.2 — Graceful Shutdown
**Problem:** SIGINT/SIGTERM handlers call `process.exit()` without stopping subsystems.
**Fix:** Shutdown sequence: close bridge → stop proactive system → stop status API → flush SQLite WAL → exit.

### 5.3 — Unhandled Rejection Handler
**Problem:** No `process.on('unhandledRejection')` handler. Uncaught async errors silently crash.
**Fix:** Add handler that logs the error and triggers graceful shutdown.

### 5.4 — Logger Log-Level Filtering
**Problem:** `LOG_LEVEL` env var is never read. Every log level always emits.
**Fix:** Read `LOG_LEVEL` and filter `debug`/`info` in production.

### 5.5 — Add `test` Script to package.json
**Problem:** No `"test"` script. Running tests requires `npx vitest` directly.
**Fix:** Add `"test": "vitest"`, `"test:unit": "vitest run tests/unit"`, `"test:e2e": "vitest run tests/e2e"`.

### 5.6 — Fix `transcription.isAvailable()`
**Problem:** Always returns `true` regardless of whether whisper binary/model exists.
**Fix:** Check for binary existence in Docker container before returning true.

### 5.7 — Rate Limiter: True Sliding Window + Eviction
**Problem:** Fixed window mislabeled as sliding. No eviction of stale entries.
**Fix:** Implement proper sliding window. Add periodic cleanup of entries older than 2x window.

### 5.8 — Bridge Message Deduplicator Optimization
**Problem:** Full Map iteration on every message for TTL cleanup (O(n) per message).
**Fix:** Periodic cleanup on interval instead of per-message.

---

## Phase 6: Proactive System Completion

### 6.1 — Wire `/remind` and `/schedule` to Slash Commands
**Problem:** These commands exist in `proactive/commands.ts` but aren't reachable from the `/` command parser — only through the instinct system.
**Fix:** Add cases to command parser that delegate to proactive command handlers.

### 6.2 — Fix One-Shot Reminders
**Problem:** `/remind` generates a cron with `*` for day-of-week, making it recur annually.
**Fix:** Use `setTimeout` for one-shot reminders. Only use cron for recurring schedules.

### 6.3 — Wire Watcher Events
**Problem:** File/git watcher detects changes but events go nowhere. The config parameter is ignored.
**Fix:** Connect watcher events to an event bus that can trigger reactive skills.

### 6.4 — Implement `/schedule list`
**Problem:** Returns hardcoded "implementation pending" string.
**Fix:** Query the polling service for active scheduled tasks and format for display.

---

## Phase 7: Test Coverage

### 7.1 — Add `commands/parser.ts` Tests
The largest untested file in the codebase (1,116 lines). Priority: project commands, git commands, error paths.

### 7.2 — Add Security Tests
Zero tests for `gate.ts`, `rateLimiter.ts`, `validator.ts`. These are security-critical.

### 7.3 — Rename "E2E" Tests
Current e2e tests mock everything. Rename the directory to `tests/integration-agent/` or similar to avoid confusion.

### 7.4 — Fix Mock Session IDs
Mock sessions use `'test-session-1'` which doesn't match the `ses_` production format.

### 7.5 — Enable `noUnusedLocals` / `noUnusedParameters`
Both are `false` in tsconfig.json, allowing dead variables to accumulate silently.

---

## Execution Order

| Priority | Phase | Status | Shipped |
|----------|-------|--------|---------|
| 🔴 | Phase 1: Runtime fixes | ✅ Complete | v3.2.1 |
| 🔴 | Phase 2: Security | ✅ Complete | v3.2.1 |
| 🟠 | Phase 3: Dead code purge | ✅ Complete | v3.2.1 |
| 🟡 | Phase 4: Architecture | ✅ Complete | v3.3.0 |
| 🟢 | Phase 5: Infrastructure | ✅ Complete | v3.3.0 |
| 🟢 | Phase 6: Proactive | ✅ Complete | v3.3.0 |
| ⚪ | Phase 7: Tests | ✅ Complete | v3.3.0 |

**Total actual impact:** ~1,400 lines deleted, ~1,800 lines changed/added. Net reduction while fixing every crash, security hole, and architectural debt item found. Test suite grew from 109 → 177 tests.
