# Fetch

Your faithful code companion.

```text
  ⠀⠀⠀⠀⠀⠀⠀⢀⣠⣤⣠⣶⠚⠛⠿⠷⠶⣤⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⢀⣴⠟⠉⠀⠀⢠⡄⠀⠀⠀⠀⠀⠉⠙⠳⣄⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⢀⡴⠛⠁⠀⠀⠀⠀⠘⣷⣴⠏⠀⠀⣠⡄⠀⠀⢨⡇⠀⠀⠀⠀⠀⠀⠀    ███████╗███████╗████████╗ ██████╗██╗  ██╗
  ⠀⠀⠀⠺⣇⠀⠀⠀⠀⠀⠀⠀⠘⣿⠀⠀⠘⣻⣻⡆⠀⠀⠙⠦⣄⣀⠀⠀⠀⠀    ██╔════╝██╔════╝╚══██╔══╝██╔════╝██║  ██║
  ⠀⠀⠀⢰⡟⢷⡄⠀⠀⠀⠀⠀⠀⢸⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⢻⠶⢤⡀    █████╗  █████╗     ██║   ██║     ███████║
  ⠀⠀⠀⣾⣇⠀⠻⣄⠀⠀⠀⠀⠀⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣀⣴⣿    ██╔══╝  ██╔══╝     ██║   ██║     ██╔══██║
  ⠀⠀⢸⡟⠻⣆⠀⠈⠳⢄⡀⠀⠀⡼⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠶⠶⢤⣬⡿⠁    ██║     ███████╗   ██║   ╚██████╗██║  ██║
  ⠀⢀⣿⠃⠀⠹⣆⠀⠀⠀⠙⠓⠿⢧⡀⠀⢠⡴⣶⣶⣒⣋⣀⣀⣤⣶⣶⠟⠁⠀    ╚═╝     ╚══════╝   ╚═╝    ╚═════╝╚═╝  ╚═╝
  ⠀⣼⡏⠀⠀⠀⠙⠀⠀⠀⠀⠀⠀⠀⠙⠳⠶⠤⠵⣶⠒⠚⠻⠿⠋⠁⠀⠀⠀⠀
  ⢰⣿⡇⠀⠀⠀⠀⠀⠀⠀⣆⠀⠀⠀⠀⠀⠀⠀⢠⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀    Unleash Multi-agent Orchestration
  ⢿⡿⠁⠀⠀⠀⠀⠀⠀⠀⠘⣦⡀⠀⠀⠀⠀⠀⢸⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣷⡄⠀⠀⠀⠀⣿⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢷⡀⠀⠀⠀⢸⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀
```

Fetch is a self-hosted, multi-agent coding orchestrator controlled from WhatsApp.
It routes work to CLI harnesses (Copilot, Claude, Gemini, OpenCode, Codex) inside a sandboxed Docker container and gives you a Go TUI for ops.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Go](https://img.shields.io/badge/Go-1.21+-00ADD8?logo=go&logoColor=white)](https://golang.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docker.com)

## Quick Start

Install and bootstrap Fetch in one flow:

```bash
# 1) Install Fetch CLI
curl -fsSL https://raw.githubusercontent.com/Traves-Theberge/Fetch/main/scripts/install.sh | bash

# 2) Ensure PATH includes ~/.local/bin
export PATH="$HOME/.local/bin:$PATH"

# 3) Install prerequisites + harness CLIs
fetch setup --install-prereqs --install-gh-cli --install-harnesses

# 4) Configure .env
nano ~/.fetch/repo/.env

# 5) Start services and open manager TUI
fetch up
fetch tui
```

## Requirements

Host requirements:

- Docker + Docker Compose
- Node.js 20+ and npm
- Go 1.21+ (for local manager builds)
- GitHub CLI (`gh`) for GitHub/Copilot workflows

Runtime requirements:

- `OPENROUTER_API_KEY`
- `OWNER_PHONE_NUMBER` (E.164 format, e.g. `15551234567`)

Optional but common:

- `GH_TOKEN` for GitHub repo operations
- `ENABLE_COPILOT=false` if you want GitHub ops without Copilot harness

## First-Run Checklist

1. Run `fetch self doctor` and confirm no missing prerequisites.
2. Open `fetch tui` and verify harness auth/install status.
3. Complete WhatsApp pairing from bridge logs (`docker logs -f fetch-bridge`).
4. Send `/status` and `/version` from WhatsApp to verify end-to-end health.
5. Open `http://localhost:8765/docs` to verify docs/status server availability.

Notes:

- Docs/status are served from the bridge process and are expected to remain reachable during setup mode.
- If `OWNER_PHONE_NUMBER` is missing, WhatsApp auth/bridge startup will not complete; set it in `.env` and restart.

## Common Commands

Service lifecycle:

```bash
fetch up
fetch down
fetch down --all
fetch restart
fetch status
fetch logs
fetch tui
```

How `down` works:

- `fetch down` stops and removes this Fetch stack's containers and network (`docker compose down --remove-orphans`).
- `fetch down -v` also removes this stack's volumes.
- `fetch down --all` additionally removes legacy fixed-name containers from older versions (`fetch-bridge`, `fetch-kennel`, `fetch-searxng`, `searxng`).

Service command targeting:

- `fetch up/down/status/logs` now operate on the Fetch repo in your current working directory when applicable.
- This prevents controlling a different installed repo stack by accident.

Install/update management:

```bash
fetch self version
fetch self update
fetch self update --channel beta
fetch self pin v0.0.84
fetch uninstall
```

Release note for maintainers:

- `release-manifest.json` is tag-release CI managed. Preferred release flow is tag push (`vX.Y.Z`) and letting `.github/workflows/release.yml` update channels/metadata on `main`.

Config and harness management:

```bash
fetch config validate
fetch config doctor
fetch harness status
fetch harness install all
fetch harness uninstall github
```

## Practical Setup Notes

- GitHub harness compatibility supports both:
  - built-in `gh copilot` command (newer GitHub CLI)
  - `github/gh-copilot` extension (legacy path)
- If GitHub auth is missing, run `gh auth login` on host and re-check `fetch harness status`.
- Use `fetch setup --install-harnesses` after changing harness enable flags.

## Workflow Automation

Fetch now includes workflow + cron orchestration tools in the agent loop.

Use this three-layer model to decide what to ask for:

- `Delegation Layer` (open-ended implementation): `task_create`, `task_status`, `task_cancel`, `task_respond`
- `Interactive Layer` (live exploration/research): `web_search`, `web_fetch`, `browser_open`, `browser_snapshot`, `browser_action`, `browser_screenshot`
- `Execution Layer` (deterministic pass/fail steps): `app_run`, `app_test`, `browser_test`

Workflow + cron primarily automate the `Execution Layer`:

- `workflow_create`, `workflow_list`, `workflow_run`, `workflow_delete`
- `cron_create`, `cron_list`, `cron_delete`, `cron_run`
- Deterministic execution helpers: `app_run`, `app_test`, `browser_test`

Safety notes:

- `/stop` and `task_cancel` now terminate active harness processes (not just task state).
- Workflow definitions are validated at creation time.
- Workflow step tools cannot include recursive orchestration tools (`workflow_*` / `cron_*`) or task-interaction tools (`ask_user`, `report_progress`).
- Workflow steps should be deterministic; use delegation tools for open-ended coding tasks.
- Dangerous tools are policy-gated by autonomy level in the registry (supervised blocks dangerous actions; cautious requires explicit confirmation).
- Tool arguments are redacted before logging/persistence for sensitive keys (token/apiKey/password/secret-like fields).
- Agent/tool safety helpers now have direct unit coverage for retry classification, error sanitization, and progress rewrite output guards.
- Workflow/cron manager tests now cover cron validation, success/failure metadata updates, and startup catch-up behavior for overdue jobs.

Example asks from WhatsApp:

- "Create a nightly workflow that runs tests and syncs to GitHub."
- "Schedule that workflow at `0 3 * * *` UTC."
- "Run app tests now in my active workspace."
- "Open https://example.com and verify the login button exists."

## Workspace Operations

Fetch includes workspace + git tools for day-to-day project control:

- `workspace_list`, `workspace_select`, `workspace_status`
- `workspace_create`, `workspace_delete`, `workspace_publish`, `workspace_sync`
- `file_delete`, `folder_delete`

Safety notes:

- Destructive operations are autonomy-gated and can require confirmation depending on mode.
- `workspace_sync` and publish flows depend on valid git/remote configuration.

Example asks from WhatsApp:

- "List my workspaces and switch to api-server."
- "Show git status and recent commits for this project."
- "Sync my current workspace to GitHub."
- "Delete `tmp/output.log` from this workspace."

## Task Delegation

Task delegation is for open-ended work that needs judgment and iteration:

- `task_create`, `task_status`, `task_cancel`, `task_respond`
- Interaction helpers used by the loop: `ask_user`, `report_progress`

Safety notes:

- `/stop` and `task_cancel` terminate active harness execution, not just task state.
- Follow-ups (`task_respond`) attach to the currently running task context.

Example asks from WhatsApp:

- "Use codex to add tests for auth middleware."
- "What is the current task status?"
- "Cancel the active task now."
- "Tell the task to also update docs and JSDoc."

## GitHub Operations

Fetch includes GitHub repo/PR/issue/CI helpers:

- `github_pr_create`, `github_pr_list`, `github_pr_view`
- `github_issue_create`, `github_issue_list`
- `github_branch_create`, `github_action_status`, `github_search_repos`

Safety notes:

- Requires host auth (`gh auth login`) and usually `GH_TOKEN` for API-backed operations.
- Repo-scoped actions use the active workspace repo unless you pass an explicit `owner/repo`.

Example asks from WhatsApp:

- "Create a draft PR for this workspace."
- "List open PRs for `owner/repo`."
- "Create an issue titled 'Fix flaky retry logic'."
- "Show recent GitHub Actions status."

## Web And Browser Tools

Interactive tools are for exploration and live state inspection:

- Web: `web_search`, `web_fetch`
- Browser session: `browser_open`, `browser_snapshot`, `browser_action`, `browser_screenshot`
- Browser assertion runner (deterministic execution layer): `browser_test`

Safety notes:

- Browser tools run inside Kennel and return structured snapshots for deterministic follow-up actions.
- `browser_test` is for pass/fail assertions; use `browser_open` + `browser_action` when you need exploratory interaction.

Example asks from WhatsApp:

- "Search for TypeScript Zod validation best practices."
- "Fetch https://example.com/docs and summarize the auth section."
- "Open https://example.com, click login, and take a screenshot."
- "Run a browser test on https://example.com and confirm 'Login' appears."

## Conversational Preferences

Fetch can persist per-session response style from natural language:

- "be brief"
- "be detailed"
- "be direct"
- "be conversational"
- "use fewer emojis"

These preferences affect conversational capability/tool-inventory responses and carry across future turns in the same session.

## Deterministic Safety Commands

These commands bypass normal LLM/tool planning and are handled deterministically:

- `/stop` (`/cancel`)
- `/undo` (`/undo all`)
- `/clear` (`/reset`)
- `/help` (`/h`, `/?`)
- `/status` (`/st`)
- `/version` (`/v`)
- `/usage` (`/u`)
- `/trust` (`list`, `add`, `remove`)

Safety notes:

- Use these when you need immediate control, even if the LLM path is unavailable.
- Natural-language prompts like "what can you do?" stay conversational through the normal LLM path; use `/help` for deterministic command catalog output.

## Architecture

Fetch runs as a three-container stack plus a host manager:

- `fetch-bridge` (Node.js/TypeScript): WhatsApp client + orchestration layer
- `fetch-kennel` (Ubuntu): sandboxed execution for harness CLIs + browser tooling
- `fetch-searxng`: self-hosted web search provider
- `fetch-manager` (Go TUI): host-side operations and auth/setup flows

### Agent Runtime Internals

- Single active run per session with explicit lifecycle phases (`queued`, `preparing`, `planning`, `tool_execution`, `responding`, terminal state).
- Prompt mode selection per turn (`minimal` for short conversational turns, `full` for execution-heavy turns).
- Interrupt path for `/stop` and `/cancel` now aborts active in-flight runs, not only delegated tasks.
- Turn telemetry is captured for every run (retries, tool counts, per-tool duration/success).
- Two memory tiers are persisted in session metadata:
- `shortTermSummary` for immediate continuity across nearby turns.
- `durableNotes` for stable preferences/decisions that should survive compaction.

## Project Structure

- `fetch-app/`: bridge service (TypeScript)
- `manager/`: Go manager/TUI
- `kennel/`: Docker sandbox image
- `scripts/`: installer, setup, and host management scripts
- `docs/`: detailed setup, architecture, API, and operations guides

## Development

Bridge:

```bash
cd fetch-app
npm install
npm run dev
npm run build
npm run lint
npm run test:run
npx vitest run --coverage
```

Manager:

```bash
cd manager
go build -o fetch-manager .
./fetch-manager
```

Docker:

```bash
./deploy.sh
docker compose up -d
docker compose down
```

## Documentation

Core docs:

- [Setup Guide](docs/markdown/SETUP_GUIDE.md)
- [Install, Uninstall & Update](docs/markdown/INSTALL_UNINSTALL_UPDATE.md)
- [TUI Guide](docs/markdown/TUI_GUIDE.md)
- [Configuration](docs/markdown/CONFIGURATION.md)
- [Commands](docs/markdown/COMMANDS.md)
- [Workflow Automation](docs/markdown/WORKFLOW_AUTOMATION.md)
- [Architecture](docs/markdown/ARCHITECTURE.md)
- [Harness System](docs/markdown/HARNESS_SYSTEM.md)
- [API Reference](docs/markdown/API_REFERENCE.md)
- [Testing Guide](docs/markdown/TESTING_GUIDE.md)
- [Changelog](CHANGELOG.md)

## License

MIT. See `LICENSE`.
