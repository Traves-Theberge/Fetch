# Glossary

## Core Concepts

| Term | Definition |
|------|-----------|
| **Fetch** | The orchestrator system. Receives WhatsApp messages, classifies intent, delegates to AI harnesses, reports results. |
| **Alpha** | The owner/operator. The person whose phone number is set as `OWNER_PHONE_NUMBER`. Has full control. |
| **The Pack** | Collective name for the three AI harness agents (Claude, Gemini, Copilot). |

## Infrastructure

| Term | Definition |
|------|-----------|
| **Bridge** | The Node.js application running in Docker. Handles WhatsApp, security, agent core, tools. |
| **Kennel** | The Ubuntu Docker container where AI CLIs execute. Sandboxed with mounted workspace. |
| **Manager** | The Go TUI (Bubble Tea) that runs on the host machine. Controls Docker, edits config, views logs. |
| **Workspace** | The `/workspace` directory mounted into both containers. Contains all project code. |

## Identity System

| Term | Definition |
|------|-----------|
| **Collar** | `data/identity/COLLAR.md` — Core system instructions defining Fetch's personality and behavioral rules. |
| **Alpha File** | `data/identity/ALPHA.md` — Owner information (preferences, timezone, technical level). |
| **Pack Member** | A `PackMember` struct parsed from `data/agents/*.md`. Defines a harness's name, triggers, role, and routing priority. |
| **Identity Manager** | Singleton that builds the system prompt from identity files. Watches for changes and hot-reloads. |

## Processing Layers

| Term | Definition |
|------|-----------|
| **Instinct** | Deterministic fast-path handler. Pattern-matched against input, executes without LLM. <5ms. |
| **Intent** | Classification result: `conversation`, `inquiry`, or `action`. Determines which handler processes the message. |
| **Mode** | State machine state: ALERT, WORKING, WAITING, GUARDING, RESTING. Persisted to SQLite. |
| **Skill** | A Markdown file in `data/skills/` that injects domain-specific instructions when triggers match. |

## Harness System

| Term | Definition |
|------|-----------|
| **Harness** | An adapter that wraps an AI CLI (Claude Code, Gemini, Copilot) for use by the orchestrator. |
| **AbstractHarnessAdapter** | Base class providing shared logic: `formatGoal()`, `isQuestion()`, `extractSummary()`, `extractFileOperations()`. |
| **Registry** | `HarnessRegistry` — Maps harness names to adapter instances. Single source of truth. |
| **Executor** | `HarnessExecutor` — Manages task execution lifecycle through the pool/spawner. |
| **Spawner** | `HarnessSpawner` — Creates and manages child processes (`docker exec` into Kennel). |
| **Pool** | Process pool for managing concurrent harness instances (currently single-task). |

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
| **Orchestrator Tool** | One of 11 tools the LLM can call during the ReAct loop (workspace_*, task_*, ask_user, report_progress). |
| **Custom Tool** | A user-defined tool in `data/tools/` (JSON). Wraps a shell command with parameters. |
