# Context Pipeline

## Implementation References

- Context assembly: `apps/bridge/src/session/manager.ts`, `apps/bridge/src/session/store.ts`.
- Repo/project context: `apps/bridge/src/workspace/profiler.ts`, `apps/bridge/src/workspace/repo-map.ts`, `apps/bridge/src/workspace/symbols.ts`.
- Pipeline tuning source: `apps/bridge/src/config/pipeline.ts`.
- Validation tests: `apps/bridge/tests/unit/context-pipeline.test.ts`, `apps/bridge/tests/unit/project-profiler.test.ts`, `apps/bridge/tests/unit/repo-map.test.ts`.

> Fetch's memory system — how conversations persist across turns, how old context is compressed, and how tool call history stays visible to the LLM without leaking raw data to WhatsApp.

```mermaid
flowchart TD
    User([User Message]) -->|WhatsApp| Bridge[Fetch Bridge]
    
    subgraph "Context Assembly"
        Slide[Sliding Window]
        Compact[Compaction Engine]
        Repo[Repo Context]
    end
    
    Bridge -->|Retrieve History| Slide
    Slide -->|Overflow?| Compact
    Compact -->|Summary| SystemPrompt
    Repo -->|File Tree| SystemPrompt
    
    SystemPrompt --> LLM{Orchestrator LLM}
    Slide --> LLM
    
    LLM -->|Tool Call| Tools[Tool Execution]
    LLM -->|Response| User
    Tools -->|Result| LLM
```

## Overview

The Context Pipeline solves a core problem in conversational AI: **multi-turn memory**. Without it, every message is a blank slate.

The pipeline applies six layers of runtime/context memory:

1. **Sliding Window**: Last 20 messages (configurable) in full OpenAI format.
2. **Compaction**: Older messages are summarized into a chained system prompt section. Previous summaries are preserved as structured memory entries.
3. **Structured Memory**: Key facts, preferences, and decisions stored in a `memory` table with BM25-style keyword recall and OpenAI vector embeddings (cosine similarity). Recalled entries are injected into the system prompt.
4. **Short-Term Summary**: Last-turn continuity summary stored in `session.metadata.agentRuntime.shortTermSummary`.
5. **Durable Notes**: Stable preferences/decisions in `session.metadata.agentRuntime.durableNotes`.
6. **Repo Map**: Current file structure and git status (capped at 3000 chars by default, configurable via `maxOutputChars`).

## Project Intelligence

Fetch automatically detects the project type when a workspace is selected, then runs a **project profiler** (`workspace/profiler.ts`) to enrich the detection with framework, package manager, test runner, entry points, and build/test commands.

### Supported Auto-Detection

- **Node.js** (`package.json`)
- **TypeScript** (`tsconfig.json`)
- **Python** (`requirements.txt`, `pyproject.toml`)
- **Rust** (`Cargo.toml`)
- **Go** (`go.mod`)
- **Java** (`pom.xml`, `build.gradle`)
- **Ruby** (`Gemfile`)
- **PHP** (`composer.json`)
- **DotNet** (`*.csproj`)

### Project Profiling

After type detection, the profiler builds a `ProjectProfile` with:

| Field | Detection Method | Example |
|-------|-----------------|---------|
| `framework` | Indicator files + manifest deps | `nextjs`, `express`, `django`, `fastapi`, `laravel` |
| `packageManager` | Lock file detection | `pnpm`, `yarn`, `poetry`, `cargo`, `bundler` |
| `testRunner` | Dev dependency detection | `vitest`, `pytest`, `go test`, `cargo test`, `maven` |
| `entryPoints` | Per-type candidate list (capped at 3) | `src/index.ts`, `main.py`, `src/main.rs` |
| `buildCommand` | Manifest scripts or type defaults | `npm run build`, `cargo build`, `go build` |
| `testCommand` | Derived from test runner | `npx vitest run`, `pytest`, `go test ./...` |
| `description` | Manifest description field | From package.json, Cargo.toml, pyproject.toml, go.mod |

The profile is injected into the system prompt as a structured workspace context block and passed to harness adapters for task delegation.

### Narrative Tool Outputs

All tool handlers produce human-readable narrative text as their `output` field (consumed by the LLM) with full structured data in the `metadata` field (used for session state sync). This replaces the previous `JSON.stringify()` approach and improves LLM reasoning quality.

## Memory Lifecycle

The context pipeline handles message persistence and compaction automatically:

1. **Incoming Message**: Added to `sqlite` immediately.
2. **Context Construction**:
    - Fetch retrieves the last N messages (Sliding Window).
    - If total tokens > limit, older messages are compacted.
    - System prompt is assembled with "The Pack" tools and Identity.

### Compaction Engine

When the conversation exceeds `FETCH_COMPACTION_THRESHOLD` (default 40), the engine:

1. Saves the previous compaction summary as a structured memory entry (category: `compaction_summary`).
2. Takes all messages *outside* the sliding window.
3. Feeds them to a cheaper model (e.g. GPT-4o-mini) along with the previous summary for continuity.
4. Generates a bulleted summary with chained context.
5. Injects this summary into the `system` message.

Additionally, tool results exceeding `FETCH_TOOL_RESULT_MAX_PERSIST` (default 2000 chars) are compressed before persisting to session history, preventing large outputs (e.g. GitHub PR content, web fetches) from bloating the context.

This allows conversations to go on for hundreds of turns without overflowing the context window or racking up huge token costs.
