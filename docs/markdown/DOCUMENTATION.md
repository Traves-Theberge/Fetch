# Documentation

This is the master documentation index for Fetch.

## Getting Started

- [Overview](README.md) — What Fetch is and how it works
- [Setup Guide](SETUP_GUIDE.md) — Installation, configuration, first run
- [TUI Guide](TUI_GUIDE.md) — Using the Manager terminal interface
- [Commands](COMMANDS.md) — Safety escapes, natural language patterns, orchestrator tools

## Reference

- [Configuration](CONFIGURATION.md) — Environment variables, Docker, identity, skills
- [Skills Guide](SKILLS_GUIDE.md) — Creating and managing hot-loadable skills
- [API Reference](API_REFERENCE.md) — HTTP endpoints, tool interfaces, type definitions
- [Glossary](GLOSSARY.md) — Terminology and definitions

## Architecture

- [Architecture](ARCHITECTURE.md) — System design, message flow, module map, Docker topology
- [Identity System](IDENTITY_SYSTEM.md) — Personality, COLLAR.md, directives, and system prompt assembly
- **[Agentic Architecture](AGENTIC_PLAN.md)** - Logic flow and LLM autonomy.
- **[Harness System](HARNESS_SYSTEM.md)** - CLI delegation (Claude/Gemini/Copilot).
- **[State Management](STATE_MANAGEMENT.md)** - Session and workspace persistence.
- **[Context Pipeline](CONTEXT_PIPELINE.md)** - Memory, sliding windows, and compaction.

## Project Health

- [Changelog](CHANGELOG.md) — Version history

---

## How Fetch Processes a Message

<!-- DIAGRAM:dataflow -->

1. **WhatsApp** delivers the message to the Bridge via whatsapp-web.js
2. **Security Gate** runs four checks: `@fetch` trigger → phone whitelist → rate limit → input validation
3. **Safety gate** checks for 5 deterministic escape commands (`/stop`, `/undo`, `/clear`, `/help`, `/status`). If matched, responds immediately without LLM
4. **Everything else** goes to the LLM with all 21 tools available — there is no intent classification or conversation/action split
5. **Handler** persists the user message via `SessionManager.addUserMessage()` and dispatches to the agent core
6. **Agent core** builds message history in OpenAI multi-turn format (with `tool_calls` + `tool_call_id`) and runs the LLM
7. The LLM enters a ReAct loop — it decides whether to chat, call tools, or delegate to a harness
8. **System prompt rebuilds** after state-changing tools (`workspace_select`, `workspace_create`, `task_create`) so the LLM always sees current context
9. **Tools** execute with `ToolContext { sessionId, autonomyLevel }` — tool calls and results are persisted to the session
10. **Compaction** triggers automatically when messages exceed the threshold — older messages are summarized and trimmed
11. **Response** is formatted for WhatsApp and sent back. Task completions push proactive notifications

## Security Model

<!-- DIAGRAM:security -->

| Layer | Component | Function |
|-------|-----------|----------|
| 1 | `@fetch` trigger | Messages without the trigger are ignored |
| 2 | Phone whitelist | Only `OWNER_PHONE_NUMBER` + trusted numbers |
| 3 | Rate limiter | Sliding window — 30 requests/minute per user |
| 4 | Input validator | Blocks shell injection, path traversal, null bytes |
| 5 | Docker isolation | AI CLIs run in sandboxed Kennel container |
| 6 | Read-only mounts | Auth credentials mounted as read-only volumes |
| 7 | Admin auth | `/api/logout` requires bearer token |

## Harness System

<!-- DIAGRAM:harness -->

| Harness | CLI | Container | Best For |
|---------|-----|-----------|----------|
| **Claude Code** | `claude` | `fetch-kennel` | Complex multi-file refactoring, architecture decisions |
| **Gemini CLI** | `gemini` | `fetch-kennel` | Quick fixes, explanations, boilerplate generation |
| **Copilot CLI** | `gh copilot` | `fetch-kennel` | Suggestions, command help, GitHub workflows |

All adapters extend `AbstractHarnessAdapter` and set `container: 'fetch-kennel'`. The spawner wraps CLI commands with `docker exec -w <cwd> fetch-kennel <command>`. The orchestrator selects which harness to use based on task complexity and agent routing rules defined in `data/agents/*.md`.

## Orchestrator Tools

<!-- DIAGRAM:tools -->

| Category | Tools | Purpose |
|----------|-------|---------|
| Workspace | `workspace_list`, `workspace_select`, `workspace_status`, `workspace_create`, `workspace_delete`, `workspace_sync` | Project management and GitHub sync |
| Task | `task_create`, `task_status`, `task_cancel`, `task_respond` | Task lifecycle and harness delegation |
| Interaction | `ask_user` (with autonomy guard), `report_progress` | User communication via WhatsApp |
