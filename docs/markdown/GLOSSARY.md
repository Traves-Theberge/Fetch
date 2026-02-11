# Glossary

## Core Concepts

| Term | Definition |
|------|-----------|
| **Fetch** | The orchestrator system. Receives WhatsApp messages, runs them through the LLM with full tool access, delegates coding to AI harnesses, reports results. |
| **Alpha** | The owner/operator. The person whose phone number is set as `OWNER_PHONE_NUMBER`. Has full control. |
| **The Pack** | Collective name for the three AI harness agents (Claude, Gemini, Copilot). |
| **LLM-First Architecture** | Design where every message (except 5 safety escapes) takes the same single path through the LLM with all 21 tools. No intent classification or conversation/action split. |

## Infrastructure

| Term | Definition |
|------|-----------|
| **Bridge** | The Node.js application running in Docker. Handles WhatsApp, security, agent core, tools. Has the Docker CLI installed to control the Kennel. |
| **Kennel** | The Ubuntu Docker container where AI CLIs execute. Sandboxed with mounted workspace. Uses a custom entrypoint for GitHub auth. |
| **Manager** | The Go TUI (Bubble Tea) that runs on the host machine. Controls Docker, edits config, views logs. |
| **Workspace** | The `/workspace` directory mounted into both containers. Contains all project code. |

## Identity System

| Term | Definition |
|------|-----------|
| **Collar** | `data/identity/COLLAR.md` — Core system instructions defining Fetch's personality and behavioral rules. |
| **Alpha File** | `data/identity/ALPHA.md` — Owner information (preferences, timezone, technical level). |
| **Pack Member** | A `PackMember` struct parsed from `data/agents/*.md`. Defines a harness's name, triggers, role, and routing priority. |
| **Identity Manager** | Singleton that builds the system prompt from identity files. Watches for changes and hot-reloads. |

## Processing

| Term | Definition |
|------|-----------|
| **Safety Gate** | The 5 deterministic escape commands (`/stop`, `/undo`, `/clear`, `/help`, `/status`) that bypass the LLM. Must work even when the LLM is unreachable. |
| **Safety Escape** | A single command handled by the safety gate. Responds immediately without an LLM call (<5ms). |
| **Skill** | A Markdown file in `data/skills/` that injects domain-specific instructions when triggers match. |

## Harness System

| Term | Definition |
|------|-----------|
| **Harness** | An adapter that wraps an AI CLI (Claude Code, Gemini, Copilot) for use by the orchestrator. |
| **AbstractHarnessAdapter** | Base class providing shared logic: `formatGoal()`, `isQuestion()`, `extractSummary()`, `extractFileOperations()`. |
| **Container Field** | The `container` property on `HarnessConfig` (e.g. `'fetch-kennel'`). When set, the spawner wraps commands with `docker exec`. |
| **Registry** | `HarnessRegistry` — Maps harness names to adapter instances. Single source of truth. |
| **Executor** | `HarnessExecutor` — Manages task execution lifecycle through the pool/spawner. |
| **Spawner** | `HarnessSpawner` — Creates and manages child processes. Wraps with `docker exec -w <cwd> <container> <command>` when the adapter specifies a container. |
| **Pool** | Process pool for managing concurrent harness instances (max 2 parallel agents). |

## Data & Persistence

| Term | Definition |
|------|-----------|
| **WAL Mode** | SQLite Write-Ahead Logging. Allows concurrent reads during writes without locking. |
| **Session** | A conversation context. Contains messages, preferences, active project, and active task reference. |
| **Thread** | A named conversation branch within a session. Allows context switching. |
| **Task** | A coding job with lifecycle: pending → running → completed/failed/cancelled. Persisted to tasks.db. |
| **CronJob** | A scheduled job. Can be recurring (cron expression) or one-shot (auto-deleted after execution). |

## Security

| Term | Definition |
|------|-----------|
| **Security Gate** | Entry point for message authorization. Checks trigger, phone whitelist, rate limit, input validity. |
| **@fetch Trigger** | Required prefix for all WhatsApp messages (except in direct 1:1 chats). |
| **Whitelist** | List of trusted phone numbers stored in `data/whitelist.json`. Owner is always trusted. |
| **Sliding Window** | Rate limiter algorithm using per-key timestamp arrays. Precise per-second granularity. |

## External Services

| Term | Definition |
|------|-----------|
| **OpenRouter** | API gateway for LLM access. Fetch uses it via the OpenAI SDK for agent reasoning, summarization, and vision. |
| **ReAct Loop** | Reason + Act pattern. LLM decides → calls tool → observes result → repeats until done. |
| **whisper.cpp** | C++ implementation of OpenAI Whisper. Used for voice note transcription inside the Bridge container. |

## Tools

| Term | Definition |
|------|-----------|
| **Orchestrator Tool** | One of 21 tools the LLM can call during the ReAct loop: 7 workspace tools (`workspace_list`, `workspace_select`, `workspace_status`, `workspace_create`, `workspace_delete`, `workspace_sync`, `workspace_publish`), 4 task tools (`task_create`, `task_status`, `task_cancel`, `task_respond`), and 2 interaction tools (`ask_user`, `report_progress`). |
| **workspace_sync** | Tool that commits local changes and pushes to GitHub. Auto-generates commit messages from diffs. |
| **Custom Tool** | A user-defined tool in `data/tools/` (JSON). Wraps a shell command with parameters. |

## Key Concepts

| Term | Definition |
|------|------------|
| **Autonomy Guard** | Pattern-matching interceptor on the `ask_user` tool. Auto-approves unnecessary confirmation questions ("Shall I?", "Would you like?") in non-supervised modes. The LLM believes the user said "Yes, proceed." |
| **Dynamic Prompt Rebuild** | After state-changing tool calls (`workspace_select`, `workspace_create`, `task_create`), the system prompt at `messages[0]` is replaced with a fresh build reflecting current project/git/task state. |
| **Autonomy Rules** | 7 highest-priority directives in the system prompt that enforce agentic behavior: act first, summarize after, never ask unnecessary questions. |
| **ToolContext** | Object passed through the tool registry to handlers. Contains `sessionId` (for session-aware tools) and `autonomyLevel` (for the ask_user guard). Defined in `tools/types.ts`. |
| **ProjectType** | Union type: `node`, `typescript`, `python`, `rust`, `go`, `java`, `ruby`, `php`, `dotnet`, `unknown`. Detected by `WorkspaceManager.detectProjectType()` using file indicators and glob patterns. |
