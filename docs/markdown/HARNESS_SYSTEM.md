# Harness System

> "The Pack" consists of specialized AI CLIs running inside the **Kennel** sandbox (Docker). The Orchestrator delegates complex tasks to these harnesses when simple file edits or tool calls aren't enough.

<!-- DIAGRAM:harness -->

## Core Components

The Harness System bridges the gap between the TypeScript-based Orchestrator (Bridge) and Python/Go/Rust CLIs running in an isolated environment.

### 1. Spawner (`harness/spawner.ts`)

Wraps every command in `docker exec`:

```typescript
// Conceptual
spawn('claude', args) ->
  docker exec -w /workspace/project fetch-kennel claude ...args
```

### 2. Adapters (`harness/*.ts`)

Each harness has an adapter in the `src/harness/` directory that extends `AbstractHarnessAdapter` (`base.ts`). The adapter defines:

* **Command**: The binary to run (`claude`, `gemini`, `gh`, `opencode`, `codex`).
* **Args**: Flags for non-interactive mode (`--print`, `--no-interaction`).
* **Parser**: Transforming raw stdout/stderr into structured `HarnessResult`.

**Adapter files:** `claude.ts`, `gemini.ts`, `copilot.ts`, `opencode.ts`, `codex.ts` — all extend `base.ts`.

**Supporting modules:**
* `registry.ts` — Maps harness names to adapter instances (single source of truth)
* `executor.ts` — Manages task execution lifecycle through the pool/spawner
* `spawner.ts` — Creates and manages child processes with `docker exec` wrapping
* `pool.ts` — Concurrency management (max 1, aligned with TaskManager)
* `output-parser.ts` — Parses harness CLI stdout/stderr into structured events
* `types.ts` — `HarnessConfig`, `ErrorCategory`, `HarnessResult` interfaces

## Available Harnesses

| Harness | CLI | Best For | CLI Config Injection |
|---------|-----|----------|---------------------|
| **Claude Code** | `claude` | Deep refactoring, multi-file edits, architectural analysis. | `--append-system-prompt /app/data/cli-configs/CLAUDE.md` |
| **Gemini CLI** | `gemini` | Quick fixes, explanations, boilerplate generation. | `GEMINI_SYSTEM_MD` env var |
| **Copilot CLI** | `gh copilot` | Shell commands, git workflows, explanations. | `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` env var |
| **OpenCode** | `opencode` | Versatile coding, OpenRouter-native, general-purpose. | `OPENCODE_SYSTEM_PROMPT` env var |
| **Codex** | `codex` | Agentic coding with OpenAI models, JSON Lines streaming. | `--cd` flag sets working directory |

Each adapter's `buildConfig()` injects the CLI config file from `data/cli-configs/` so harnesses receive Fetch-specific behavioral instructions (e.g., no commits, structured output summaries).

### Project Context Injection

When a `ProjectProfile` is available, all adapters append a `--- Project Context ---` section to the task goal with language, framework, test/build commands, and entry points. This gives the harness CLI awareness of the project's toolchain without requiring it to discover this information itself.

## Hybrid LLM Notifications

Task completion and failure events are formatted by `agent/notifications.ts` using a cheap LLM call (configurable via `FETCH_NOTIFICATION_MODEL`) with the identity voice tone injected. Started and progress events use expanded template pools (8-12 variations). LLM failures fall back to templates.

## Error Classification

When a harness process fails, the executor classifies the error into one of six categories:

| Category | Detection |
|----------|-----------|
| `timeout` | Process killed or exit code 124/137 |
| `network` | stderr contains ECONNREFUSED, ENOTFOUND, etc. |
| `permission` | stderr contains "permission denied" or EACCES |
| `syntax` | stderr contains SyntaxError, TypeError, etc. |
| `process` | Non-zero exit code (generic) |
| `unknown` | Default fallback |

The `errorCategory` field on `HarnessResult` enables downstream systems to decide on retry strategy.

## Concurrency

The `HarnessPool` defaults to `maxConcurrent: 1`, aligned with `TaskManager`'s single-task-at-a-time model. Requests that arrive while a task is running are queued and processed in order.

## Docker Isolation

<!-- DIAGRAM:docker -->

All harnesses run inside the `fetch-kennel` container, which has:

* **Read-Write** access to the workspace (`./workspace`).
* **Read-Only** access to config (`~/.config/claude-code`, variable volumes).
* **No access** to the host system outside mounted volumes.
