# Glossary

## Implementation References

- Canonical terms source: cross-check all pages in `docs/markdown/`.
- Type contracts for terminology: `apps/bridge/src/tools/types.ts`, `apps/bridge/src/harness/types.ts`, `apps/bridge/src/workflow/types.ts`.


## Platform

| Term | Definition |
|------|------------|
| **Fetch** | The WhatsApp-first coding orchestrator that routes requests through an LLM + tool loop. |
| **Bridge** | The Node.js/TypeScript runtime container (`fetch-bridge`) that handles messaging, orchestration, tools, and status/docs APIs. |
| **Kennel** | The execution container (`fetch-kennel`) where harness CLIs and browser automation run. |
| **SearXNG** | The self-hosted search service container (`fetch-searxng`) used by `web_search`. |
| **Manager** | The Go TUI (`fetch-manager`) used to run, monitor, and configure Fetch on host. |
| **Workspace** | The shared project directory mounted into Bridge and Kennel (`./workspace`). |

## Messaging And Control

| Term | Definition |
|------|------------|
| **`@fetch` Trigger** | Message prefix used to route WhatsApp messages into Fetch processing. |
| **Safety Gate** | Deterministic command layer for critical slash commands (`/stop`, `/status`, `/version`, etc.). |
| **Autonomy Level** | Runtime policy mode (`supervised`, `cautious`, etc.) controlling dangerous-action behavior. |
| **Task** | A delegated coding job with lifecycle state (`pending`, `running`, `completed`, `failed`, `cancelled`). |
| **Session** | Per-user conversation state (messages, tool calls, preferences, project context). |

## Agent Runtime

| Term | Definition |
|------|------------|
| **ReAct Loop** | Iterative reason/act cycle: model plans, calls tools, reads results, continues until done. |
| **Tool Registry** | Central list of available tools, schemas, and policy checks. |
| **ToolContext** | Runtime context passed into tools (`sessionId`, `autonomyLevel`, and related execution metadata). |
| **Prompt Rebuild** | Refreshing the system prompt after context-changing tools so state remains accurate. |
| **Compaction** | Summarization + trimming of older session history when context grows large. |

## Execution Layers

| Term | Definition |
|------|------------|
| **Delegation Tools** | Open-ended coding delegation tools (`task_create`, `task_status`, etc.). |
| **Interactive Tools** | Live web/browser exploration tools (`web_search`, `web_fetch`, browser toolset). |
| **Execution Tools** | Deterministic run/validation tools (`app_run`, `app_test`, `browser_test`). |
| **Workflow** | Reusable multi-step automation that chains deterministic tools. |
| **Cron Job** | UTC-scheduled trigger for workflow execution. |

## Harnesses

| Term | Definition |
|------|------------|
| **Harness** | Adapter around a coding CLI (Claude, Gemini, Copilot, OpenCode, Codex). |
| **Harness Registry** | Source of truth mapping harness names to adapters. |
| **Harness Spawner** | Process launcher that executes harness commands, usually through `docker exec` in Kennel. |
| **Containerized Harnessing** | Running AI coding CLIs inside `fetch-kennel` to isolate host environment. |

## Security

| Term | Definition |
|------|------------|
| **Whitelist** | Trusted phone numbers allowed to control Fetch. |
| **Rate Limiter** | Sliding-window request limiter for abuse and spam control. |
| **Dangerous Tools Policy** | Guardrail that blocks or requires explicit confirmation for high-risk actions. |
| **Redaction** | Sanitization of sensitive tool arguments in logs/persistence (token/secret/password-like fields). |
