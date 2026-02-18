# Documentation

## Implementation References

- Docs shell: `docs/index.html`, `docs/assets/style.css`, `docs/assets/diagrams.js`.
- Content source: `docs/markdown/*.md`.
- Maintenance index: `tmp/DOCS_MAINTENANCE_MAP.md`.


This is the master documentation index for Fetch.

## Getting Started

- [Overview](README.md) — What Fetch is and how message flow works
- [Setup Guide](SETUP_GUIDE.md) — Installation, configuration, first run
- [Install, Uninstall & Update](INSTALL_UNINSTALL_UPDATE.md) — Lifecycle guide (install/update/remove)
- [Security Runbook](SECURITY_RUNBOOK.md) — Production hardening and incident checklist
- [TUI Guide](TUI_GUIDE.md) — Using the Manager terminal interface
- [Commands](COMMANDS.md) — Safety escapes, natural language patterns, orchestrator tools
- [Workflow Automation](WORKFLOW_AUTOMATION.md) — End-to-end workflow/cron/runtime usage from chat

## Reference

- [Configuration](CONFIGURATION.md) — Environment variables, Docker, identity, skills
- [Skills Guide](SKILLS_GUIDE.md) — Creating and managing hot-loadable skills
- [API Reference](API_REFERENCE.md) — HTTP endpoints, tool interfaces, type definitions
- [Glossary](GLOSSARY.md) — Terminology and definitions
- Docs Maintenance Map moved to `tmp/DOCS_MAINTENANCE_MAP.md`

## Architecture

- [Architecture](ARCHITECTURE.md) — System design, message flow, module map, Docker topology
- [Identity System](IDENTITY_SYSTEM.md) — Personality, COLLAR.md, directives, and system prompt assembly
- Conversational Experience Plan moved to `tmp/CONVERSATIONAL_EXPERIENCE_PLAN.md`
- **[Agentic Workflow](AGENTIC_WORKFLOW.md)** - Pointer to merged workflow section in Systems Deep Dive.
- **[Harness System](HARNESS_SYSTEM.md)** - CLI delegation (Claude/Gemini/Copilot/OpenCode/Codex).
- **[State Management](STATE_MANAGEMENT.md)** - Session and workspace persistence.
- **[Context Pipeline](CONTEXT_PIPELINE.md)** - Memory, sliding windows, and compaction.

---

## How Fetch Processes a Message

<!-- DIAGRAM:dataflow -->

1. **WhatsApp** delivers the message to the Bridge via whatsapp-web.js
2. **Security Gate** runs four checks: `@fetch` trigger → phone whitelist → rate limit → input validation
3. **Safety gate** checks for 8 deterministic escape commands (`/stop`, `/undo`, `/clear`, `/help`, `/status`, `/version`, `/usage`, `/trust`). If matched, responds immediately without LLM
4. **Everything else** goes to the LLM through a two-stage intent gate (deterministic, then heuristic) that selects a per-turn tool subset
   - Capability/greeting/tool-inventory turns run with no tool schema attached
   - Action requests receive targeted tools relevant to the ask (workspace/task/github/web/browser/workflow families)
5. **Handler** persists the user message via `SessionManager.addUserMessage()` and dispatches to the agent core
6. **Agent core** builds message history in OpenAI multi-turn format (with `tool_calls` + `tool_call_id`) and runs the LLM
7. The LLM enters a ReAct loop — it decides whether to chat, call tools, or delegate to a harness
8. **System prompt rebuilds** after state-changing tools (`workspace_select`, `workspace_create`, `task_create`) so the LLM always sees current context
9. **Tools** execute with `ToolContext { sessionId, autonomyLevel }` — dangerous-tool policy is enforced at registry level, and tool calls/results are persisted to the session with argument redaction
10. **Compaction** triggers automatically when messages exceed the threshold — older messages are summarized and trimmed
11. **Response pipeline** uses a shared envelope renderer (`ResponseEnvelope` → composer → WhatsApp formatter/chunker) for both normal replies and proactive lifecycle notifications (`started`, `progress`, `file_op`, `question`, `completed`, `failed`)

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
| 7 | Admin auth | Admin endpoints (`/api/logout`, `/api/config/reload`, `/api/sessions*`) require bearer token |

## Harness System

<!-- DIAGRAM:harness -->

| Harness | CLI | Container | Best For |
|---------|-----|-----------|----------|
| **Claude Code** | `claude` | `fetch-kennel` | Complex multi-file refactoring, architecture decisions |
| **Gemini CLI** | `gemini` | `fetch-kennel` | Quick fixes, explanations, boilerplate generation |
| **Copilot CLI** | `gh copilot` | `fetch-kennel` | Suggestions, command help, GitHub workflows |
| **OpenCode** | `opencode` | `fetch-kennel` | Versatile coding, OpenRouter-native, general-purpose |
| **Codex** | `codex` | `fetch-kennel` | Agentic coding with OpenAI models, JSON Lines streaming |

All adapters extend `AbstractHarnessAdapter` and set `container: 'fetch-kennel'`. The spawner wraps CLI commands with `docker exec -w <cwd> fetch-kennel <command>`. The orchestrator selects which harness to use based on task complexity, enabled adapters, and skill hints.

## Orchestrator Tools

<!-- DIAGRAM:tools -->

| Category | Tools | Purpose |
|----------|-------|---------|
| Workspace | `workspace_list`, `workspace_select`, `workspace_status`, `workspace_create`, `workspace_delete`, `workspace_sync`, `workspace_publish`, `file_delete`, `folder_delete` | Project management and GitHub sync |
| Task | `task_create`, `task_status`, `task_cancel`, `task_respond` | Task lifecycle and harness delegation |
| Interaction | `ask_user` (with autonomy guard), `report_progress` | User communication via WhatsApp |
| GitHub | `github_pr_create`, `github_pr_list`, `github_pr_view`, `github_issue_create`, `github_issue_list`, `github_branch_create`, `github_action_status`, `github_search_repos` | GitHub operations via `gh` CLI |
| Web | `web_fetch`, `web_search` | Web content extraction and search via SearXNG |
| Browser | `browser_open`, `browser_snapshot`, `browser_action`, `browser_screenshot` | Headless browser automation via Playwright |
| Workflow/Runtime | `workflow_create`, `workflow_list`, `workflow_run`, `workflow_delete`, `cron_create`, `cron_list`, `cron_delete`, `cron_run`, `app_run`, `app_test`, `browser_test` | Reusable automation flows, scheduled jobs, and workspace/browser execution checks |
