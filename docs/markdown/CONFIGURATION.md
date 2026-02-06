# 🐕 Fetch — Configuration Reference

> Complete reference for all configuration options: environment variables, Docker Compose,
> identity files, skill definitions, tool definitions, polling config, and path resolution.

---

## Table of Contents

1. [Environment Variables](#1-environment-variables)
2. [Docker Compose Configuration](#2-docker-compose-configuration)
3. [Identity Files](#3-identity-files)
4. [Skill Definitions](#4-skill-definitions)
5. [Tool Definitions](#5-tool-definitions)
6. [Polling Configuration](#6-polling-configuration)
7. [Path Resolution](#7-path-resolution)

---

## 1. Environment Variables

All environment variables are set in the `.env` file at the project root.

### 1.1 Required

| Variable | Description | Example |
|----------|-------------|---------|
| `OWNER_PHONE_NUMBER` | Your WhatsApp number. Country code, no `+`, no spaces, no dashes. | `15551234567` |
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM orchestration. Get one at [openrouter.ai/keys](https://openrouter.ai/keys). | `sk-or-v1-abc...` |

### 1.2 LLM Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MODEL` | `openai/gpt-4o-mini` | OpenRouter model ID for orchestration (intent classification, tool calling, reasoning). |
| `SUMMARY_MODEL` | `openai/gpt-4o-mini` | Model for conversation summarization. Can be cheaper/faster than AGENT_MODEL. |

### 1.3 Harness Toggles

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CLAUDE` | `false` | Enable Claude Code CLI harness. Requires `claude` CLI authenticated in Kennel. |
| `ENABLE_GEMINI` | `false` | Enable Gemini CLI harness. Requires `gemini` CLI authenticated in Kennel. |
| `ENABLE_COPILOT` | `true` | Enable GitHub Copilot CLI harness. Requires `gh copilot` authenticated in Kennel. |

### 1.4 API Keys (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | _(empty)_ | Not required when using OpenRouter. Only needed for direct OpenAI API access. |
| `ANTHROPIC_API_KEY` | _(empty)_ | For direct Anthropic API access (bypassing OpenRouter). |
| `GEMINI_API_KEY` | _(empty)_ | For direct Google Gemini API access (bypassing OpenRouter). |

### 1.5 Security

| Variable | Default | Description |
|----------|---------|-------------|
| `TRUSTED_PHONE_NUMBERS` | _(empty)_ | Comma-separated phone numbers allowed to use `@fetch`. Owner is always trusted. |

### 1.6 System

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error`. |
| `PORT` | `8765` | Port for the Status API and documentation server. |
| `TZ` | `UTC` | Timezone for logging and scheduled tasks. |
| `DATA_DIR` | `/app/data` (Docker) | Override the data directory path. See [Path Resolution](#7-path-resolution). |
| `NODE_ENV` | `production` | Node.js environment. Set to `development` for extra logging. |

### 1.7 Complete .env Example

```dotenv
# === Required ===
OWNER_PHONE_NUMBER=15551234567
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# === LLM Models ===
AGENT_MODEL=openai/gpt-4o-mini
SUMMARY_MODEL=openai/gpt-4o-mini

# === Harness Toggles ===
ENABLE_COPILOT=true
ENABLE_CLAUDE=false
ENABLE_GEMINI=false

# === Security ===
TRUSTED_PHONE_NUMBERS=15559876543,15551112222

# === System ===
LOG_LEVEL=info
PORT=8765
TZ=America/New_York
```

---

## 2. Docker Compose Configuration

### 2.1 Service: fetch-bridge

```yaml
fetch-bridge:
  build:
    context: .
    dockerfile: fetch-app/Dockerfile
  container_name: fetch-bridge
  restart: unless-stopped
  ports:
    - "${PORT:-8765}:8765"        # Status API + Documentation
  volumes:
    - ./data:/app/data             # Persistent data (sessions, identity, skills)
    - /var/run/docker.sock:/var/run/docker.sock:ro  # Container management
  env_file: .env
  depends_on:
    - fetch-kennel
```

**Key points:**
- Port mapping uses `PORT` env var with 8765 default
- Docker socket is read-only — Bridge can exec into Kennel but can't modify host Docker
- `./data` mount contains all persistent state

### 2.2 Service: fetch-kennel

```yaml
fetch-kennel:
  build:
    context: .
    dockerfile: kennel/Dockerfile
  container_name: fetch-kennel
  restart: unless-stopped
  volumes:
    - ./workspace:/workspace                        # Code sandbox
    - ./config/github:/root/.config/gh:ro          # GitHub CLI auth (read-only)
    - ./config/claude:/root/.config/claude:ro      # Claude CLI auth (read-only)
  deploy:
    resources:
      limits:
        memory: 2G
        cpus: '2'
  stdin_open: true
  tty: true
```

**Key points:**
- Auth configs are read-only — Kennel can use them but not modify
- Resource limits prevent runaway AI processes
- `stdin_open` + `tty` enable interactive CLI sessions via Docker exec

### 2.3 Resource Tuning

| Setting | Default | Recommended for Heavy Use |
|---------|---------|---------------------------|
| Kennel memory | 2 GB | 4 GB |
| Kennel CPUs | 2 | 4 |
| Bridge memory | (unlimited) | 1 GB |

Adjust in `docker-compose.yml` under `deploy.resources.limits`.

---

## 3. Identity Files

Identity files live in `data/identity/` and are hot-reloaded on change.

### 3.1 COLLAR.md — Core Identity

Defines Fetch's personality, directives, and communication protocols.

**Required sections:**

| Section | Maps To | Description |
|---------|---------|-------------|
| `## Core Identity` | `identity.name`, `.role`, `.emoji`, `.voice.tone` | Basic profile fields |
| `## Directives` | `identity.directives.*` | Behavioral rules |
| `### Primary Directives` | `identity.directives.primary[]` | Unbreakable rules |
| `### Operational Guidelines` | `identity.directives.secondary[]` | How to work |
| `### Behavioral Traits` | `identity.directives.behavioral[]` | Personality |
| `## Communication Style` | `identity.directives.secondary[]` | Tone and formatting |
| `## Instincts` | `identity.directives.behavioral[]` | Automatic behaviors |

**Format for Core Identity:**

```markdown
## Core Identity
- **Name:** Fetch
- **Role:** Autonomous Software Engineering Orchestrator
- **Emoji:** 🐕
- **Voice:** Confident, concise, warm
```

**Format for Directives:**

```markdown
## Directives

### Primary Directives (Unbreakable Rules)
1. Never execute destructive operations without confirmation.
2. Never hallucinate file contents or command outputs.

### Operational Guidelines (How to Work)
1. Check workspace status before creating tasks.
2. Keep responses WhatsApp-sized (2-6 lines).

### Behavioral Traits (Personality)
1. Eager but disciplined.
2. Loyal to a fault.
```

### 3.2 ALPHA.md — Owner Profile

Defines the owner's name and preferences.

**Required sections:**

| Section | Maps To | Description |
|---------|---------|-------------|
| `## User Profile` or `## Administrator` | `identity.context.owner` | Owner name extracted from `- **Name:** value` |

**Format:**

```markdown
## User Profile
- **Name:** Traves
- **Role:** Developer & Project Lead
```

### 3.3 Agent Sub-Files — Pack Registry (`data/agents/*.md`)

> **Migrated in v3.2.0:** The monolithic `data/identity/AGENTS.md` is deprecated.
> Each pack member now has its own file in `data/agents/` with YAML frontmatter.
> Routing rules live in `data/agents/ROUTING.md`.

Defines harness members as individual Markdown files parsed by `gray-matter`.

**File structure:** `data/agents/{claude,gemini,copilot}.md`

**YAML frontmatter fields (→ `PackMember` interface):**

| Field | Type | Maps To | Example |
|-------|------|---------|--------|
| `name` | string | `pack[].name` | `Claude` |
| `emoji` | string | `pack[].emoji` | `🦉` |
| `harness` | string | `pack[].harness` | `claude` |
| `cli` | string | `pack[].cli` | `claude` |
| `title` | string | `pack[].title` | `The Sage` |
| `role` | string | `pack[].role` | `Architect / Complex Problem Solver` |
| `strengths` | string[] | `pack[].strengths` | `["Massive context window", ...]` |
| `weaknesses` | string[] | `pack[].weaknesses` | `["Slower response time", ...]` |
| `bestFor` | string[] | `pack[].bestFor` | `["Multi-file refactoring", ...]` |
| `avoidFor` | string[] | `pack[].avoidFor` | `["Quick one-line fixes", ...]` |
| `personality` | string | `pack[].personality` | `Calm, wise, thorough` |

**Example file** (`data/agents/claude.md`):

```markdown
---
name: Claude
emoji: "🦉"
harness: claude
cli: claude
title: The Sage
role: Architect / Complex Problem Solver / Multi-file Refactorer
strengths:
  - Massive context window (200K tokens)
  - Deep reasoning chains
weaknesses:
  - Slower response time
  - Can be verbose
bestFor:
  - Refactoring across 5+ files simultaneously
  - Architectural decisions
avoidFor:
  - Quick one-line fixes
  - Formatting-only changes
personality: "Calm, wise, thorough. Takes time to think but delivers high-quality results."
---

# Claude — The Sage 🦉

(Optional body content for human reference — not parsed by the loader.)
```

**Routing rules** (`data/agents/ROUTING.md`): Contains the general routing logic
for when to select each harness. Injected into the system prompt as-is.

---

## 4. Skill Definitions

Skills are defined in `SKILL.md` files with YAML frontmatter.

### 4.1 Locations

| Location | Type | Hot-Reloaded |
|----------|------|--------------|
| `fetch-app/src/skills/builtin/<name>/SKILL.md` | Built-in | No (bundled in Docker image) |
| `data/skills/<name>/SKILL.md` | User-defined | ✅ Yes |

### 4.2 SKILL.md Format

```markdown
---
name: My Skill
description: What this skill does
version: 1.0.0
triggers:
  - keyword1
  - keyword2
  - phrase trigger
requirements:
  binaries:
    - node
    - npm
  envVars:
    - API_KEY
  platform:
    - linux
    - darwin
enabled: true
---

# Skill Instructions

Your specialized prompt content here. This entire section
(everything below the frontmatter) is injected into the
system prompt when the skill is activated.
```

### 4.3 Frontmatter Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | ✅ | — | Display name |
| `description` | string | ✅ | — | Short description |
| `version` | string | No | `1.0.0` | Semantic version |
| `triggers` | string[] | No | `[]` | Keywords that activate this skill |
| `requirements.binaries` | string[] | No | — | Required CLI tools |
| `requirements.envVars` | string[] | No | — | Required environment variables |
| `requirements.platform` | string[] | No | — | OS restrictions (`linux`, `darwin`, `win32`) |
| `enabled` | boolean | No | `true` | Whether the skill is active |

---

## 5. Tool Definitions

Custom tools are JSON files in `data/tools/`. Hot-reloaded on change.

### 5.1 Tool JSON Format

```json
{
  "name": "deploy_staging",
  "description": "Deploy the current project to the staging environment",
  "command": "bash /workspace/scripts/deploy.sh {{environment}}",
  "cwd": "/workspace",
  "danger": "dangerous",
  "timeout": 300000,
  "parameters": [
    {
      "name": "environment",
      "type": "string",
      "description": "Target environment (staging, production)",
      "required": true,
      "enum": ["staging", "production"]
    }
  ]
}
```

### 5.2 Tool Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | ✅ | — | Tool name (snake_case, used in LLM function calling) |
| `description` | string | ✅ | — | What the tool does (shown to LLM) |
| `command` | string | ✅ | — | Shell command to execute. Use `{{param}}` for parameter substitution. |
| `cwd` | string | No | `/workspace` | Working directory for command execution |
| `danger` | string | No | `safe` | Danger level: `safe`, `moderate`, `dangerous` |
| `timeout` | number | No | `300000` | Timeout in milliseconds (default: 5 minutes) |
| `parameters` | array | No | `[]` | Parameter definitions for the tool |

### 5.3 Parameter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Parameter name |
| `type` | string | ✅ | Type: `string`, `number`, `boolean` |
| `description` | string | ✅ | Description (shown to LLM) |
| `required` | boolean | No | Whether the parameter is required (default: false) |
| `enum` | string[] | No | Allowed values |
| `default` | any | No | Default value if not provided |

---

## 6. Polling Configuration

Polling tasks are defined in `data/POLLING.md`. Hot-reloaded on change.

### 6.1 Format

```markdown
# Polling Configuration

## Tasks

### Git Status Check
- **Schedule:** */5 * * * *
- **Command:** git status --porcelain
- **Workspace:** my-api
- **Notify:** true

### Health Check
- **Schedule:** 0 */1 * * *
- **Command:** curl -s http://localhost:3000/health
- **Notify on failure:** true
```

### 6.2 Schedule Format

Uses standard cron syntax parsed by `cron-parser`:

```
┌────────── minute (0-59)
│ ┌──────── hour (0-23)
│ │ ┌────── day of month (1-31)
│ │ │ ┌──── month (1-12)
│ │ │ │ ┌── day of week (0-7, 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

| Pattern | Meaning |
|---------|---------|
| `*/5 * * * *` | Every 5 minutes |
| `0 */1 * * *` | Every hour |
| `0 9 * * 1-5` | 9 AM weekdays |
| `0 0 * * *` | Midnight daily |

---

## 7. Path Resolution

### 7.1 Centralized Path Config

All data paths are resolved through `fetch-app/src/config/paths.ts`:

```typescript
// Resolution chain (first existing directory wins):
// 1. DATA_DIR environment variable
// 2. /app/data (Docker WORKDIR default)
// 3. ./data (project root)
// 4. ../data (from fetch-app/ directory)
```

### 7.2 Exported Paths

| Export | Resolves To | Purpose |
|--------|-------------|---------|
| `DATA_DIR` | `data/` | Base data directory |
| `IDENTITY_DIR` | `data/identity/` | COLLAR.md, ALPHA.md |
| `AGENTS_DIR` | `data/agents/` | Pack member sub-files (claude.md, gemini.md, copilot.md, ROUTING.md) |
| `SKILLS_DIR` | `data/skills/` | User-defined skills |
| `TOOLS_DIR` | `data/tools/` | Custom tool JSON files |
| `POLLING_FILE` | `data/POLLING.md` | Polling configuration |
| `SESSIONS_DB` | `data/sessions.db` | Session persistence |
| `TASKS_DB` | `data/tasks.db` | Task persistence |

### 7.3 Docker vs Local Development

| Environment | `DATA_DIR` | Resolution |
|-------------|-----------|------------|
| Docker | `/app/data` | Volume mount `./data:/app/data` |
| Local (from fetch-app/) | `../data` | Relative path to project root |
| Local (from project root) | `./data` | Direct path |
| Custom | `$DATA_DIR` | Environment variable override |

**Why this matters:** Before centralized paths, each module resolved paths independently using `path.resolve(process.cwd(), '../data/...')`. In Docker (`WORKDIR=/app`), `../data` resolves to `/data/` (outside the container's app directory). The centralized resolver detects Docker by checking if `/app/data` exists.

---

*Configuration Reference for Fetch v3.2.0*
