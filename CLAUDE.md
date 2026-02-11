# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fetch is a headless development orchestrator that sends AI agents (Claude Code, Gemini, Copilot) into Docker containers to execute coding tasks, controlled via WhatsApp. It uses a three-container architecture: **fetch-bridge** (Node.js orchestrator — "the brain"), **fetch-kennel** (Ubuntu sandbox — "the muscle"), and **searxng** (self-hosted meta search engine).

## Build & Development Commands

### fetch-app (Node.js/TypeScript — the Bridge)

```bash
cd fetch-app
npm install          # install dependencies
npm run build        # compile TypeScript → dist/
npm run dev          # run with ts-node (ESM)
npm start            # run compiled dist/index.js
npm run lint         # ESLint
npm run clean        # remove dist/
```

### Tests (Vitest)

```bash
cd fetch-app
npm test                              # watch mode
npm run test:run                      # single run (all tests)
npm run test:unit                     # unit tests only
npm run test:integration              # integration tests only
npx vitest run tests/unit/security    # run a single test file
```

### manager (Go TUI)

```bash
cd manager
go mod tidy                  # sync dependencies
go build -o fetch-manager .  # build binary
./fetch-manager              # run TUI
bash build.sh                # full build with ldflags (current + arm64)
```

### Docker (full system)

```bash
./deploy.sh              # build images + start containers
docker compose build     # build only
docker compose up -d     # start containers
docker compose down      # stop containers
docker logs -f fetch-bridge   # view bridge logs (QR code here)
```

### Development Setup

```bash
./setup-dev.sh    # validates prereqs (Node 20+, Docker, Go), installs deps, builds everything
```

## Architecture

### Dual-Container Model

- **fetch-bridge** (container 1): Node.js orchestrator that connects to WhatsApp, runs the LLM agent loop, manages sessions/tasks in SQLite, and controls the kennel via `docker exec`.
- **fetch-kennel** (container 2): Ubuntu sandbox with Claude Code, Gemini CLI, Copilot CLI, and Playwright+Chromium installed. The bridge executes AI harness commands and browser automation inside this container. Workspace is shared via volume mount at `/workspace`.
- **searxng** (container 3): Self-hosted meta search engine aggregating Google, DuckDuckGo, Bing, Wikipedia, GitHub, StackOverflow, npm. Provides the `web_search` tool backend.

### LLM-First Agent Loop (`fetch-app/src/agent/core.ts`)

Every WhatsApp message goes through the same path — no pre-classification or intent routing:

1. **SecurityGate** → whitelist/rate-limit check
2. **Commands** → deterministic slash commands (`/stop`, `/undo`, `/clear`, `/help`, `/status`) bypass LLM
3. **AgentCore** → LLM receives full tool set (27 tools), decides to chat, call tools, or delegate
4. **Tool loop** → up to 5 rounds of tool calls per message with ReAct pattern
5. **Harness delegation** → if `task_create` is called, spawns CLI process in kennel

### Key Module Relationships

```
handler/index.ts          ← entry point for WhatsApp messages
  → security/             ← whitelist, rate limiter, input validation
  → commands/parser.ts    ← slash command extraction (pre-LLM)
  → agent/core.ts         ← LLM orchestration loop
    → tools/registry.ts   ← 27 tools (workspace, task, github, interaction, web, browser)
    → harness/            ← CLI adapters (claude, gemini, copilot)
    → task/manager.ts     ← task lifecycle (SQLite)
    → session/manager.ts  ← conversation persistence (SQLite)
    → tools/web.ts        ← web_fetch (Readability+Turndown), web_search (SearXNG)
    → tools/browser.ts    ← browser_open, browser_snapshot, browser_action, browser_screenshot (Playwright)
  → identity/manager.ts   ← persona/system prompt assembly (hot-reload)
  → skills/manager.ts     ← skill plugins (hot-reload)
  → workspace/manager.ts  ← project discovery and git state
```

### State & Persistence

- **SQLite** — two databases: `data/sessions.db` (conversations) and `data/tasks.db` (task state machine)
- **Hot-reload via chokidar** — `data/identity/`, `data/agents/`, `data/skills/`, `data/tools/` are file-watched; changes apply without restart
- **WhatsApp session** — persisted in `data/.wwebjs_auth/`

### Identity System

System prompt is assembled dynamically from layered markdown files:
- `data/identity/COLLAR.md` — system directives
- `data/identity/ALPHA.md` — user-specific context
- `data/agents/{claude,gemini,copilot}.md` — pack member profiles (YAML frontmatter)
- `data/agents/ROUTING.md` — delegation routing rules

### Configuration

- **Required env vars**: `OPENROUTER_API_KEY`, `OWNER_PHONE_NUMBER`
- **Pipeline tuning**: 35 parameters overridable via `FETCH_*` env vars (see `docker-compose.yml` comments or `fetch-app/src/config/pipeline.ts`)
- Default LLM: `openai/gpt-4o-mini` via OpenRouter
- Harness toggles: `ENABLE_CLAUDE`, `ENABLE_GEMINI`, `ENABLE_COPILOT`
- Web/browser toggles: `ENABLE_WEB_FETCH` (default: true), `ENABLE_WEB_SEARCH` (default: true), `ENABLE_BROWSER` (default: false)

## Code Conventions

- **TypeScript strict mode** with `noUnusedLocals` and `noUnusedParameters` enforced
- **ESM throughout** — `"type": "module"` in package.json, NodeNext module resolution
- All tools implement the `OrchestratorTool` interface with Zod schemas for runtime validation
- Structured logging: `logger.info('msg', { field: value })` with section markers
- WhatsApp formatting constraints: max 4000 chars, max 40 chars per line (see `fetch-app/src/agent/format.ts`)
- Each source file has JSDoc `@fileoverview` and `@module` annotations
