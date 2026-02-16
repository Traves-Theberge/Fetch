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

## Common Commands

Service lifecycle:

```bash
fetch up
fetch down
fetch restart
fetch status
fetch logs
fetch tui
```

Install/update management:

```bash
fetch self version
fetch self update
fetch self update --channel beta
fetch self pin v0.0.64
fetch uninstall
```

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

Fetch now includes workflow + cron orchestration tools in the agent loop:

- `workflow_create`, `workflow_list`, `workflow_run`, `workflow_delete`
- `cron_create`, `cron_list`, `cron_delete`, `cron_run`
- Runtime execution helpers: `app_run`, `app_test`, `browser_test`

Example asks from WhatsApp:

- "Create a nightly workflow that runs tests and syncs to GitHub."
- "Schedule that workflow at `0 3 * * *` UTC."
- "Run app tests now in my active workspace."
- "Open https://example.com and verify the login button exists."

## Architecture

Fetch runs as a three-container stack plus a host manager:

- `fetch-bridge` (Node.js/TypeScript): WhatsApp client + orchestration layer
- `fetch-kennel` (Ubuntu): sandboxed execution for harness CLIs + browser tooling
- `fetch-searxng`: self-hosted web search provider
- `fetch-manager` (Go TUI): host-side operations and auth/setup flows

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
- [Install & Update](docs/markdown/INSTALL_UPDATE.md)
- [TUI Guide](docs/markdown/TUI_GUIDE.md)
- [Configuration](docs/markdown/CONFIGURATION.md)
- [Commands](docs/markdown/COMMANDS.md)
- [WhatsApp Workflows](docs/markdown/WHATSAPP_WORKFLOWS.md)
- [Architecture](docs/markdown/ARCHITECTURE.md)
- [Harness System](docs/markdown/HARNESS_SYSTEM.md)
- [API Reference](docs/markdown/API_REFERENCE.md)
- [Testing Guide](docs/markdown/TESTING_GUIDE.md)
- [Changelog](CHANGELOG.md)

## License

MIT. See `LICENSE`.
