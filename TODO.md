# Fetch v4.3.0 — Gap Fix Checklist

> 55 issues found via full codebase audit. All 50 code fixes verified and complete. 5 test coverage items deferred.
>
> **Final audit (2025-02-11):** Every checked item independently verified against source code. 3 partial implementations caught and fixed during audit.

## Cluster 1: Shell Injection in workspace/manager.ts

- [x] **#1 CRITICAL** — Quote all `${path}` variables in `sh -c` commands (10+ locations)
- [x] **#2 CRITICAL** — Fix sed injection: replace sed-based JSON editing with safer approach
- [x] **#32 MEDIUM** — Fix `echo '${content}'` writing literal `\n` — use heredoc `cat <<`
- [x] **#33 MEDIUM** — Add length guard for git status line parsing (`line.length < 3`)
- [x] **#34 MEDIUM** — Improve detached HEAD detection (`rev-parse --short HEAD` fallback)
- [x] **#22 HIGH** — Don't assume `origin/main` — detect actual default branch name
- [x] **#31 MEDIUM** — Add graceful handling on GitHub repo creation failure during workspace create

## Cluster 2: Spawner Process Lifecycle

- [x] **#3 CRITICAL** — Store timeout IDs and `clearTimeout` on process completion
- [x] **#4 CRITICAL** — Remove stdout/stderr listeners in close handler
- [x] **#5 CRITICAL** — Namespace event listeners per execution to prevent cross-fire (`settled` flag)
- [x] **#6 CRITICAL** — Fix timeout/close race condition with timer-map guards
- [x] **#50 LOW** — Remove redundant `.set()` after direct property assignment in close handler

## Cluster 3: Singleton & Concurrency Races

- [x] **#7 CRITICAL** — Add promise-lock to `getSessionManager()` singleton init
- [x] **#14 HIGH** — Add mutex to `TaskManager.createTask()` check
- [x] **#15 HIGH** — Add mutex to whitelist `add()`/`remove()` persistence (`persistLock` chain)
- [x] **#16 HIGH** — Extract shared `prune()` method for rate limiter consistency
- [x] **#27 MEDIUM** — Document circuit breaker thread-safety under Node.js single-threaded model

## Cluster 4: Watcher & Loader Resilience

- [x] **#8 CRITICAL** — Add `.on('error')` handler to chokidar watchers (identity + skills)
- [x] **#9 CRITICAL** — Convert `IdentityLoader.load()` to async with `fs.promises`
- [x] **#30 MEDIUM** — Replace `console.warn`/`console.error` with structured logger in loader
- [x] **#47 LOW** — Add `shutdown()` to close watcher file descriptors in registry

## Cluster 5: Docker Hardening

- [x] **#11 CRITICAL** — Add `HEALTHCHECK` to fetch-bridge and fetch-kennel in Dockerfile/compose
- [x] **#24 HIGH** — Add memory/CPU resource limits to all containers (bridge, kennel, searxng)
- [x] **#42 MEDIUM** — Add log rotation config to all docker-compose services (bridge, kennel, searxng)

## Cluster 6: Handler & Agent Core

- [x] **#10 CRITICAL** — Add `.catch()` to async setTimeout callback in handler
- [x] **#13 HIGH** — Validate empty/whitespace messages before LLM processing
- [x] **#26 MEDIUM** — Validate required fields after JSON.parse in tool call state sync
- [x] **#28 MEDIUM** — Add `.catch()` to unhandled async promise in task event handler
- [x] **#46 LOW** — Clarify context simplification on retry (comment updated)
- [x] **#43 LOW** — Use word boundaries for capability trigger matching in parser

## Cluster 7: Task & Pool System

- [x] **#17 HIGH** — Remove or wire up unused AbortController in task integration
- [x] **#18 HIGH** — Add try/catch around ALL store save operations in TaskManager (all 8 methods)
- [x] **#19 HIGH** — Wrap recursive `processQueue()` in pool catch block
- [x] **#20 HIGH** — Make task cleanup defensive (try-finally per cleanup op)
- [x] **#51 LOW** — Validate non-empty task goal before creation
- [x] **#52 LOW** — Extract `isActiveStatus()` helper for status comparisons
- [x] **#53 LOW** — Remove stale TODO for `filesModified` parsing (documented current state)

## Cluster 8: Tool System

- [x] **#21 HIGH** — Validate workspace exists after ID retrieval in tool handlers
- [x] **#23 HIGH** — Make browser timeout configurable via pipeline (`FETCH_BROWSER_TIMEOUT`)
- [x] **#35 MEDIUM** — Cap shell handler output size in `createShellHandler()` (100KB)
- [x] **#36 MEDIUM** — Verify tool error response format is consistent (already correct)
- [x] **#48 LOW** — Implement `unloadCustomTool()` with file→name tracking
- [x] **#55 LOW** — Repo map already returns truncation metadata in output

## Cluster 9: Harness Adapters & Config

- [x] **#37 MEDIUM** — Extract `fetch-kennel` container name to shared `KENNEL_CONTAINER` constant (types.ts + utils/docker.ts)
- [x] **#38 MEDIUM** — Validate workspace path exists before spawning harness
- [x] **#39 MEDIUM** — Add platform-aware error code mapping (timeout string matching)
- [x] **#40 MEDIUM** — Add `shutdown()` method to EventEmitter subclasses (spawner, pool, executor, integration)
- [x] **#49 LOW** — Populate `HarnessExecution.pid`/`exitCode` fields

## Cluster 10: Session & Security

- [x] **#29 MEDIUM** — Track consecutive compaction failures and escalate after 3
- [x] **#44 LOW** — Only mutate session after confirmed DB write in `/clear`

## Cluster 11: Config & Cleanup

- [x] **#25 HIGH** — Document `ANTHROPIC_API_KEY` in `.env.example`
- [x] **#45 LOW** — Centralize version string (single `VERSION` constant in config/env.ts)
- [x] **#54 LOW** — Implement emoji reaction approval/rejection in bridge client

## Cluster 12: Test Coverage (deferred)

- [ ] **#12 CRITICAL** — Add tests for handler, bridge, agent/core
- [ ] **#12b** — Add tests for browser, github, interaction, task, workspace tools
- [ ] **#12c** — Add tests for session/task store persistence
- [ ] **#12d** — Add tests for API status endpoints
- [ ] **#41 MEDIUM** — Add Vitest coverage thresholds
