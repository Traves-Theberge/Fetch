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

### 2. Adapters (`harness/adapters/*.ts`)

Each tool has an adapter that defines:

* **Command**: The binary to run (`claude`, `gemini`, `gh`).
* **Args**: Flags for non-interactive mode (`--print`, `--no-interaction`).
* **Parser**: Transforming raw stdout/stderr into structured `HarnessResult`.

## Available Harnesses

| Harness | CLI | Best For |
|---------|-----|----------|
| **Claude Code** | `claude` | Deep refactoring, multi-file edits, architectural analysis. |
| **Gemini CLI** | `gemini` | Quick fixes, explanations, boilerplate generation. |
| **Copilot CLI** | `gh copilot` | Shell commands, git workflows, explanations. |

## Docker Isolation

<!-- DIAGRAM:docker -->

All harnesses run inside the `fetch-kennel` container, which has:

* **Read-Write** access to the workspace (`./workspace`).
* **Read-Only** access to config (`~/.config/claude-code`, variable volumes).
* **No access** to the host system outside mounted volumes.
