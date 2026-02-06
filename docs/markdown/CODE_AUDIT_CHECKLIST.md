# Code Audit Status

Last audited: v3.3.0

## Source Modules

| Module | Files | Status | Notes |
|--------|-------|--------|-------|
| `config/` | env.ts, paths.ts | ✅ Clean | Zod-validated Proxy env, centralized paths |
| `agent/` | core.ts, intent.ts, format.ts, prompts.ts | ✅ Clean | 3 intents (conversation/inquiry/action), single formatting point |
| `bridge/` | client.ts | ✅ Clean | Reconnection with exponential backoff, O(1) message dedup |
| `commands/` | parser.ts, task.ts, context.ts, project.ts, settings.ts, identity-commands.ts, types.ts, index.ts | ✅ Clean | Router + 5 handler modules (~240 + ~730 lines) |
| `handler/` | index.ts | ✅ Clean | Single entry point, WhatsApp formatting |
| `harness/` | base.ts, claude.ts, gemini.ts, copilot.ts, registry.ts, executor.ts, spawner.ts | ✅ Clean | AbstractHarnessAdapter base, single registry |
| `identity/` | manager.ts, loader.ts, types.ts | ✅ Clean | Hot-reload, pack profiles, skill activation context |
| `instincts/` | *.ts | ✅ Clean | Individual handler files |
| `modes/` | handlers/*.ts, manager.ts | ✅ Clean | State machine, `_` prefix on unused params |
| `proactive/` | commands.ts, watcher.ts, index.ts, scheduler.ts | ✅ Clean | /remind + /schedule + /cron wired, watcher EventEmitter |
| `security/` | gate.ts, rateLimiter.ts, validator.ts, whitelist.ts, index.ts | ✅ Clean | Sliding window rate limiter, 41 tests |
| `session/` | manager.ts, store.ts, project.ts, types.ts | ✅ Clean | Delegates task ops to TaskManager |
| `skills/` | manager.ts | ✅ Clean | Discovery + activation pattern |
| `task/` | manager.ts, store.ts, scheduler.ts, types.ts, integration.ts, index.ts | ✅ Clean | Single source of truth, one-shot support, store.close() |
| `tools/` | registry.ts, workspace.ts, task.ts, interaction.ts | ✅ Clean | 11 tools with Zod schemas |
| `conversation/` | summarizer.ts | ✅ Clean | |
| `transcription/` | index.ts | ✅ Clean | Checks binary + model existence |
| `vision/` | index.ts | ✅ Clean | |
| `workspace/` | manager.ts, repo-map.ts, symbols.ts, types.ts | ✅ Clean | |
| `utils/` | logger.ts, id.ts, docker.ts | ✅ Clean | LOG_LEVEL filtering |
| `validation/` | common.ts, tools.ts | ✅ Clean | |
| `api/` | status.ts | ✅ Clean | Bearer token auth on /api/logout |

## Deleted Files (cumulative through v3.3.0)

| File | Version Removed | Reason |
|------|----------------|--------|
| `memory/` (3 files) | v3.1.1 | No memory system exists |
| `retrieval/` (6 files) | v3.1.1 | No retrieval system exists |
| `executor/docker.ts` | v3.1.1 | Dead module |
| `utils/stream.ts` | v3.1.1 | Zero imports |
| `utils/sanitize.ts` | v3.1.1 | Zero imports |
| 7 dead `index.ts` barrels | v3.1.1 | Zero importers |
| `task/queue.ts` | v3.3.0 | Redundant with TaskManager |
| `tests/e2e/` | v3.3.0 | Renamed to tests/integration/ |

## Test Coverage

| Directory | Files | Tests |
|-----------|-------|-------|
| `tests/unit/` | 6 files | ~80 tests |
| `tests/integration/` | 7 files | ~97 tests |
| **Total** | **13 files** | **177 tests** |

## Compiler Strictness

- `noUnusedLocals`: ✅ enabled
- `noUnusedParameters`: ✅ enabled
- `strict`: ✅ enabled
- `tsc --noEmit`: 0 errors
