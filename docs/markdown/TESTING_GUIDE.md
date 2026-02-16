# Testing Guide

> Manual verification checklist for Fetch’s WhatsApp workflow, tools, and metrics. Run sections in order; later phases depend on earlier setup.

## Prerequisites

- [ ] Containers running: `docker compose up -d`
- [ ] Bridge ready in logs: `docker logs -f fetch-bridge` (look for “Fetch is Ready!”)
- [ ] WhatsApp connected (QR scanned or session cached)
- [ ] At least one workspace exists and is accessible in `/workspace`

---

## Phase 1: Project Profiling

Validate that Fetch detects language, framework, package manager, test runner, and entry points.

### 1.1 Workspace Selection

Send via WhatsApp:

```
@fetch list workspaces
```

- [ ] Response lists workspaces with human-friendly labels (no raw JSON)
- [ ] Active workspace is clearly marked

```
@fetch switch to <project-name>
```

- [ ] Response confirms workspace switch and shows branch + cleanliness
- [ ] If a framework exists (Next.js, Express, etc.), it is mentioned

### 1.2 Profile in Context

```
@fetch what do you know about this project?
```

- [ ] Language is correct (e.g., TypeScript, Go)
- [ ] Package manager is correct (e.g., npm, pnpm, yarn)
- [ ] Test runner is correct when present (e.g., vitest, jest)
- [ ] Entry point(s) are detected (e.g., `src/index.ts`, `main.go`)

### 1.3 Profile Passed to Harness

```
@fetch use claude to add a hello world test
```

- [ ] Bridge logs show `--- Project Context ---` with language/framework/commands
- [ ] Harness chooses the correct test command for the project
  - Example for this repo’s bridge (`fetch-app/`): `npm run test:run` or `npx vitest run`

### 1.4 Multi-Project Spot Checks (Optional)

Repeat 1.1–1.3 for at least one other language:

- [ ] Go project — detects `go test ./...`, `main.go`
- [ ] Python project — detects `pytest`, entry point (`main.py`/`app.py`)
- [ ] Rust project — detects `cargo test`, `src/main.rs`

---

## Phase 2: Commands & Tool Inventory

Verify safety commands and tool listings match what exists.

### 2.1 Safety Escapes (Deterministic)

Run each command (aliases in parentheses):

- [ ] `/stop` (`/cancel`) — cancels a running task and terminates active harness execution
- [ ] `/undo` and `/undo all` — soft reset last commit / revert to task start
- [ ] `/clear` (`/reset`) — clears conversation (confirmation expected)
- [ ] `/help` (`/h`, `/?`) — shows help
- [ ] `/status` (`/st`) — system + task status
- [ ] `/version` (`/v`) — version info
- [ ] `/usage` (`/u`) — OpenRouter usage
- [ ] `/trust` — owner-only whitelist management (`list`, `add`, `remove`)

### 2.2 Capability Queries (LLM Conversational Path)

These messages should go through the normal LLM path (not deterministic `/help` shortcut):

```
@fetch show me your tools
@fetch what can you do
```

- [ ] Output is conversational and context-aware (not a static command dump)
- [ ] Output suggests one concrete next action Fetch can take immediately
- [ ] `/help` still returns the deterministic full help catalog

### 2.3 Full Tool Coverage (LLM Output)

Ask the LLM directly:

```
@fetch list all orchestrator tools with one-line descriptions
```

- [ ] Response lists 40 tools, including:
  - Workspace: `workspace_list`, `workspace_select`, `workspace_status`, `workspace_create`, `workspace_delete`, `workspace_sync`, `workspace_publish`, `file_delete`, `folder_delete`
  - Task: `task_create`, `task_status`, `task_cancel`, `task_respond`
  - Interaction: `ask_user`, `report_progress`
  - GitHub: `github_pr_create`, `github_pr_list`, `github_pr_view`, `github_issue_create`, `github_issue_list`, `github_branch_create`, `github_action_status`, `github_search_repos`
  - Web: `web_fetch`, `web_search`
  - Browser: `browser_open`, `browser_snapshot`, `browser_action`, `browser_screenshot`
  - Workflow/Runtime: `workflow_create`, `workflow_list`, `workflow_run`, `workflow_delete`, `cron_create`, `cron_list`, `cron_delete`, `cron_run`, `app_run`, `app_test`, `browser_test`

---

## Phase 3: Tool Output Quality (No JSON Dumps)

Verify tool responses are concise, human-readable summaries.

### 3.1 Workspace Tools

```
@fetch what projects do I have?
@fetch how's the project looking?
```

- [ ] Natural language summaries (no JSON arrays/objects)

### 3.2 Task Tools

```
@fetch build a quick API endpoint for status
@fetch how's the task going?
@fetch cancel the current task
```

- [ ] Status includes goal, duration, and most recent progress line
- [ ] Cancel is acknowledged clearly

### 3.3 GitHub Tools

```
@fetch list open PRs on <org/repo>
@fetch show GitHub actions status
```

- [ ] Summaries show titles, status, and key fields without JSON

### 3.4 Web & Browser Tools (Optional)

```
@fetch search for "typescript vitest config"
@fetch fetch the docs at <url>
```

- [ ] Web results are summarized with sources, not raw HTML

---

## Phase 4: Task Notifications & Progress

### 4.1 Task Started

```
@fetch use copilot to explain the main entry point
```

- [ ] Start notification includes goal + selected harness

### 4.2 Progress Updates

During a longer task:

- [ ] Progress messages are varied and action-specific (e.g., “running tests”)

### 4.3 Task Completion

Let a task finish:

- [ ] Completion includes summary, file counts, and duration
- [ ] Tone is natural and not robotic

### 4.4 Task Failure

Trigger a failure (e.g., switch to a nonexistent workspace and run a task):

- [ ] Failure message includes a clear error cause
- [ ] No stack traces or raw tool errors

---

## Phase 5: Metrics & Evidence

Capture these for each testing run:

- [ ] Date/time, tester, and environment (local vs. remote)
- [ ] Task counts (started/completed/failed/cancelled)
- [ ] Durations for task start → completion
- [ ] Number of progress updates per task
- [ ] Any flake/retry notes and relevant logs or screenshots
