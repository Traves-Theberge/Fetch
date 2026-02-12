# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fetch is the Alpha of your AI workforce — a Pack Leader that chats with you on WhatsApp, then commands specialized agents (Claude Code, Gemini, Copilot, OpenCode, Codex) to execute coding tasks inside sandboxed Docker containers. It uses a three-container architecture: **fetch-bridge** (Node.js orchestrator — "the brain"), **fetch-kennel** (Ubuntu sandbox — "the muscle"), and **searxng** (self-hosted meta search engine).

## Build & Development Commands

### Initial Setup

```bash
bash setup-dev.sh    # checks Node 20+, Go 1.21+, Docker; installs deps; builds both apps; auto-populates GH_TOKEN
```

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
npx vitest run -t "test name"         # run by test name pattern
```

Test config: globals enabled, Node environment, 30s timeout, 40% coverage threshold (statements/lines), 30% branches, 35% functions. Barrel `index.ts` files and `.d.ts` files are excluded from coverage.

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

## Architecture

### Three-Container Model

- **fetch-bridge**: Node.js orchestrator — WhatsApp client, LLM agent loop, 27 tools, SQLite persistence, whisper.cpp for voice transcription, controls kennel via `docker exec`
- **fetch-kennel**: Ubuntu sandbox — Claude Code, Gemini CLI, Copilot CLI, OpenCode, Codex, Playwright+Chromium, Python3, Go, Rust. Bridge spawns harness processes here. Workspace shared at `/workspace`
- **searxng**: Meta search engine — aggregates Google, DuckDuckGo, Bing, Wikipedia, GitHub, npm. Backend for the `web_search` tool

### Message Flow

Every WhatsApp message follows a single path — no pre-classification or intent routing:

1. **SecurityGate** (`security/gate.ts`) → whitelist + rate-limit
2. **Commands** (`commands/parser.ts`) → deterministic slash commands (`/stop`, `/undo`, `/clear`, `/help`, `/status`, `/version`, `/usage`, `/trust`) bypass LLM
3. **AgentCore** (`agent/core.ts`) → LLM receives full 27-tool set, decides to chat, call tools, or delegate
4. **Tool loop** → up to 5 rounds of tool calls per message (ReAct pattern)
5. **Harness delegation** → `task_create` spawns a CLI process in the kennel

### Key Module Map

```
handler/index.ts          ← WhatsApp message entry point (+ error sanitization, response dedup)
  → security/             ← whitelist (hot-reload), rate limiter, input validation
  → commands/parser.ts    ← slash command extraction (pre-LLM)
  → agent/core.ts         ← LLM orchestration loop + circuit breaker
    → tools/registry.ts   ← singleton registry, Zod validation, OpenAI format export
    → harness/executor.ts ← spawns CLI processes, streams output, detects events
    → harness/spawner.ts  ← wraps commands with `docker exec` for kennel execution
    → task/manager.ts     ← task state machine (SQLite)
    → session/manager.ts  ← conversation persistence + message compaction (SQLite)
    → tools/web.ts        ← web_fetch (Readability+Turndown), web_search (SearXNG)
    → tools/browser.ts    ← Playwright browser automation (persistent browser-agent.mjs in kennel)
  → identity/manager.ts   ← system prompt assembly from layered markdown (hot-reload)
  → skills/manager.ts     ← skill plugins (hot-reload)
  → workspace/manager.ts  ← project discovery, git state, repo-map generation
    → workspace/profiler.ts ← framework, pkg manager, test runner, entry point detection
    → workspace/symbols.ts  ← symbol extraction for TS, Python, Go, Rust, Java, Ruby, PHP, .NET
    → agent/notifications.ts ← hybrid LLM/template notification formatter
```

### Tool System

All 27 tools implement the `OrchestratorTool` interface (`tools/types.ts`):
- Zod schema for runtime input validation (`validation/tools.ts` defines all schemas)
- Handler returns `ToolResult` with `success`, `output` (narrative text for LLM), `summary`, `error`, `duration`, `metadata` (structured data for state sync)
- `DangerLevel` enum: `SAFE`, `MODERATE`, `DANGEROUS`
- Registry exports tools in OpenAI function-calling format for the LLM
- Custom tools hot-loaded from `data/tools/*.json` — schema auto-built, shell commands executed

Tool files: `workspace.ts` (7), `task.ts` (4), `interaction.ts` (2), `github.ts` (8), `web.ts` (2), `browser.ts` (4)

### Harness System (AI Agent Execution)

Adapters implement `HarnessAdapter` interface: `buildConfig`, `parseOutputLine`, `detectQuestion`, `formatResponse`, `extractSummary`, `extractFileOperations`. Concrete adapters: `claude.ts`, `gemini.ts`, `copilot.ts`, `opencode.ts`, `codex.ts` — all extend `base.ts`.

Execution: executor gets adapter → adapter builds config → spawner wraps with `docker exec -w <cwd> fetch-kennel <command>` → streams stdout/stderr → output parser detects questions/progress/completion → returns `HarnessResult`.

Per-CLI instruction templates live in `data/cli-configs/`: `CLAUDE.md`, `GEMINI.md`, `copilot-instructions.md`, `OPENCODE.md`, `CODEX.md`.

### Task State Machine

```
pending → running → completed
              ↓          ↑
        waiting_input ───┘
              ↓
           failed → cancelled
```

Events: `task:created`, `task:started`, `task:progress`, `task:question`, `task:completed`, `task:failed`, `task:cancelled`. Task IDs: `tsk_{nanoid(10)}`.

### Identity & Skills

- **Identity** — assembled from `data/identity/COLLAR.md` (core personality + system directives) + `data/identity/ALPHA.md` (user profile + relationship model). Hot-reloaded via chokidar.
- **Builtin skills** — `src/skills/builtin/`: `debugging`, `docker`, `fetch-meta`, `git`, `react`, `testing`, `typescript`. Each has a `SKILL.md` with frontmatter (name, description, triggers).
- **Custom skills** — hot-loaded from `data/skills/`

### State & Persistence

- **SQLite** — `data/sessions.db` (conversations) and `data/tasks.db` (task lifecycle)
- **Hot-reload via chokidar** — `data/identity/`, `data/skills/`, `data/tools/`, `data/whitelist.json` watched; changes apply without restart

### Handler Safety Mechanisms

- **Error sanitization** (`handler/index.ts`) — strips API keys/tokens, file paths, stack traces from errors before sending to WhatsApp (capped at 200 chars)
- **Response deduplication** — byte-level repetition detection (30+ char repeated sequences) and sentence-level dedup to catch LLM loops
- **Whitelist** — `data/whitelist.json` hot-reloaded; owner auto-trusted; `/trust` command for runtime management

### Configuration

- **Required env vars**: `OPENROUTER_API_KEY`, `OWNER_PHONE_NUMBER`
- **Pipeline tuning**: 42 parameters via `FETCH_*` env vars (see `config/pipeline.ts`)
- Default LLM: `openai/gpt-4o-mini` via OpenRouter (for agent reasoning, NOT the harness CLIs)
- Harness toggles: `ENABLE_CLAUDE`, `ENABLE_GEMINI`, `ENABLE_COPILOT`, `ENABLE_OPENCODE`, `ENABLE_CODEX`
- Harness auth: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENCODE_API_KEY`, `CODEX_API_KEY`, `GH_TOKEN`
- Web/browser toggles: `ENABLE_WEB_FETCH`, `ENABLE_WEB_SEARCH`, `ENABLE_BROWSER`
- Voice: whisper.cpp (free, local, no API)
- `OPENAI_API_KEY` is only used as a fallback for Codex harness

### Go TUI (manager)

Single-file `main.go` with 9 screens: splash, menu, config (Settings with General/Advanced tabs), logs, status (polls bridge `/api/status`), setup (QR code display), version, whitelist, harnessAuth (unified harness management — auth + enable + API key + model).

### Docker Limits

- Bridge/Kennel: 2GB memory, 2 CPUs each
- SearXNG: 512MB memory, 1 CPU
- Port 8765: status API (bridge), Port 8888: SearXNG
- Healthchecks: bridge uses `/api/status`, kennel uses `/tmp/kennel-ready`
- Bridge entrypoint cleans stale Chromium lock files; kennel entrypoint configures git/gh auth from `GH_TOKEN`

## Code Conventions

- **TypeScript strict mode** — `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch` all enforced. Target: ES2022, Module: NodeNext
- **ESM throughout** — `"type": "module"`, NodeNext resolution. All imports require `.js` extensions (e.g., `import { foo } from './bar.js'`)
- **Zod for all runtime validation** — tool inputs, env vars (`config/env.ts`), pipeline config
- **Structured logging** — `logger.info('msg', { field: value })` via `utils/logger.ts`. Section headers with `====` markers
- **File documentation** — each source file has JSDoc `@fileoverview` and `@module` annotations
- **WhatsApp formatting** — max 4000 chars, max 40 chars per line (see `agent/format.ts`)
- **ID generation** — nanoid with prefixes: `tsk_` (tasks), `prg_` (progress) via `utils/id.ts`
- **Unused vars** — prefix with `_` to satisfy ESLint (`argsIgnorePattern: '^_'`, `varsIgnorePattern: '^_'`, `caughtErrorsIgnorePattern: '^_'`)
- **`no-explicit-any`** — warn, not error
- **Barrel exports** — each major module has an `index.ts` re-exporting its public API
- **Singleton pattern** — ToolRegistry, SessionManager, TaskManager, IdentityManager, SkillManager

### Key Design Patterns

- **Circuit breaker** (`agent/core.ts`) — tracks consecutive errors per session, opens after threshold with backoff
- **Message compaction** (`session/manager.ts`) — auto-summarizes old messages to save tokens
- **Event emitter** — HarnessExecutor and TaskIntegration use pub/sub for async updates
- **Docker exec wrapping** (`harness/spawner.ts`) — bridge controls kennel processes without SSH

### Test Structure

```
fetch-app/tests/
  unit/           ← tool-registry, security, harness-adapters, workspace, identity, session, task, handler, web, browser, pipeline, context
  integration/    ← agent-loop, harness, task-execution, task-flow
  helpers/        ← mock-session.ts, mock-harness.ts, index.ts
```
