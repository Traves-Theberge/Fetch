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
| `AGENT_MODEL` | string | `openai/gpt-4.1-nano` | LLM model for agent reasoning and tool use |
| `SUMMARY_MODEL` | string | `openai/gpt-4.1-nano` | LLM model for conversation summarization |
| `VISION_MODEL` | string | `openai/gpt-4.1-nano` | LLM model for image/screenshot analysis |
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

### Env Proxy Pattern

Environment variables are accessed via a Proxy object that reads `process.env` on every access (not snapshotted at import time). This ensures test overrides work correctly:

```typescript
import { env } from '../config/env.js';

// Reads process.env.AGENT_MODEL live, with Zod-validated defaults
const model = env.AGENT_MODEL; // 'openai/gpt-4.1-nano'
```

---

## Docker Compose

The `docker-compose.yml` defines two services:

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
  - ~/.config/claude-code:/root/.config/claude-code:ro  # Claude auth
  - ~/.gemini:/root/.gemini:ro       # Gemini auth
deploy:
  resources:
    limits:
      memory: 2G
      cpus: "2"
command: tail -f /dev/null          # Keep alive for docker exec
```

---

## Identity Files

Fetch's personality is defined by hot-reloaded Markdown files.

### data/identity/COLLAR.md — System Instructions

Core behavioral rules for the agent. This is injected as the foundation of the system prompt. Modify to change Fetch's personality, tone, and behavioral constraints.

### data/identity/ALPHA.md — Owner Info

Information about the owner (you). Communication preferences, timezone, technical level. The agent uses this to personalize responses.

### data/agents/*.md — Pack Profiles

Individual agent profiles with YAML frontmatter:

```markdown
---
name: Claude
alias: The Sage
emoji: "🦉"
harness: claude
cli: claude
role: Architect / Complex Problem Solver
fallback_priority: 1
triggers:
  - refactor
  - architect
  - multi-file
avoid:
  - quick fix
  - one-liner
---

Claude is the deep thinker of the pack...
```

Each file defines a `PackMember` with routing triggers and capabilities. The Identity Manager watches this directory and hot-reloads on changes.

---

## Skills

Skills are Markdown files in `data/skills/` that teach Fetch domain-specific capabilities.

### Skill File Format

```markdown
---
name: React Development
description: Best practices for React component development
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

```
/skill list              # Show all skills
/skill enable <name>     # Enable a skill
/skill disable <name>    # Disable a skill
```

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
| `DB_PATH` | `./data/sessions.db` | Sessions SQLite database |
| `TASKS_DB_PATH` | `./data/tasks.db` | Tasks SQLite database |
| `IDENTITY_DIR` | `./data/identity` | Identity files |
| `AGENTS_DIR` | `./data/agents` | Pack agent profiles |
| `SKILLS_DIR` | `./data/skills` | Skill definitions |
| `TOOLS_DIR` | `./data/tools` | Custom tool definitions |
| `WHISPER_BIN` | `/usr/local/bin/whisper` | Whisper binary path |
