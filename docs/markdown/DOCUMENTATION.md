# Documentation

This is the master documentation index for Fetch v3.3.0.

## Getting Started

- [Overview](README.md) — What Fetch is and how it works
- [Setup Guide](SETUP_GUIDE.md) — Installation, configuration, first run
- [TUI Guide](TUI_GUIDE.md) — Using the Manager terminal interface
- [Commands](COMMANDS.md) — All slash commands and natural language patterns

## Reference

- [Configuration](CONFIGURATION.md) — Environment variables, Docker, identity, skills
- [API Reference](API_REFERENCE.md) — HTTP endpoints, tool interfaces, type definitions
- [Glossary](GLOSSARY.md) — Terminology and definitions

## Architecture

- [Architecture](ARCHITECTURE.md) — System design, message flow, module map, Docker topology
- [Agentic Architecture](AGENTIC_PLAN.md) — Cognitive model, ReAct loop, harness delegation
- [State Management](STATE_MANAGEMENT.md) — Database schema, singletons, events, boot order

## Project Health

- [Code Audit](CODE_AUDIT_CHECKLIST.md) — Module status, deleted files, test coverage
- [Changelog](CHANGELOG.md) — Version history

---

## How Fetch Processes a Message

<!-- DIAGRAM:dataflow -->

1. **WhatsApp** delivers the message to the Bridge via whatsapp-web.js
2. **Security Gate** runs four checks: `@fetch` trigger → phone whitelist → rate limit → input validation
3. **Instinct layer** checks for deterministic patterns (`/stop`, `/status`, `yes`). If matched, responds immediately
4. **Intent classifier** categorizes the message as `conversation`, `inquiry`, or `action`
5. **Handler** dispatches to the appropriate agent function with session context and activated skills
6. **Agent core** runs the LLM with tool definitions. For action intents, enters a ReAct loop
7. **Tools** execute: workspace operations, task creation (delegates to harness), user interaction
8. **Response** is formatted for WhatsApp and sent back

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

## Mode State Machine

<!-- DIAGRAM:stateflow -->

| Mode | When | What Happens |
|------|------|-------------|
| 🟢 ALERT | Default | Listening for messages, ready to work |
| 🔵 WORKING | Task running | AI harness executing in Kennel |
| 🟠 WAITING | ask_user called | Blocked until user responds |
| 🔴 GUARDING | Dangerous action | Awaiting approval (yes/no) |
| 💤 RESTING | Idle timeout | Low-power, wakes on message |

## Harness System

<!-- DIAGRAM:harness -->

| Harness | CLI | Best For |
|---------|-----|----------|
| **Claude Code** | `claude` | Complex multi-file refactoring, architecture decisions |
| **Gemini CLI** | `gemini` | Quick fixes, explanations, boilerplate generation |
| **Copilot CLI** | `gh copilot` | Suggestions, command help, GitHub workflows |

All adapters extend `AbstractHarnessAdapter`. The orchestrator selects which harness to use based on task complexity and agent routing rules defined in `data/agents/*.md`.

## Orchestrator Tools

<!-- DIAGRAM:tools -->

| Category | Tools | Purpose |
|----------|-------|---------|
| Workspace | `workspace_list`, `workspace_select`, `workspace_status`, `workspace_create`, `workspace_delete` | Project management |
| Task | `task_create`, `task_status`, `task_cancel`, `task_respond` | Task lifecycle and harness delegation |
| Interaction | `ask_user`, `report_progress` | User communication via WhatsApp |
