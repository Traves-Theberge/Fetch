# Engineering Gap Backlog

Status: Draft
Created: 2026-02-13
Scope: Review findings for bridge reliability, notification behavior, command safety, and API consistency.

## Index

- [Definitions](#definitions)
- [Issue List](#issue-list)
- [Prioritized TODO](#prioritized-todo)
- [Later Improvements](#later-improvements)
- [Acceptance Checklist](#acceptance-checklist)

## Definitions

- Severity:
  - S1 Critical: Can cause destructive behavior, major data risk, or broken core flow.
  - S2 High: User-visible correctness issues or major reliability risk.
  - S3 Medium: Behavior mismatch, edge-case failure, or operational inconsistency.
  - S4 Low: Quality or maintainability improvement with low immediate risk.
- Priority:
  - P0 Now: Fix before feature work.
  - P1 Next: Fix in current milestone after P0.
  - P2 Later: Backlog item for planned hardening.
- Status:
  - Open: Not started.
  - In Progress: Active work started.
  - Blocked: Waiting on dependency/decision.
  - Done: Implemented and verified.
- Done Criteria:
  - Code updated.
  - Tests added/updated.
  - Docs updated where behavior changed.

## Issue List

### GAP-001: `/undo all` git reset may run in wrong directory
- Severity: S1 Critical
- Priority: P0 Now
- Status: Done
- Area: `fetch-app/src/commands/task.ts`
- Evidence: `fetch-app/src/commands/task.ts:29` uses `execSync("git reset --hard ...")` without explicit `cwd`.
- Risk: Undo command can fail or target the wrong git repository depending on process working directory.
- Proposed Change:
  - Execute git commands with explicit workspace/repo `cwd`.
  - Validate repo root before running destructive commands.
  - Return actionable error if repo check fails.
- Test Coverage Needed:
  - Unit test that verifies command uses expected `cwd`.
  - Failure-path test when repo is unavailable.

### GAP-002: `/version` can render `vv...`
- Severity: S2 High
- Priority: P0 Now
- Status: Done
- Area: `fetch-app/src/commands/parser.ts`, `fetch-app/src/utils/version.ts`
- Evidence:
  - `fetch-app/src/commands/parser.ts:118` uses `v${VERSION}`.
  - `fetch-app/src/utils/version.ts:19` already returns `v`-prefixed version.
- Risk: User-facing version output is incorrect and can break parsing assumptions in integrations/tests.
- Proposed Change:
  - Single source of truth for version format.
  - Either keep prefix in utility and print raw, or keep utility raw and prefix at edge.
- Test Coverage Needed:
  - Ensure output is exactly one `v` prefix.

### GAP-003: Thinking/progress timer not guaranteed to clear on thrown errors
- Severity: S2 High
- Priority: P0 Now
- Status: Done
- Area: `fetch-app/src/handler/index.ts`
- Evidence:
  - Timer starts around `fetch-app/src/handler/index.ts:227`.
  - Clear occurs in success path near `fetch-app/src/handler/index.ts:245` only.
- Risk: Stale progress message can fire after an error response, causing duplicate/conflicting user messages.
- Proposed Change:
  - Move timer cleanup into `finally`.
  - Protect send path against post-failure dispatch.
- Test Coverage Needed:
  - Verify timer cleanup when `processMessage` throws.

### GAP-004: Status API session-id validation is inconsistent across routes
- Severity: S3 Medium
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/api/status.ts`
- Evidence:
  - GET/CLEAR use strict alphanumeric regex (`fetch-app/src/api/status.ts:342`, `fetch-app/src/api/status.ts:416`).
  - DELETE logic is broader (`fetch-app/src/api/status.ts:378`).
- Risk: Valid historical IDs with `_` or `-` may work in one route and fail in another.
- Proposed Change:
  - Centralize session-id validation helper and reuse for all route handlers.
  - Document accepted session-id grammar.
- Test Coverage Needed:
  - Route tests for alphanumeric, underscore, and hyphen IDs.

### GAP-005: Notification anti-repeat cache scope is global
- Severity: S4 Low
- Priority: P2 Later
- Status: Done
- Area: `fetch-app/src/agent/notifications.ts`
- Evidence: Module-level map keyed only by event type near `fetch-app/src/agent/notifications.ts:52`.
- Risk: Cross-session coupling of variation behavior (different users influence each other).
- Proposed Change:
  - Key anti-repeat by `(chatId|sessionId, event)` with TTL.
- Test Coverage Needed:
  - Ensure one session does not affect another.

### GAP-006: Runtime config reload path lacks strict validation gate
- Severity: S3 Medium
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/api/status.ts`, `fetch-app/src/config/env.ts`
- Evidence: Runtime updates write to env directly (`fetch-app/src/api/status.ts:246-247`) without full schema validation.
- Risk: Invalid runtime values accepted, failures occur later and are harder to trace.
- Proposed Change:
  - Introduce validation gate for runtime updates.
  - Reject unsafe values with explicit response errors.
- Test Coverage Needed:
  - API tests for valid/invalid runtime config updates.

### GAP-007: Harness executor never emits parsed progress/question/file-op events
- Severity: S1 Critical
- Priority: P0 Now
- Status: Done
- Area: `fetch-app/src/harness/executor.ts`, `fetch-app/src/task/integration.ts`
- Evidence:
  - `fetch-app/src/task/integration.ts:205`, `fetch-app/src/task/integration.ts:211`, `fetch-app/src/task/integration.ts:217` subscribe to `harness:progress`, `harness:file_op`, `harness:question`.
  - `fetch-app/src/harness/executor.ts:136-153` only emits `harness:output` with raw stdout/stderr payload and never calls adapter parsing methods.
  - `fetch-app/src/harness/executor.ts:236` requires `waiting_input` for `sendInput`, but executor never transitions to that status.
- Risk:
  - Interactive task flows cannot reliably pause for user input.
  - File operation telemetry and progress events are effectively dead paths.
  - `task_respond` behavior can fail because tasks never enter `waiting_input`.
- Proposed Change:
  - Parse output lines with adapter `parseOutputLine()` and `detectQuestion()`.
  - Emit `harness:progress`, `harness:file_op`, and `harness:question` from executor.
  - Set execution status to `waiting_input` when question events are detected.
- Test Coverage Needed:
  - Integration tests verifying parsed event emission from real stdout lines.
  - Task integration tests proving question->pause->respond->resume flow.

### GAP-008: `task:output` bridge expects `data.line` but executor emits `data.data`
- Severity: S2 High
- Priority: P0 Now
- Status: Done
- Area: `fetch-app/src/task/integration.ts`, `fetch-app/src/harness/executor.ts`
- Evidence:
  - `fetch-app/src/task/integration.ts:198` checks `data?.line`.
  - `fetch-app/src/harness/executor.ts:146-150` stores output payload as `{ type, data, timestamp }`.
  - `fetch-app/src/task/integration.ts:202` emits `line: data?.line`, which is usually `undefined`.
- Risk:
  - Progress callback forwarding loses live output.
  - Observability and user-visible streaming updates are degraded.
- Proposed Change:
  - Normalize event payload contract (`line` vs `data`) across executor/integration.
  - Introduce a shared event payload type and enforce it in both modules.
- Test Coverage Needed:
  - Unit test asserting `task:output` includes actual line text.
  - Integration test for callback forwarding in a running task.

### GAP-009: Spawner kill path can be overwritten by close-event failure status
- Severity: S2 High
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/harness/spawner.ts`
- Evidence:
  - `fetch-app/src/harness/spawner.ts:209` emits `status: 'killed'` on manual/timeout kill.
  - `fetch-app/src/harness/spawner.ts:177-182` close handler then emits `'failed'` for non-zero/null exit code.
- Risk:
  - A killed task may later be reported as failed.
  - Downstream retry/error-category logic becomes inconsistent.
- Proposed Change:
  - Preserve terminal precedence (`killed` should remain terminal).
  - Guard close handler to avoid downgrading an already-killed instance.
- Test Coverage Needed:
  - Lifecycle test asserting kill emits one terminal state and does not flip to failed.

### GAP-010: Harness instance records are never pruned from spawner/executor maps
- Severity: S3 Medium
- Priority: P2 Later
- Status: Done
- Area: `fetch-app/src/harness/spawner.ts`, `fetch-app/src/harness/executor.ts`
- Evidence:
  - `fetch-app/src/harness/spawner.ts:41` and `fetch-app/src/harness/executor.ts:72` maintain in-memory maps.
  - Completed/failed entries are not evicted after terminal state.
- Risk:
  - Unbounded memory growth in long-lived bridge sessions.
  - Slower lookups and increasing in-process state over time.
- Proposed Change:
  - Add bounded retention (size cap or TTL-based pruning).
  - Keep only active and recent terminal executions.
- Test Coverage Needed:
  - Retention policy tests validating eviction behavior.

### GAP-011: Command-arg redaction is case-sensitive and misses lower-case keys
- Severity: S3 Medium
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/harness/spawner.ts`
- Evidence:
  - `fetch-app/src/harness/spawner.ts:32` uses `key.includes(s)` against uppercase tokens only.
- Risk:
  - Log leakage if env keys are lowercase/mixed-case (`api_key`, `token`, etc.).
- Proposed Change:
  - Compare keys case-insensitively before redaction.
  - Extend matcher for common secret key variants.
- Test Coverage Needed:
  - Unit tests for uppercase, lowercase, and mixed-case secret env names.

### GAP-012: Identity manager ignores loaded owner context from ALPHA
- Severity: S2 High
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/identity/manager.ts`, `fetch-app/src/identity/loader.ts`
- Evidence:
  - Loader parses/returns `context.owner` (`fetch-app/src/identity/loader.ts:47-49`, `fetch-app/src/identity/loader.ts:73`).
  - Reload merge in manager updates name/role/voice/directives only (`fetch-app/src/identity/manager.ts:103-116`), never merges `loaded.context`.
- Risk:
  - Prompt context can drift from `ALPHA.md` owner data.
  - User-profile updates may not be reflected in runtime identity.
- Proposed Change:
  - Merge `loaded.context` fields during `reloadIdentity()`.
  - Add explicit merge policy for context keys.
- Test Coverage Needed:
  - Unit tests verifying `context.owner` updates after reload.

### GAP-013: Whitelist persistence lock can become permanently rejected after one write failure
- Severity: S2 High
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/security/whitelist.ts`
- Evidence:
  - Writes are serialized as `this.persistLock = this.persistLock.then(() => this.doPersist())` (`fetch-app/src/security/whitelist.ts:170-172`).
  - If one `doPersist()` rejects, future chained calls inherit a rejected promise and never recover.
- Risk:
  - A transient disk failure can permanently disable whitelist updates until process restart.
- Proposed Change:
  - Use recovery chaining (`catch`) so later writes still execute.
  - Surface errors per call without poisoning the lock chain.
- Test Coverage Needed:
  - Failure/recovery test: first persist fails, subsequent persist succeeds.

### GAP-014: Whitelist singleton init promise is sticky on initialization failure
- Severity: S3 Medium
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/security/whitelist.ts`
- Evidence:
  - `whitelistInitPromise` is assigned once (`fetch-app/src/security/whitelist.ts:312-317`) and never reset on reject.
- Risk:
  - One failed initialization leaves process unable to reinitialize whitelist without restart.
- Proposed Change:
  - Reset `whitelistInitPromise` in failure path.
  - Retry-safe singleton initialization.
- Test Coverage Needed:
  - Init failure followed by successful retry in same process.

### GAP-015: Identity manager startup and reload are fire-and-forget with no readiness contract
- Severity: S3 Medium
- Priority: P2 Later
- Status: Done
- Area: `fetch-app/src/identity/manager.ts`
- Evidence:
  - Constructor calls `this.reloadIdentity()` without await (`fetch-app/src/identity/manager.ts:66`).
  - `reloadIdentity()` is asynchronous but returns void (`fetch-app/src/identity/manager.ts:99`).
- Risk:
  - First prompt may be built before identity files are loaded.
  - Tests and runtime can observe timing-dependent identity values.
- Proposed Change:
  - Expose an awaited initialization/readiness method.
  - Optionally make reload return a promise for deterministic call sites.
- Test Coverage Needed:
  - Deterministic startup test ensuring loaded identity is present before first prompt build.

### GAP-016: `sanitizePath` does not normalize backslash traversal or Windows-style absolute paths
- Severity: S3 Medium
- Priority: P2 Later
- Status: Done
- Area: `fetch-app/src/security/validator.ts`
- Evidence:
  - Sanitizer normalizes `/` only (`fetch-app/src/security/validator.ts:105-108`), not backslashes or drive prefixes.
- Risk:
  - Inconsistent traversal mitigation across path formats.
  - Unexpected path forms may bypass intended normalization.
- Proposed Change:
  - Normalize `\\` to `/`, strip drive-letter prefixes, then apply traversal cleanup.
  - Add path normalization tests for Windows-style input.
- Test Coverage Needed:
  - Cases for `..\\`, `C:\\`, mixed separators, and UNC-like prefixes.

### GAP-017: No explicit shutdown/teardown path for whitelist watcher and rate-limiter timer
- Severity: S4 Low
- Priority: P2 Later
- Status: Done
- Area: `fetch-app/src/security/whitelist.ts`, `fetch-app/src/security/rateLimiter.ts`
- Evidence:
  - Whitelist watcher created (`fetch-app/src/security/whitelist.ts:135`) but no public close/shutdown method.
  - Rate limiter creates `setInterval` (`fetch-app/src/security/rateLimiter.ts:30`) with no explicit clear method.
- Risk:
  - Harder deterministic teardown in tests and graceful shutdown paths.
  - Background resources remain active longer than needed.
- Proposed Change:
  - Add `shutdown()` on whitelist store to close watcher.
  - Add `shutdown()` on rate limiter to clear eviction timer.
- Test Coverage Needed:
  - Teardown tests validating watchers/timers are closed.

### GAP-018: Background compaction can race with normal message writes
- Severity: S2 High
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/session/manager.ts`
- Evidence:
  - `addUserMessage()` triggers `compactIfNeeded()` asynchronously without awaiting (`fetch-app/src/session/manager.ts:112`).
  - `compactIfNeeded()` trims `session.messages` and persists full session (`fetch-app/src/session/manager.ts:186-236`).
  - Assistant/tool messages can be appended concurrently and persisted through separate writes (`fetch-app/src/session/manager.ts:130-176`).
- Risk:
  - Out-of-order write races can drop or overwrite newer messages.
  - Session history and compaction metadata may become inconsistent under bursty traffic.
- Proposed Change:
  - Add per-session compaction lock/queue.
  - Re-read latest persisted session before applying trim or use compare-and-swap versioning.
- Test Coverage Needed:
  - Concurrency test with overlapping user+assistant writes during compaction.

### GAP-019: Session manager singleton init promise is sticky on initialization failure
- Severity: S2 High
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/session/manager.ts`
- Evidence:
  - `initPromise` is cached in `getSessionManager()` (`fetch-app/src/session/manager.ts:344-360`) and never reset on rejection.
- Risk:
  - A transient startup/init error can permanently block session manager initialization until process restart.
- Proposed Change:
  - Reset `initPromise` when initialization fails.
  - Keep retry path deterministic and observable via logs.
- Test Coverage Needed:
  - Failure-then-retry test for `getSessionManager()`.

### GAP-020: Session row deserialization is unguarded and can crash reads on malformed JSON
- Severity: S3 Medium
- Priority: P2 Later
- Status: Done
- Area: `fetch-app/src/session/store.ts`
- Evidence:
  - `rowToSession()` parses raw JSON without try/catch (`fetch-app/src/session/store.ts:189-193`).
- Risk:
  - One corrupted row can throw during `getById/getByUserId/getOrCreate` and disrupt message handling.
- Proposed Change:
  - Wrap parse with guarded fallback.
  - Log row/session id and either repair row or return safe default.
- Test Coverage Needed:
  - Corrupt row fixture test covering get-by-id and get-or-create paths.

### GAP-021: Session store singleton makes dbPath-dependent testing/config fragile
- Severity: S4 Low
- Priority: P2 Later
- Status: Done
- Area: `fetch-app/src/session/store.ts`
- Evidence:
  - `getSessionStore(dbPath?)` returns first-created singleton and ignores subsequent dbPath overrides (`fetch-app/src/session/store.ts:506-510`).
- Risk:
  - Tests and runtime utilities cannot reliably switch store path after first resolution.
  - Hidden coupling in long-lived processes.
- Proposed Change:
  - Add explicit reset/test hook or remove optional dbPath from singleton accessor.
  - Keep constructor-based explicit instances for test isolation.
- Test Coverage Needed:
  - Singleton path override behavior test and reset-hook test (if added).

### GAP-022: Session ID generation is random but not deterministic/test-injectable
- Severity: S4 Low
- Priority: P2 Later
- Status: Done
- Area: `fetch-app/src/session/types.ts`
- Evidence:
  - `generateId()` uses `Math.random()` directly (`fetch-app/src/session/types.ts:206-211`).
- Risk:
  - Harder deterministic testing of ID-dependent flows.
  - No central strategy if ID entropy/format requirements change.
- Proposed Change:
  - Inject ID generator dependency or centralize shared ID utility.
  - Keep current format compatibility while improving testability.
- Test Coverage Needed:
  - Deterministic unit tests via mocked/injected generator.

### GAP-023: Skill summary can advertise skills whose runtime requirements are not met
- Severity: S3 Medium
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/skills/manager.ts`
- Evidence:
  - Initial load path stores skills without requirement validation (`fetch-app/src/skills/manager.ts:172-176`).
  - Summary rendering includes all enabled skills (`fetch-app/src/skills/manager.ts:198-201`).
  - Requirement checks only happen at match time (`fetch-app/src/skills/manager.ts:145-147`).
- Risk:
  - `<available_skills>` can claim capabilities that cannot activate at runtime.
  - Prompt guidance and actual activation behavior diverge.
- Proposed Change:
  - Validate requirements during initial load and exclude unmet skills from registry, or mark them as unavailable in summary.
  - Keep summary and activation paths consistent by sharing one availability filter.
- Test Coverage Needed:
  - Unit test where a skill with unmet `envVars` is excluded (or clearly marked unavailable) from summary.
  - Match/summary parity test for requirement-gated skills.

### GAP-024: Skill reload keeps stale in-memory skill when updated requirements become unmet
- Severity: S3 Medium
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/skills/manager.ts`
- Evidence:
  - On file change with unmet requirements, reload path logs and skips (`fetch-app/src/skills/manager.ts:96-101`) but does not remove existing entry.
- Risk:
  - Old instructions remain active after an update intended to disable/gate the skill.
  - Runtime behavior can drift from on-disk `SKILL.md`.
- Proposed Change:
  - On failed requirement check during reload, remove existing skill entry for that id.
  - Log explicit transition (`active -> unavailable`) for observability.
- Test Coverage Needed:
  - Hot-reload test: skill initially valid, then edited with unmet requirement, should be removed/disabled immediately.

### GAP-025: Activated-skill XML blocks are built with unescaped markdown content
- Severity: S2 High
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/skills/manager.ts`
- Evidence:
  - Raw `skill.name` and `skill.instructions` are interpolated directly into pseudo-XML blocks (`fetch-app/src/skills/manager.ts:229-233`).
- Risk:
  - User-defined skill content can break prompt structure by injecting tag-like content.
  - Reduced reliability and harder reasoning when prompt sections become malformed.
- Proposed Change:
  - Escape reserved XML characters in skill names and instruction content before interpolation.
  - Consider switching to fenced markdown sections with explicit delimiters instead of XML-like tags.
- Test Coverage Needed:
  - Unit test with instructions containing `<`, `>`, and closing-tag strings to ensure output remains structurally valid.

### GAP-026: File watchers are not fully included in graceful shutdown path
- Severity: S3 Medium
- Priority: P2 Later
- Status: Done
- Area: `fetch-app/src/index.ts`, `fetch-app/src/skills/manager.ts`, `fetch-app/src/identity/manager.ts`, `fetch-app/src/tools/registry.ts`
- Evidence:
  - `SkillManager` and `IdentityManager` expose shutdown APIs (`fetch-app/src/skills/manager.ts:188-193`, `fetch-app/src/identity/manager.ts:127-131`).
  - Bridge shutdown does not call them (`fetch-app/src/index.ts:133-157`).
  - `ToolRegistry` owns chokidar watchers (`fetch-app/src/tools/registry.ts:115`, `fetch-app/src/tools/registry.ts:136-146`) but has no shutdown API.
- Risk:
  - File watchers can outlive core runtime in tests or partial restarts.
  - Harder deterministic teardown and potential resource leaks.
- Proposed Change:
  - Add `ToolRegistry.shutdown()` and call all watcher shutdown methods from the main shutdown sequence.
  - Add one orchestrated teardown path for bridge, managers, registry, and stores.
- Test Coverage Needed:
  - Shutdown integration test asserting watcher close calls for skills, identity, and tools.

### GAP-027: `disabledSkills` config is defined but not enforced
- Severity: S4 Low
- Priority: P2 Later
- Status: Done
- Area: `fetch-app/src/skills/types.ts`, `fetch-app/src/skills/manager.ts`
- Evidence:
  - Config includes `disabledSkills` (`fetch-app/src/skills/types.ts:64`, `fetch-app/src/skills/manager.ts:24`) but it is not referenced in load/match paths.
- Risk:
  - Dead configuration field adds confusion and false expectations for operators.
- Proposed Change:
  - Enforce `disabledSkills` during load/match or remove the field entirely.
  - Document behavior explicitly in skills guide/config docs.
- Test Coverage Needed:
  - Unit test verifying disabled skill IDs are excluded from summary/match if feature is kept.

### GAP-028: `TaskIntegration` auto-agent resolution is inconsistent with `TaskManager` and ignores OpenCode/Codex
- Severity: S2 High
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/task/integration.ts`, `fetch-app/src/task/manager.ts`
- Evidence:
  - Integration resolves `auto` locally with only claude/copilot/gemini checks and hard fallback to copilot (`fetch-app/src/task/integration.ts:231-240`).
  - Manager supports claude/copilot/gemini/opencode/codex and throws on ambiguous/no-enabled cases (`fetch-app/src/task/manager.ts:393-466`).
- Risk:
  - Divergent routing behavior between manager and integration layers.
  - Legacy/edge tasks carrying `agent: "auto"` can bypass ambiguity enforcement and route to unintended harness.
- Proposed Change:
  - Remove duplicate auto-selection logic from integration and require concrete `task.agent` from manager.
  - If `auto` appears in integration path, delegate to manager resolution logic or fail with explicit error.
- Test Coverage Needed:
  - Integration test covering `auto` with multiple enabled agents (must not silently pick one).
  - Regression test with OpenCode/Codex enabled to ensure they are considered consistently.

### GAP-029: Task integration failure path can rethrow when `failTask` transition is invalid
- Severity: S2 High
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/task/integration.ts`
- Evidence:
  - `executeTask()` catch block always calls `this.manager!.failTask(...)` (`fetch-app/src/task/integration.ts:142`) without guarding secondary transition errors.
  - Invalid transitions (e.g., concurrent cancel) throw in manager transition enforcement (`fetch-app/src/task/manager.ts:379-387`).
- Risk:
  - Original harness failure can be masked by secondary transition exception.
  - Caller may lose normalized failure result and get inconsistent task terminal state.
- Proposed Change:
  - Wrap `failTask` in inner try/catch and preserve original execution error in returned result.
  - Optionally no-op if task already terminal.
- Test Coverage Needed:
  - Concurrency test where task is cancelled during execution and executor then fails.
  - Assertion that `executeTask()` still returns deterministic failure payload without uncaught throw.

### GAP-030: Task store task-row deserialization is unguarded
- Severity: S3 Medium
- Priority: P2 Later
- Status: Done
- Area: `fetch-app/src/task/store.ts`
- Evidence:
  - `loadAllTasks()` directly parses JSON rows without try/catch (`fetch-app/src/task/store.ts:89-90`).
- Risk:
  - One malformed task row can crash task-manager initialization/read paths.
  - Corrupt persisted task data can block startup behavior.
- Proposed Change:
  - Guard JSON parse per row and skip/repair invalid entries with structured logging.
  - Add optional quarantine/cleanup strategy for bad rows.
- Test Coverage Needed:
  - Store test with one corrupt row among valid rows to verify partial recovery.

### GAP-031: Task manager initialization silently degrades on persistence failure
- Severity: S3 Medium
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/task/manager.ts`
- Evidence:
  - `init()` catches all store errors and does not propagate (`fetch-app/src/task/manager.ts:84-87`).
- Risk:
  - Process can appear healthy while task persistence is unavailable.
  - Task lifecycle may continue in-memory only, risking data loss across restarts.
- Proposed Change:
  - Expose degraded-state flag/health signal when store init fails.
  - Decide policy: fail fast on boot or continue with explicit degraded-mode warnings/metrics.
- Test Coverage Needed:
  - Unit test for store init failure ensuring degraded state is observable.
  - Integration test verifying startup health endpoint reflects persistence failure if fail-fast/degraded policy is adopted.

### GAP-032: Custom tool rename-on-reload leaves stale tool registrations
- Severity: S2 High
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/tools/registry.ts`
- Evidence:
  - On file change, loader registers the new tool and then overwrites `customToolFiles` (`fetch-app/src/tools/registry.ts:164-166`).
  - There is no cleanup of the old tool name previously mapped to that file before overwrite.
- Risk:
  - Renaming a tool inside an existing JSON file can leave a stale/ghost tool in the registry.
  - LLM may continue calling a tool that no longer exists on disk.
- Proposed Change:
  - On reload, look up prior mapped name for the file and remove it if the name changed.
  - Add an explicit "replace-by-file" path to avoid stale entries.
- Test Coverage Needed:
  - Loader/watcher test: same file changes from `tool_a` to `tool_b` and `tool_a` is removed.
  - Registry test asserting no duplicate/ghost tools after rename.

### GAP-033: Custom tool definition validation is too weak for runtime safety
- Severity: S2 High
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/tools/loader.ts`, `fetch-app/src/tools/registry.ts`
- Evidence:
  - Loader only checks `name`, `description`, `command` (`fetch-app/src/tools/loader.ts:36-42`).
  - `buildToolSchema()` assumes `def.parameters` is iterable (`fetch-app/src/tools/loader.ts:53`).
  - Watcher callbacks call async `loadCustomTool()` without local error handling (`fetch-app/src/tools/registry.ts:136-138`, `146-167`).
- Risk:
  - Malformed custom tool JSON can throw during schema build/load and destabilize runtime reload path.
  - Invalid parameter definitions can produce unpredictable validation/exec behavior.
- Proposed Change:
  - Add strict Zod schema for custom tool definition structure (including `parameters` array shape and allowed types).
  - Guard watcher load path with try/catch and fail one file without affecting watcher lifecycle.
- Test Coverage Needed:
  - Invalid `parameters` (missing/incorrect type) test that cleanly rejects tool and keeps process stable.
  - Watcher-path test that malformed JSON does not register tool and does not crash reload flow.

### GAP-034: `browser_action` schema does not enforce action-specific required fields
- Severity: S3 Medium
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/validation/tools.ts`, `fetch-app/src/tools/browser.ts`
- Evidence:
  - Schema marks `ref`/`text` optional for all actions (`fetch-app/src/validation/tools.ts:653-663`), while docs state `ref` required for `click`/`type`, `text` required for `type`.
  - Handler forwards payload directly (`fetch-app/src/tools/browser.ts:120-124`) without additional field dependency checks.
- Risk:
  - Invalid browser actions pass schema validation and fail later in browser agent with less actionable errors.
  - Increased tool-call retries and brittle behavior in interactive browser workflows.
- Proposed Change:
  - Use discriminated/refined schema rules:
    - `click` requires `ref` (or explicit coordinate mode),
    - `type` requires both `ref` and `text`.
  - Return clear validation errors at tool boundary.
- Test Coverage Needed:
  - Validation tests for missing `ref` on `click`.
  - Validation tests for missing `ref`/`text` on `type`.

### GAP-035: `web_fetch` SSRF guard is hostname-pattern only
- Severity: S2 High
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/tools/web.ts`
- Evidence:
  - Blocking logic only matches hostname text patterns (`fetch-app/src/tools/web.ts:28-36`, `59-63`).
  - No DNS resolution / IP classification is performed before fetch.
- Risk:
  - Private/internal targets can be reached through hostnames that resolve to internal IP ranges.
  - Increases SSRF exposure surface despite current regex blocklist.
- Proposed Change:
  - Resolve hostnames and reject private/link-local/loopback ranges after resolution.
  - Enforce protocol allowlist (`http`/`https`) and consider redirect target re-validation.
- Test Coverage Needed:
  - Tests for internal-hostname resolution rejection.
  - Redirect-chain tests ensuring private destination is blocked even after public initial URL.

### GAP-036: `task_create` ambiguous-agent response uses hardcoded, potentially stale choices
- Severity: S3 Medium
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/tools/task.ts`
- Evidence:
  - Ambiguity fallback returns fixed choices `['copilot', 'gemini', 'codex']` (`fetch-app/src/tools/task.ts:159-164`).
  - Validation schema supports additional agents (`claude`, `opencode`) (`fetch-app/src/validation/tools.ts:33`).
- Risk:
  - User is offered an incomplete choice set.
  - Agent selection guidance can drift from enabled/runtime-available agents.
- Proposed Change:
  - Source choices from enabled-agent config/runtime availability instead of hardcoded literals.
  - Keep ambiguity payload in sync with `AgentSelectionSchema` and enabled harness set.
- Test Coverage Needed:
  - Unit test verifying ambiguity response includes currently enabled agents.
  - Regression test for schema/choice-set consistency.

### GAP-037: File/folder delete path guard is bypassable via string-prefix checks
- Severity: S1 Critical
- Priority: P0 Now
- Status: Done
- Area: `fetch-app/src/workspace/manager.ts`, `fetch-app/src/validation/tools.ts`, `fetch-app/src/validation/common.ts`
- Evidence:
  - Delete operations build `absolutePath` and only check `startsWith(wsRoot)` (`fetch-app/src/workspace/manager.ts:1202-1204`, `fetch-app/src/workspace/manager.ts:1236-1238`).
  - Prefix checks do not normalize path segments (`..`) or enforce path boundaries; `"/workspace/ws/../other"` and `"/workspace/ws-evil/*"` can satisfy naive prefix logic.
  - `file_delete` / `folder_delete` schemas accept raw string paths (`fetch-app/src/validation/tools.ts:152`, `fetch-app/src/validation/tools.ts:175`) instead of `SafePathSchema` constraints from `validation/common` (`fetch-app/src/validation/common.ts:98-109`).
- Risk:
  - Destructive delete operations can target paths outside the intended workspace.
  - Potential cross-workspace or broader filesystem deletion if crafted absolute/relative paths are accepted.
- Proposed Change:
  - Normalize and resolve paths before validation (`path.posix.resolve`/equivalent) and enforce strict workspace-root containment with separator boundary checks.
  - Reuse a hardened path schema/helper in `file_delete` and `folder_delete` input validation.
  - Reject absolute paths from tool input unless explicitly required and revalidated.
- Test Coverage Needed:
  - Unit tests for traversal and sibling-prefix bypass attempts (`../`, `/workspace/ws-evil`, mixed separators).
  - Workspace-manager tests proving deletes are blocked outside root and allowed inside root.

### GAP-038: Docker exec timeout returns early without terminating container process
- Severity: S2 High
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/utils/docker.ts`
- Evidence:
  - Timeout path resolves with `124` but does not stop/kill the running exec process (`fetch-app/src/utils/docker.ts:315-319` and timeout path in buffered exec around `fetch-app/src/utils/docker.ts:270-279`).
- Risk:
  - Long-running commands may continue consuming CPU/memory after caller assumes timeout completion.
  - Repeated timeouts can accumulate orphaned work inside Kennel and degrade system stability.
- Proposed Change:
  - Add explicit timeout cancellation behavior (terminate container process/stream session where supported).
  - Mark timed-out executions as terminal and prevent late stream events from mutating result state.
- Test Coverage Needed:
  - Timeout tests that assert cancellation path is invoked.
  - Regression test ensuring no late stdout/stderr updates after timeout result is returned.

### GAP-039: `dockerExecOptions.stdin` is defined but ignored in execution calls
- Severity: S3 Medium
- Priority: P2 Later
- Status: Done
- Area: `fetch-app/src/utils/docker.ts`
- Evidence:
  - `DockerExecOptions` includes `stdin?: boolean` (`fetch-app/src/utils/docker.ts:42`), but both execution paths hardcode `stdin: false` in `exec.start(...)` (`fetch-app/src/utils/docker.ts:200`, `fetch-app/src/utils/docker.ts:322`).
- Risk:
  - API contract and runtime behavior diverge.
  - Callers can incorrectly assume interactive stdin is supported when it is silently disabled.
- Proposed Change:
  - Either wire `options.stdin` through both exec paths (with tests) or remove the option from the public interface.
- Test Coverage Needed:
  - Contract test verifying stdin option behavior (enabled/disabled) matches implementation.

### GAP-040: Transcription command builds shell string with unquoted model path from env
- Severity: S3 Medium
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/transcription/index.ts`
- Evidence:
  - Whisper command interpolates `WHISPER_MODEL` directly into shell string without quoting (`fetch-app/src/transcription/index.ts:62`).
- Risk:
  - Model paths with spaces can fail unexpectedly.
  - If env/config is compromised, shell interpolation risk increases.
- Proposed Change:
  - Execute whisper via argument array/spawn API instead of shell string interpolation.
  - Validate model path existence and format before command execution.
- Test Coverage Needed:
  - Unit tests for model paths with spaces/special characters.
  - Failure-path tests for missing/invalid model path.

### GAP-041: Repo-map file selection order is nondeterministic and can churn prompt context
- Severity: S3 Medium
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/workspace/repo-map.ts`
- Evidence:
  - File list comes directly from `find` output and is consumed as-is (`fetch-app/src/workspace/repo-map.ts:89`, `fetch-app/src/workspace/repo-map.ts:94`).
  - `maxFiles` truncation is applied before any explicit sort, so included files depend on filesystem traversal order.
- Risk:
  - Prompt context can change between runs on the same repo without source changes.
  - Task planning quality can drift because important files may be omitted inconsistently when over `maxFiles`.
- Proposed Change:
  - Normalize ordering before truncation (stable lexical sort, with optional priority for top-level entry files).
  - Add deterministic tie-break rules for large repos.
- Test Coverage Needed:
  - Unit tests proving identical repo-map output for shuffled file discovery input.
  - Truncation tests verifying deterministic file inclusion at `maxFiles` boundary.

### GAP-042: Symbol extractor claims dedupe but returns duplicate symbol entries
- Severity: S3 Medium
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/workspace/symbols.ts`
- Evidence:
  - Implementation comment says "Sort and deduplicate" (`fetch-app/src/workspace/symbols.ts:125`).
  - Returned value only sorts and does not deduplicate (`fetch-app/src/workspace/symbols.ts:126`).
- Risk:
  - Repo-map can include repeated symbol names, reducing signal density in a constrained token budget.
  - Downstream consumers may assume uniqueness and behave inconsistently.
- Proposed Change:
  - Deduplicate by `(name, type)` before return.
  - Optionally populate `line` for deterministic first-seen source location.
- Test Coverage Needed:
  - Unit tests with repeated declarations/exports to verify dedupe behavior.
  - Regression tests ensuring output is sorted and unique.

### GAP-043: Vision analysis path has no input guardrails for MIME type or payload size
- Severity: S2 High
- Priority: P1 Next
- Status: Done
- Area: `fetch-app/src/vision/index.ts`
- Evidence:
  - `analyzeImage` directly interpolates provided `mimeType` and `base64Data` into a `data:` URL (`fetch-app/src/vision/index.ts:66`).
  - There is no MIME allowlist or max payload check before remote API call (`fetch-app/src/vision/index.ts:35-73`).
- Risk:
  - Oversized media can cause expensive failures/timeouts and reduce bridge responsiveness.
  - Invalid/unsupported MIME values can fail late at provider boundary with low-quality user feedback.
- Proposed Change:
  - Add explicit allowed MIME set and payload-size cap prior to request.
  - Return actionable validation errors before invoking OpenRouter.
- Test Coverage Needed:
  - Unit tests for allowed/blocked MIME values.
  - Boundary tests for max payload size and oversize rejection behavior.

### GAP-044: Process entrypoint is hard to test due to import-time side effects and tight `process.exit` coupling
- Severity: S3 Medium
- Priority: P2 Later
- Status: Done
- Area: `fetch-app/src/index.ts`
- Evidence:
  - Startup runs unconditionally on module import (`fetch-app/src/index.ts:121`).
  - Signal/error handlers are registered at module scope (`fetch-app/src/index.ts:105-118`) and terminal paths call `process.exit(...)` directly (`fetch-app/src/index.ts:31`, `fetch-app/src/index.ts:59`, `fetch-app/src/index.ts:97`, `fetch-app/src/index.ts:114`).
- Risk:
  - Bootstrap/shutdown behavior is difficult to unit test without brittle module cache/process stubbing.
  - Higher chance of regressions in shutdown ordering and signal handling.
- Proposed Change:
  - Export `main`/`shutdown` and gate auto-start behind `if (import.meta.url === ...)` style entry check.
  - Wrap exits in injectable terminator helper for deterministic testing.
- Test Coverage Needed:
  - Unit tests for startup failure/success branches without forking process.
  - Signal-handling tests verifying idempotent shutdown and ordered teardown calls.

## Handler/Harness Test Coverage Gaps (2026-02-13)

### Subsystem: `handler`
- Gap:
  - No test verifies timer cleanup on thrown `processMessage` error (`fetch-app/src/handler/index.ts:227-245`).
  - No test asserts stale progress callback does not fire after error response.
- Add:
  - Fake-timer test for throw path and `clearTimeout`/cleanup semantics.
  - Regression test for no duplicate outbound messages after failure.

### Subsystem: `harness/executor` + `task/integration`
- Gap:
  - No tests cover parsed event emission (`harness:progress`, `harness:file_op`, `harness:question`).
  - No tests cover `waiting_input` status transitions and `sendInput` happy path in real flow.
  - No tests validate `task:output` payload shape alignment (`line` field).
- Add:
  - Contract tests for executor event payload schema.
  - Integration tests for question pause/resume loop.
  - End-to-end task test confirming file-op extraction reaches task result fields.

### Subsystem: `harness/spawner` + `harness/pool`
- Gap:
  - No tests for kill-vs-close status race (killed overwritten by failed).
  - No tests for queue behavior under repeated spawn failures.
  - No tests for memory retention/pruning policy (currently absent).
- Add:
  - Deterministic race test around `kill()` and process close.
  - Queue durability tests with alternating success/failure spawns.
  - Retention tests once TTL/cap policy is implemented.

### Subsystem: adapters + parser integration
- Gap:
  - Adapter parsing is tested in isolation, but not validated through executor pipeline.
  - `OutputParser` has tests but is not exercised in live execution path.
- Add:
  - Integration tests that feed harness stdout and assert downstream task events and notifications.
  - Decision test to either remove dead parser path or wire it into runtime flow.

## Identity/Security Test Coverage Gaps (2026-02-13)

### Subsystem: `identity/manager`
- Gap:
  - No direct unit tests for `IdentityManager`.
  - No tests for `buildSystemPrompt()` budget truncation logic.
  - No tests for reload behavior applying `ALPHA.md` context fields.
- Add:
  - Unit tests for prompt assembly sections and token-budget truncation behavior.
  - Reload tests for merging `context.owner` and directive updates.

### Subsystem: `identity/loader`
- Gap:
  - Existing tests read real files only; no focused parser edge-case tests.
  - No tests for malformed markdown sections or partial files.
- Add:
  - Fixture-based parser tests for missing headings, reordered sections, and mixed bullet/table formats.

### Subsystem: `security/whitelist`
- Gap:
  - No unit tests for `WhitelistStore` persistence, lock serialization, or watcher reload behavior.
  - No tests for singleton initialization failure and retry.
- Add:
  - Tests for add/remove/clear persistence and concurrent mutation ordering.
  - Failure injection tests for write/load and init-retry behavior.

### Subsystem: `security/gate`
- Gap:
  - Coverage focuses on happy-path authorization checks.
  - No tests for `isAuthorizedUser()` behavior across owner/trusted/untrusted IDs.
  - No tests for malformed IDs and edge-case group sender formats.
- Add:
  - Contract tests for ID parsing and authorization in direct/group/reaction contexts.

### Subsystem: `security/rateLimiter` + `security/validator`
- Gap:
  - No tests for timer cleanup lifecycle on limiter.
  - Path sanitizer tests do not cover backslash traversal or Windows-style paths.
- Add:
  - Teardown tests for limiter shutdown (after API exists).
  - Extended sanitizer tests for cross-platform path formats.

## Session Test Coverage Gaps (2026-02-13)

### Subsystem: `session/store`
- Gap:
  - No direct tests for `SessionStore` schema/init/CRUD/cleanup against SQLite.
  - No tests for migration behavior when legacy session blobs are missing fields.
  - No tests for malformed JSON rows or memory recall scoring behavior.
- Add:
  - Store integration tests for `init`, `getOrCreate`, `update`, `clear`, `delete`, `cleanup`, `count`, `list`.
  - Corrupt-row and legacy-row fixtures for resilience checks.
  - Memory insert/recall tests including recall count/timestamp updates.

### Subsystem: `session/manager`
- Gap:
  - Existing tests mock store heavily and do not cover store interaction edge cases.
  - No concurrency tests for compaction/write overlap.
  - No tests for singleton init failure/retry behavior.
- Add:
  - Concurrency regression tests around `addUserMessage` + `compactIfNeeded`.
  - Failure/retry tests for `getSessionManager()`.
  - Contract tests for tool-call message pairing (`toolCallId` path).

### Subsystem: `session/types`
- Gap:
  - No tests for ID generation collision characteristics or deterministic test injection strategy.
- Add:
  - Unit tests for `createSession`/`createMessage` defaults and generated field validity.
  - Deterministic ID generation tests once generator injection is introduced.

## Skills/Prompt Test Coverage Gaps (2026-02-13)

### Subsystem: `skills/loader` + `skills/manager`
- Gap:
  - No dedicated unit tests for skill loading, trigger matching, requirement filtering, or summary/context rendering.
  - No hot-reload tests for add/change/delete watcher behavior.
- Add:
  - Unit tests for `loadSkill`, `matchSkills`, `buildSkillsSummary`, and `buildActivatedSkillsContext`.
  - Watcher-driven integration tests for add/change/unlink lifecycle and requirement transitions.

### Subsystem: `identity/manager` skill-injection path
- Gap:
  - No tests assert activated skills are injected into system prompt before tool-use guidance.
  - No tests for skill-priority text behavior with/without activated skills.
- Add:
  - Prompt assembly tests for both no-skill and activated-skill cases, including ordering assertions.
  - Regression tests for context-budget truncation with large activated skill bodies.

### Subsystem: shutdown lifecycle for prompt/skills infrastructure
- Gap:
  - No tests confirm watcher teardown for skills/identity/tools during graceful shutdown.
- Add:
  - Teardown integration tests covering shutdown ordering and idempotency for watcher-bearing modules.

## Task Test Coverage Gaps (2026-02-13)

### Subsystem: `task/integration`
- Gap:
  - No direct unit tests for `TaskIntegration` execution lifecycle, event forwarding, or error handling.
  - No tests for concurrent terminal-state races (cancel vs fail completion paths).
- Add:
  - Unit tests for `executeTask()` success/failure/start/question/completion event behavior.
  - Race-condition tests for cancellation during execution.

### Subsystem: `task/store`
- Gap:
  - No direct tests for SQLite init/save/load/current-task metadata behavior.
  - No resilience tests for corrupt task rows.
- Add:
  - Store integration tests for `init`, `saveTask`, `loadAllTasks`, `saveCurrentTaskId`, `loadCurrentTaskId`, and `close`.
  - Corrupt-row recovery tests for `loadAllTasks`.

## Tools Test Coverage Gaps (2026-02-13)

### Subsystem: `tools/github`
- Gap:
  - No dedicated unit tests for GitHub tool handlers (`github_pr_*`, `github_issue_*`, `github_branch_create`, `github_action_status`, `github_search_repos`).
  - No tests for workspace-resolution failure path (`no workspace + no active workspace`).
- Add:
  - Unit tests with mocked `workspaceManager` for success/failure paths across all GitHub handlers.
  - Contract tests for output summaries and metadata shape.

### Subsystem: `tools/interaction`
- Gap:
  - No direct tests for `ask_user` auto-approval behavior across autonomy levels.
  - No tests for `report_progress` state guards (terminal task states) and metadata output.
- Add:
  - Unit tests for `supervised` vs `cautious`/`autonomous` confirmation handling.
  - Task-state tests covering running/waiting/completed/failed/cancelled branches.

### Subsystem: `tools/loader` + custom-tool watcher flow
- Gap:
  - No tests for malformed custom tool definitions and schema-build failure handling.
  - No tests for rename/reload behavior and unload cleanup correctness.
- Add:
  - Loader tests for invalid JSON, invalid parameter shapes, and rejection paths.
  - Registry watcher tests for add/change/unlink, including rename-with-same-file scenario.

### Subsystem: `tools/browser` schema contracts
- Gap:
  - Existing tests cover happy-path invocation and docker errors, but not action-specific argument dependency validation at schema level.
- Add:
  - Validation tests for `browser_action` requiring `ref`/`text` based on action.
  - Regression tests confirming invalid payloads fail before `dockerExec` invocation.

### Subsystem: `tools/web` SSRF controls
- Gap:
  - Tests cover literal private IP hostnames, but not hostname-to-private-IP resolution or redirect-to-private destination.
- Add:
  - SSRF hardening tests for DNS-resolved internal targets.
  - Redirect validation tests for public URL -> private URL chains.

## Transcription/Utils/Validation Test Coverage Gaps (2026-02-14)

### Subsystem: `transcription/index`
- Gap:
  - No direct unit tests for WAV conversion failure, whisper timeout, missing output file, or cleanup behavior.
  - No tests for `isTranscriptionAvailable()` availability checks.
- Add:
  - Mocked process/FS tests for success + failure paths and guaranteed temp-file cleanup.
  - Availability tests for missing binary/model combinations.

### Subsystem: `utils/docker`
- Gap:
  - No direct tests for timeout semantics, stream error handling, or post-timeout event suppression.
  - No tests for `stdin` option contract.
- Add:
  - Unit tests for buffered and streamed exec timeout behavior.
  - Contract tests for option passthrough (`cwd`, `env`, `user`, `stdin`).

### Subsystem: `utils/version` and `utils/logger`
- Gap:
  - No focused tests for version-source precedence/caching behavior.
  - Logger behavior (LOG_LEVEL gating + data formatting) is only indirectly exercised via mocks.
- Add:
  - Version utility tests for `VERSION` file, package fallback, and unknown fallback behavior.
  - Logger tests for level filtering and payload formatting (short JSON vs expanded output).

### Subsystem: `validation/common` + `validation/tools`
- Gap:
  - No dedicated schema contract tests for destructive-path inputs and cross-schema consistency.
  - No tests asserting all destructive tools enforce hardened path constraints.
- Add:
  - Schema tests for accepted/rejected path samples (relative, absolute, traversal, mixed separators).
  - Regression tests tying `file_delete`/`folder_delete` schemas to shared safe-path validation rules.

## Vision/Workspace Bootstrap Test Coverage Gaps (2026-02-14)

### Subsystem: `workspace/repo-map`
- Gap:
  - No direct unit tests for repo-map generation, stable ordering, truncation, and error fallback text.
  - No tests covering extension filtering by `projectType` with mixed-language repos.
- Add:
  - Unit tests for deterministic output ordering and `maxOutputChars` truncation semantics.
  - Contract tests for `projectType` extension selection and exclude-path behavior.

### Subsystem: `workspace/symbols`
- Gap:
  - No dedicated tests for symbol extraction coverage across supported languages.
  - No tests for duplicate symbol handling or unsupported-extension behavior.
- Add:
  - Fixture-based tests per language pattern with expected symbol set.
  - Regression tests for sort order, dedupe semantics, and unknown extension empty output.

### Subsystem: `vision/index`
- Gap:
  - No unit tests for successful OpenRouter response parsing and fallback `"No analysis available."` behavior.
  - No tests for missing API key, provider exceptions, or validation-rejection branches.
- Add:
  - Mocked OpenAI client tests for success/error paths.
  - Validation tests for MIME/payload guardrails once added.

### Subsystem: `src/index.ts` bootstrap/shutdown lifecycle
- Gap:
  - No direct tests for startup sequencing (`validateEnv` -> status API -> skill init -> bridge init).
  - No tests for shutdown idempotency and signal-handler behavior.
- Add:
  - Entry-point tests with mocked dependencies for success/failure startup paths.
  - Shutdown tests verifying killAll/bridge destroy/store close ordering and single-run guard.

## Prioritized TODO

### P0 Now
- [x] Fix GAP-001: enforce explicit `cwd` + repo validation for git undo path.
- [x] Fix GAP-002: normalize version prefix handling to prevent `vv` output.
- [x] Fix GAP-003: move timer cleanup to `finally` and guard post-error progress send.
- [x] Fix GAP-007: emit parsed harness events and implement `waiting_input` transitions.
- [x] Fix GAP-008: align executor/integration output event payload schema.
- [x] Fix GAP-037: harden delete-path validation with normalized workspace-root containment.
- [x] Add tests for GAP-001/002/003/007/008/037.

### P1 Next
- [x] Fix GAP-004: unify session-id grammar/validation across status routes.
- [x] Fix GAP-006: strict validation for runtime config updates.
- [x] Fix GAP-009: prevent killed->failed status overwrite race.
- [x] Fix GAP-011: harden log redaction matching to case-insensitive.
- [x] Fix GAP-012: merge identity context fields during reload.
- [x] Fix GAP-013: make whitelist persist lock recover after write failures.
- [x] Fix GAP-014: make whitelist singleton initialization retry-safe.
- [x] Fix GAP-018: add per-session compaction write coordination.
- [x] Fix GAP-019: make session manager singleton initialization retry-safe.
- [x] Fix GAP-023: keep skills summary and requirement-gated activation consistent.
- [x] Fix GAP-024: remove/disable stale skills when reload requirements are unmet.
- [x] Fix GAP-025: escape or reformat activated skill blocks to prevent prompt-structure breakage.
- [x] Fix GAP-028: unify task auto-agent selection behavior across manager/integration.
- [x] Fix GAP-029: harden integration catch path against secondary failTask transition errors.
- [x] Fix GAP-031: make task-store initialization failure observable (or fail fast by policy).
- [x] Fix GAP-032: remove stale custom tools when file-backed names change.
- [x] Fix GAP-033: enforce strict custom-tool definition validation and guarded watcher reload.
- [x] Fix GAP-034: enforce action-specific required fields in `browser_action` schema.
- [x] Fix GAP-035: harden `web_fetch` against hostname-resolved and redirect-based SSRF.
- [x] Fix GAP-036: derive ambiguous agent choices from runtime enabled agents.
- [x] Fix GAP-038: enforce real process cancellation on docker timeout paths.
- [x] Fix GAP-040: move transcription command execution to argument-safe spawn flow.
- [x] Fix GAP-041: make repo-map file selection deterministic before truncation.
- [x] Fix GAP-042: enforce symbol dedupe contract in extractor output.
- [x] Fix GAP-043: add MIME/payload guardrails on vision analysis input.
- [x] Add tests for session-id compatibility, config validation, kill-race, redaction, identity/whitelist recovery, and session compaction/init retry paths.
- [x] Add missing unit coverage for `tools/github`, `tools/interaction`, and custom-tool reload lifecycle.
- [x] Add unit coverage for transcription, docker utility timeout semantics, and validation schema contracts.
- [x] Add direct unit coverage for `workspace/repo-map`, `workspace/symbols`, and `vision/index`.

### P2 Later
- [x] Fix GAP-005: session-scoped anti-repeat cache with TTL.
- [x] Fix GAP-010: add retention policy for harness instance/execution maps.
- [x] Fix GAP-015: add deterministic readiness contract for identity manager.
- [x] Fix GAP-016: harden path sanitizer for backslash/Windows path traversal forms.
- [x] Fix GAP-017: add explicit security subsystem teardown (`whitelist` watcher, `rateLimiter` timer).
- [x] Fix GAP-020: guard session JSON deserialization against corrupt rows.
- [x] Fix GAP-021: improve session store singleton path/test isolation semantics.
- [x] Fix GAP-022: centralize/inject session ID generator for deterministic testing.
- [x] Fix GAP-026: add full watcher teardown in global shutdown path.
- [x] Fix GAP-027: enforce or remove `disabledSkills` config.
- [x] Fix GAP-030: guard task-row JSON deserialization against malformed rows.
- [x] Fix GAP-039: implement or remove `stdin` option in docker utility APIs.
- [x] Fix GAP-044: decouple index entrypoint side effects from import for deterministic testing.
- [x] Add telemetry for notification path selection/fallback rates.
- [x] Add bounded micro-rewriter flag and rollback-safe fallback path.

## Later Improvements

- Add structured metrics for:
  - template vs LLM notification path usage,
  - fallback rate,
  - rewrite timeout rate,
  - duplicate suppression hits.
- Add architecture note for message formatting pipeline:
  - factual base generation,
  - optional bounded rewrite,
  - fallback chain.

## Acceptance Checklist

- [x] All P0 items merged.
- [ ] All P0 tests passing in CI.
- [x] Relevant README/docs updated for behavior changes.
- [x] No regression in command parsing and status API integration tests.
- [x] Backlog reviewed and reprioritized after P0 completion.
