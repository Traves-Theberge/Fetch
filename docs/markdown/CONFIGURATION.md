# Configuration

## Environment Variables

All environment variables are validated at startup by a Zod schema in `src/config/env.ts`. Invalid or missing required values cause an immediate exit with a clear error message.

### Required

| Variable | Type | Description |
|----------|------|-------------|
| `OPENROUTER_API_KEY` | string | API key from [OpenRouter](https://openrouter.ai) |
| `OWNER_PHONE_NUMBER` | string | Your WhatsApp number in E.164 format (e.g. `15551234567`) |

### Optional (with defaults)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AGENT_MODEL` | string | `openai/gpt-4o-mini` | LLM model for agent reasoning and tool use |
| `SUMMARY_MODEL` | string | `openai/gpt-4o-mini` | LLM model for conversation summarization |
| `VISION_MODEL` | string | `openai/gpt-4o-mini` | LLM model for image/screenshot analysis |
| `WHISPER_MODEL` | string | `/app/models/ggml-tiny.bin` | Path to whisper.cpp model for voice transcription |
| `WORKSPACE_ROOT` | string | `/workspace` | Root directory for project workspaces |
| `LOG_LEVEL` | enum | `debug` | Minimum log level: `debug`, `info`, `warn`, `error` |

### Optional (no default)

| Variable | Type | Description |
|----------|------|-------------|
| `DATA_DIR` | string | Override data directory (default: `./data`) |
| `DATABASE_PATH` | string | Override sessions database path |
| `TASKS_DB_PATH` | string | Override tasks database path |
| `ADMIN_TOKEN` | string | Bearer token for `/api/logout`. Auto-generated if not set |
| `TRUSTED_PHONE_NUMBERS` | string | Comma-separated phone numbers for initial whitelist |
| `GH_TOKEN` | string | GitHub personal access token for workspace sync and repo creation. |
| `ANTHROPIC_API_KEY` | string | API key for Claude Code harness (if used) |
| `GEMINI_API_KEY` | string | API key for Gemini CLI harness (if used) |
| `OPENCODE_API_KEY` | string | API key for OpenCode harness (or uses OpenRouter key) |
| `CODEX_API_KEY` | string | API key for Codex harness (alternative to `codex login` OAuth; or uses `OPENAI_API_KEY`) |
| `OPENAI_API_KEY` | string | Fallback API key for Codex harness if `CODEX_API_KEY` is not set |

### Harness Selection (Feature Flags)

Fetch defaults to using **GitHub Copilot** as the primary harness. You can enable others via these flags:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_COPILOT` | boolean | `true` | Enable the GitHub Copilot CLI harness |
| `ENABLE_CLAUDE` | boolean | `false` | Enable the Claude Code harness |
| `ENABLE_GEMINI` | boolean | `false` | Enable the Gemini CLI harness |
| `ENABLE_OPENCODE` | boolean | `false` | Enable the OpenCode harness |
| `ENABLE_CODEX` | boolean | `false` | Enable the Codex harness |

### Web & Browser Feature Flags

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_WEB_FETCH` | boolean | `true` | Enable the `web_fetch` tool (URL content extraction) |
| `ENABLE_WEB_SEARCH` | boolean | `true` | Enable the `web_search` tool (requires SearXNG container) |
| `ENABLE_BROWSER` | boolean | `false` | Enable browser automation tools (requires Playwright in Kennel) |

### Harness Model Configuration

By default, AI harnesses use their respective defaults. You can override them using these optional variables:

| Variable | Type | Description |
|----------|------|-------------|
| `COPILOT_MODEL` | string | Override model for GitHub Copilot CLI (e.g. `gpt-4`) |
| `CLAUDE_MODEL` | string | Override model for Claude Code CLI (e.g. `claude-3-5-sonnet-20241022`) |
| `GEMINI_MODEL` | string | Override model for Gemini CLI (e.g. `gemini-1.5-pro`) |
| `OPENCODE_MODEL` | string | Override model for OpenCode (e.g. `openrouter/anthropic/claude-sonnet-4-5`) |
| `CODEX_MODEL` | string | Override model for Codex (e.g. `o4-mini`) |

> [!IMPORTANT]
> **Ambiguous Selection:** If more than one agent is enabled and you don't explicitly specify an agent (e.g., "use claude to..."), Fetch will prompt you to choose an agent before starting the task. If only one agent is enabled, it is selected automatically.

### Pipeline Tuning (FETCH_* Variables)

The context pipeline is configured via `config/pipeline.ts` with 42 tunable parameters. All are overridable via `FETCH_*` environment variables. Key parameters:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `FETCH_HISTORY_WINDOW` | int | `20` | Messages in the LLM sliding window |
| `FETCH_COMPACTION_THRESHOLD` | int | `40` | Compact when total messages exceed this |
| `FETCH_COMPACTION_MAX_TOKENS` | int | `500` | Max tokens for compaction summaries |
| `FETCH_COMPACTION_MODEL` | string | `SUMMARY_MODEL` | Model for compaction (cheap + fast) |
| `FETCH_MAX_TOOL_CALLS` | int | `5` | Max tool call rounds per message |
| `FETCH_TOOL_MAX_TOKENS` | int | `2048` | Token budget for LLM responses |
| `FETCH_TOOL_TEMPERATURE` | float | `0.3` | Temperature for LLM responses |
| `FETCH_FRAME_MAX_TOKENS` | int | `200` | Token budget for task framing prompt |
| `FETCH_SEARXNG_URL` | string | `http://searxng:8080` | SearXNG instance URL for web_search |
| `FETCH_WEB_FETCH_MAX_LENGTH` | int | `50000` | Max content length for web_fetch (chars) |
| `FETCH_BROWSER_TIMEOUT` | int | `30000` | Browser automation timeout (ms) |
| `FETCH_CONTEXT_BUDGET` | int | `6000` | Token budget for system prompt (estimated via chars/4) |
| `FETCH_RECALL_LIMIT` | int | `5` | Max recalled memory entries injected into context |
| `FETCH_RECALL_SNIPPET_TOKENS` | int | `300` | Max tokens per recalled snippet |
| `FETCH_RECALL_DECAY` | float | `0.1` | Recency decay factor (higher = faster decay) |
| `FETCH_TOOL_RESULT_MAX_PERSIST` | int | `2000` | Max chars for tool results persisted in session history |
| `FETCH_NOTIFICATION_MODEL` | string | `SUMMARY_MODEL` | Model for LLM-generated notifications (cheap + fast) |
| `FETCH_NOTIFICATION_MAX_TOKENS` | int | `150` | Max tokens for notification LLM responses |
| `FETCH_NOTIFICATION_TEMPERATURE` | float | `0.7` | Temperature for notification LLM responses |

These can also be tuned via the TUI Manager's Pipeline Tuning section.

### Env Proxy Pattern

Environment variables are accessed via a Proxy object that reads `process.env` on every access (not snapshotted at import time). This ensures test overrides work correctly:

```typescript
import { env } from '../config/env.js';

// Reads process.env.AGENT_MODEL live, with Zod-validated defaults
const model = env.AGENT_MODEL; // 'openai/gpt-4o-mini'
```

---

## Docker Compose

The `docker-compose.yml` defines three services:

### fetch-bridge

```yaml
build: ./fetch-app
ports:
  - "8765:8765"           # Status API
volumes:
  - ./data:/app/data      # Persistent data (SQLite, WhatsApp auth, identity)
  - /var/run/docker.sock:/var/run/docker.sock:ro  # For docker exec into kennel
  - ./workspace:/workspace # Shared workspace
depends_on:
  - fetch-kennel
```

### fetch-kennel

```yaml
build: ./kennel
volumes:
  - ./workspace:/workspace           # Shared workspace (read-write)
  - ~/.config/gh:/root/.config/gh:ro # GitHub Copilot auth (read-only)
  - ~/.config/claude-code:/root/.config/claude-code:ro  # Claude Code config
  - ~/.claude:/root/.claude:ro       # Claude OAuth tokens
  - ~/.gemini:/root/.gemini           # Gemini auth (read-write)
  - ~/.config/opencode:/root/.config/opencode:ro  # OpenCode auth
  - ~/.codex:/root/.codex:ro         # Codex OAuth auth (auth.json)
environment:
  - GH_TOKEN=${GH_TOKEN}            # GitHub token for workspace sync
deploy:
  resources:
    limits:
      memory: 2G
      cpus: "2"
entrypoint: /entrypoint.sh           # Configures gh auth + git identity from GH_TOKEN
command: tail -f /dev/null            # Keep alive for docker exec
```

> **Kennel Entrypoint:** The Kennel container has a custom entrypoint (`kennel/entrypoint.sh`) that checks for `GH_TOKEN`, configures `gh` CLI authentication, and sets the git identity to match the GitHub account. This enables `workspace_sync` and `workspace_create` to push to GitHub automatically.

### searxng

```yaml
image: searxng/searxng:latest
ports:
  - "8888:8080"            # Web search API
volumes:
  - ./config/searxng:/etc/searxng  # SearXNG configuration
deploy:
  resources:
    limits:
      memory: 512M
      cpus: "1"
```

> **SearXNG** is a self-hosted meta search engine that aggregates results from Google, DuckDuckGo, Bing, Wikipedia, GitHub, StackOverflow, and npm. It provides the backend for the `web_search` tool. Configuration is in `config/searxng/settings.yml`.

---

## Identity Files

Fetch's personality is defined by hot-reloaded Markdown files.

### data/identity/COLLAR.md — System Instructions

Core behavioral rules for the agent. This is injected as the foundation of the system prompt. Modify to change Fetch's personality, tone, and behavioral constraints.

### data/identity/ALPHA.md — Owner Info

Information about the owner (you). Communication preferences, timezone, technical level. The agent uses this to personalize responses.

### data/cli-configs/ — CLI Instruction Templates

Per-harness instruction files injected into each CLI agent when spawned:

| File | CLI | Injection |
|------|-----|-----------|
| `CLAUDE.md` | Claude Code | `--append-system-prompt` arg |
| `GEMINI.md` | Gemini CLI | `GEMINI_SYSTEM_MD` env var |
| `copilot-instructions.md` | Copilot CLI | `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` env var |
| `OPENCODE.md` | OpenCode | `OPENCODE_SYSTEM_PROMPT` env var |
| `CODEX.md` | Codex | Goal passed as positional argument; `--cd` sets working directory |

These tell each CLI it's running inside the Fetch Kennel and should output structured change summaries.

---

## Skills

Skills are Markdown files in `data/skills/` that teach Fetch domain-specific capabilities.

### Skill File Format

```markdown
---
name: React Development
description: Best practices for React component development
harnessHint: claude
triggers:
  - react
  - component
  - jsx
  - hook
enabled: true
---

## Instructions

When working on React components:
1. Use functional components with hooks
2. ...
```

### Discovery and Activation

- **Discovery:** All skills are listed in the system prompt as `<available_skills>` with name, description, and triggers
- **Activation:** When a message matches a skill's triggers, the full instruction body is injected as `<activated_skill>` into the LLM context

### Managing Skills

Skills are managed through natural language:

- "What skills do you have?" — Lists all skills with enabled/disabled status
- "Enable the React skill" — Activates a skill
- "Disable the Python skill" — Deactivates a skill

---

## Custom Tools

Define custom tools in `data/tools/` as JSON files:

```json
{
  "name": "deploy_staging",
  "description": "Deploy current project to staging",
  "command": "cd /workspace/{{project}} && npm run deploy:staging",
  "parameters": {
    "project": {
      "type": "string",
      "description": "Project to deploy",
      "required": true
    }
  },
  "dangerLevel": "high"
}
```

Parameters are shell-escaped before substitution to prevent injection.

---

## Path Resolution

All paths are centralized in `src/config/paths.ts`:

| Constant | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `./data` | Persistent data root |
| `SESSIONS_DB` | `./data/sessions.db` | Sessions SQLite database |
| `TASKS_DB_PATH` | `./data/tasks.db` | Tasks SQLite database |
| `IDENTITY_DIR` | `./data/identity` | Identity files |
| `AGENTS_DIR` | `./data/agents` | Legacy pack profiles directory (unused) |
| `SKILLS_DIR` | `./data/skills` | Skill definitions |
| `TOOLS_DIR` | `./data/tools` | Custom tool definitions |
| `WHISPER_BIN` | `/usr/local/bin/whisper-cpp` | Whisper binary path |
