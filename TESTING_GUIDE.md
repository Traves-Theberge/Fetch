# 🧪 Fetch Testing Guide

> **Last Updated:** 2025-01-20
> **Version:** 3.4.0+

---

## Prerequisites

### API Keys & Services

Fetch uses **OpenRouter** as its LLM gateway — **not** a direct OpenAI API key.

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | ✅ Yes | OpenRouter API key (`sk-or-...`) |
| `OPENROUTER_BASE_URL` | ✅ Yes | `https://openrouter.ai/api/v1` |
| `AGENT_MODEL` | ✅ Yes | Default: `openai/gpt-4.1-mini` |
| `SUMMARY_MODEL` | Optional | Compaction model (default: `openai/gpt-4o-mini`) |
| `OWNER_PHONE_NUMBER` | ✅ Yes | Your WhatsApp number (e.g., `15551234567@c.us`) |
| `OPENAI_API_KEY` | ❌ No | **Not used** — we route through OpenRouter |

### Harness Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CLAUDE` | `false` | Requires `claude` CLI installed in kennel |
| `ENABLE_GEMINI` | `false` | Requires `gemini` CLI installed in kennel |
| `ENABLE_COPILOT` | `true` | Requires valid `gh auth token` in kennel |

> **Note:** Harnesses run inside the `fetch-kennel` container. CLI tools must be
> installed and authenticated **inside** that container, not on the host.

### Docker Services

```bash
# Verify both containers are running
docker compose ps

# Expected:
# fetch-bridge   Up (healthy)
# fetch-kennel   Up
```

---

## Running Tests

### Unit Tests

```bash
cd fetch-app
npm test
```

Or specific test files:

```bash
npx vitest run tests/unit/intent.test.ts
npx vitest run tests/unit/tool-registry.test.ts
npx vitest run tests/unit/workspace-manager.test.ts
npx vitest run tests/unit/harness-adapters.test.ts
```

### Integration Tests

```bash
npx vitest run tests/integration/harness.test.ts
```

### E2E Tests

```bash
npx vitest run tests/e2e/
```

---

## WhatsApp Manual Testing

### Test Sequence: Workspace Management

These messages test the full project management flow:

| # | Send via WhatsApp | Expected Behavior |
|---|-------------------|-------------------|
| 1 | `what projects do we have?` | Should call `workspace_list` tool, return project list |
| 2 | `switch to test-api` | Should call `workspace_select`, confirm switch |
| 3 | `status` | Should call `workspace_status`, show git info |
| 4 | `yes` (after a question from Fetch) | Should execute the proposed action, not just chat |
| 5 | `create a new project called demo` | Should call `workspace_create` |
| 6 | `delete demo` | Should confirm, then call `workspace_delete` |

### Test Sequence: Conversation

| # | Send via WhatsApp | Expected Behavior |
|---|-------------------|-------------------|
| 1 | `hey fetch` | Greeting response, no tool calls |
| 2 | `what can you do?` | Capability overview |
| 3 | `how does React work?` | Conversational answer, no tools |

### Test Sequence: Task Delegation

| # | Send via WhatsApp | Expected Behavior |
|---|-------------------|-------------------|
| 1 | `switch to test-api` | Select workspace first |
| 2 | `add a health check endpoint to the server` | Should create a task, delegate to harness |
| 3 | `/tasks` | Should show active/completed tasks |

---

## Debugging

### View Bridge Logs

```bash
# Real-time logs
docker logs -f fetch-bridge

# Last 200 lines
docker logs fetch-bridge 2>&1 | tail -200

# Filter for intent classification
docker logs fetch-bridge 2>&1 | grep "Intent"

# Filter for tool calls
docker logs fetch-bridge 2>&1 | grep -E "tool|Tool"

# Filter for errors
docker logs fetch-bridge 2>&1 | grep -iE "error|fail|crash"
```

### View Kennel Logs

```bash
docker logs -f fetch-kennel
```

### Check Session State

```bash
# Session files are stored in fetch-app/data/sessions/
ls -la fetch-app/data/sessions/

# View a session's messages
cat fetch-app/data/sessions/<phone-number>.json | jq '.messages | length'
```

### Rebuild After Changes

```bash
# Rebuild bridge only (most common)
docker compose down fetch-bridge && \
docker compose build fetch-bridge && \
docker compose up -d fetch-bridge

# Rebuild both
docker compose down && \
docker compose build && \
docker compose up -d

# Rebuild TUI
cd manager && go build -o fetch-manager . && \
sudo cp fetch-manager /usr/local/bin/fetch
```

---

## Pipeline Configuration

Key tuning parameters in `fetch-app/src/config/pipeline.ts`:

| Parameter | Default | Env Override | Notes |
|-----------|---------|-------------|-------|
| `chatMaxTokens` | 512 | `FETCH_CHAT_MAX_TOKENS` | Token budget for conversation responses |
| `toolMaxTokens` | 2048 | `FETCH_TOOL_MAX_TOKENS` | Token budget for tool-calling responses |
| `maxToolCalls` | 5 | `FETCH_MAX_TOOL_CALLS` | Max tool call rounds per message |
| `historyWindow` | 20 | `FETCH_HISTORY_WINDOW` | Messages in sliding window |
| `compactionThreshold` | 40 | `FETCH_COMPACTION_THRESHOLD` | Compact when messages exceed this |
| `chatTemperature` | 0.7 | `FETCH_CHAT_TEMPERATURE` | Creativity for conversation |
| `toolTemperature` | 0.3 | `FETCH_TOOL_TEMPERATURE` | Precision for tool calls |

Override via `docker-compose.yml`:

```yaml
services:
  fetch-bridge:
    environment:
      - FETCH_TOOL_MAX_TOKENS=4096
      - FETCH_CHAT_MAX_TOKENS=1024
```

---

## Known Issues

| Issue | Status | Workaround |
|-------|--------|------------|
| `gh auth token` expired in kennel | 🟡 Open | Re-authenticate inside kennel container |
| `OPENAI_API_KEY` not set (vision) | 🟡 Open | Vision/image analysis unavailable without it |
| Chromium `SingletonLock` stale symlink | ✅ Fixed | `entrypoint.sh` cleans on startup |
| Group chat infinite loop | ✅ Fixed | `fromMe` thread-reply detection disabled |
| Tool JSON truncation (500 token limit) | ✅ Fixed | Bumped to 2048 tokens |
| "what projects do we have?" misclassified | ✅ Fixed | Workspace patterns loosened |
| "yes" always treated as conversation | ✅ Fixed | Context-aware reaction classifier |

---

## OpenRouter Model Compatibility

Fetch supports any model available on OpenRouter. Set via `AGENT_MODEL`:

```bash
# Default (recommended for tool calling)
AGENT_MODEL=openai/gpt-4.1-mini

# Alternatives
AGENT_MODEL=openai/gpt-4o
AGENT_MODEL=anthropic/claude-sonnet-4
AGENT_MODEL=google/gemini-2.0-flash-001
```

> **Important:** The model must support **function calling / tool use** for workspace
> and task features to work. Models without tool support will only handle conversation.
