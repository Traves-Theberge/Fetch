# 🧪 Fetch Testing & Validation Guide

> **Last Updated:** 2025-02-07
> **Version:** 3.4.0+ (post-whitelist-fix)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Automated Tests](#automated-tests)
3. [Validation Checklist](#validation-checklist)
4. [Test Walkthroughs](#test-walkthroughs)
   - [A. Security & Auth](#a-security--auth)
   - [B. Slash Commands](#b-slash-commands)
   - [C. AI Tools (LLM-invoked)](#c-ai-tools-llm-invoked)
   - [D. @fetch Trigger & Routing](#d-fetch-trigger--routing)
   - [E. Group Chat Isolation](#e-group-chat-isolation)
   - [F. Thread Replies](#f-thread-replies)
   - [G. Memory & Session Compaction](#g-memory--session-compaction)
   - [H. Task Delegation & Harnesses](#h-task-delegation--harnesses)
   - [I. Proactive / Scheduling](#i-proactive--scheduling)
5. [Session Architecture (Critical)](#session-architecture-critical)
6. [Debugging Reference](#debugging-reference)
7. [Pipeline Configuration](#pipeline-configuration)
8. [Known Issues & Risks](#known-issues--risks)

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

### Clean Slate (Before Full Validation)

```bash
# Wipe sessions for a clean start
sudo rm -f data/sessions.db data/sessions.db-wal data/sessions.db-shm

# Rebuild bridge
docker compose down fetch-bridge && \
docker compose build fetch-bridge && \
docker compose up -d fetch-bridge

# Wait for QR auth + verify startup
sleep 15 && docker logs fetch-bridge 2>&1 | tail -20
```

---

## Automated Tests

### Unit Tests

```bash
cd fetch-app && npm test
```

Individual suites:

```bash
npx vitest run tests/unit/intent.test.ts
npx vitest run tests/unit/tool-registry.test.ts
npx vitest run tests/unit/workspace-manager.test.ts
npx vitest run tests/unit/harness-adapters.test.ts
```

### Integration / E2E

```bash
npx vitest run tests/integration/harness.test.ts
npx vitest run tests/e2e/
```

---

## Validation Checklist

> **Instructions:** Work through each section in order. Mark each test with
> ✅ (pass), ❌ (fail), or ⏭️ (skipped — note reason).
> After testing, log any failures in the "Known Issues" table at the bottom.

### A — Security & Trust

| # | Test | Expected | Result |
|---|------|----------|--------|
| A1 | DM from **owner** without `@fetch` trigger | ❌ Silently ignored (trigger required) | ✅ Passed |
| A2 | DM from **owner** with `@fetch hello` | ✅ Responds | ✅ Passed |
| A3 | DM from **untrusted stranger** with `@fetch hello` | ❌ Blocked — "not authorized" | ⏭️ Skipped |
| A4 | `/trust add <stranger-number>` (from owner DM) | ✅ Number added, confirmed | ⏭️ Skipped |
| A5 | DM from **newly trusted** user with `@fetch hello` | ✅ Responds | ⏭️ Skipped |
| A6 | `/trust list` (from owner DM) | ✅ Shows trusted numbers | ⏭️ Skipped |
| A7 | `/trust remove <number>` (from owner DM) | ✅ Number removed | ⏭️ Skipped |
| A8 | DM from **removed** user with `@fetch` | ❌ Blocked again | ⏭️ Skipped |
| A9 | Add number from **TUI whitelist screen** | ✅ Appears in `data/whitelist.json` | ⏭️ Skipped |
| A10 | DM from TUI-added user with `@fetch` | ✅ Responds (no `/trust` needed) | ⏭️ Skipped |
| A11 | `/trust clear` (from owner DM) | ✅ All trusted numbers removed | ⏭️ Skipped |

### B — Slash Commands (All)

#### Project Management

| # | Command | Expected | Result |
|---|---------|----------|--------|
| B1 | `/projects` or `/ls` | Lists workspace dirs with types | ✅ Passed |
| B2 | `/project <name>` or `/cd <name>` | Switches active project, shows info | ✅ Passed (Flag: "unknown" classification) |
| B3 | `/project` (no args, with project active) | Shows current project info | ✅ Passed (Flag: "unknown" classification) |
| B4 | `/project` (no args, no project) | "No project selected" message | |
| B5 | `/clone <git-url>` | Clones repo into workspace | |
| B6 | `/init <name>` | Creates new empty project dir | |

#### Git Operations

| # | Command | Expected | Result |
|---|---------|----------|--------|
| B7 | `/status` or `/st` or `/gs` | Shows git status of active project | ⚠️ Failed (Shows system status, not git status) |
| B8 | `/diff` | Shows uncommitted changes | |
| B9 | `/log` or `/log 5` | Shows recent commits | |
| B10 | `/undo` | Reverts last change (git) | |
| B11 | `/undo all` | Reverts all session changes | |

#### Task Control

| # | Command | Expected | Result |
|---|---------|----------|--------|
| B12 | `/task` | Shows current task status | |
| B13 | `/stop` or `/cancel` | Cancels active task | |
| B14 | `/pause` | Pauses active task | |
| B15 | `/resume` or `/continue` | Resumes paused task | |

#### Context Management

| # | Command | Expected | Result |
|---|---------|----------|--------|
| B16 | `/add src/index.ts` | Adds file to active context | ✅ Passed (Flag: needs absolute path display) |
| B17 | `/files` or `/context` | Lists active files | ✅ Passed (Flag: needs absolute path display) |
| B18 | `/drop src/index.ts` or `/remove ...` | Removes file from context | |
| B19 | `/clear` or `/reset` | Wipes messages, files, task — keeps prefs | ⏭️ Skipped (per user request) |

#### Settings / Preferences

| # | Command | Expected | Result |
|---|---------|----------|--------|
| B20 | `/auto` or `/autonomous` | Toggles cautious ↔ autonomous | ✅ Passed (Flag: Response description unclear) |
| B21 | `/mode supervised` | Sets mode to supervised | |
| B22 | `/mode cautious` | Sets mode to cautious | |
| B23 | `/mode autonomous` | Sets mode to autonomous | |
| B24 | `/mode` (no args) | Shows current mode | |
| B25 | `/verbose` | Toggles verbose mode ON/OFF | ✅ Passed (Flag: `/mode verbose` failed, invalid arg) |
| B26 | `/autocommit` | Toggles auto-commit ON/OFF | |

#### Identity & Skills

| # | Command | Expected | Result |
|---|---------|----------|--------|
| B27 | `/identity` | Shows name, role, tone | ✅ Passed (Flag: Response "lackluster") |
| B28 | `/identity system` or `/identity core` | Shows directives | |
| B29 | `/identity reset` | Reloads identity from disk | |
| B30 | `/skills` or `/skill list` | Lists active skills | |
| B31 | `/skill create test-skill` | Creates skill scaffold | |
| B32 | `/skill disable test-skill` | Disables skill | |
| B33 | `/skill enable test-skill` | Re-enables skill | |
| B34 | `/skill delete test-skill` | Removes skill | |

#### Threads

| # | Command | Expected | Result |
|---|---------|----------|--------|
| B35 | `/threads` or `/thread list` | Lists conversation threads | |
| B36 | `/thread switch <id>` | Switches active thread | |

#### Project Control Updates

| # | Command | Expected | Result |
|---|---------|----------|--------|
| B6 | `/init <name>` | Creates new empty project dir | ✅ Passed (Flag: NL processing oddity, "unknown" type) |

#### Info / Help

| # | Command | Expected | Result |
|---|---------|----------|--------|
| B37 | `/help` or `/h` or `/?` | Shows full command reference | |
| B38 | `/version` or `/v` | Shows "Fetch v3.3.0" | |

#### Security

| # | Command | Expected | Result |
|---|---------|----------|--------|
| B39 | `/trust` (no args) | Shows trust help | |
| B40 | `/trust add <number>` | See section A above | |
| B41 | `/trust list` | See section A above | |
| B42 | `/trust remove <number>` | See section A above | |
| B43 | `/trust clear` | See section A above | |

#### Proactive / Scheduling

| # | Command | Expected | Result |
|---|---------|----------|--------|
| B44 | `/remind "test" in 5m` | Sets a reminder, shows confirmation | |
| B45 | `/schedule list` | Lists scheduled jobs (or empty) | |
| B46 | `/cron list` or `/cron ls` | Lists cron jobs | |
| B47 | `/cron remove <id>` | Removes a scheduled job | |

#### Edge Cases

| # | Command | Expected | Result |
|---|---------|----------|--------|
| B48 | `/notacommand` | "Unknown command" message | |
| B49 | `/` (just slash) | Should not crash | |

### C — AI Tools (LLM-Invoked)

These are called by the LLM when it classifies your message as an `action` intent.
Send these as **natural language** (not slash commands).

#### Workspace Tools

| # | Send Message | Expected Tool Call | Expected Behavior | Result |
|---|-------------|-------------------|-------------------|--------|
| C1 | `what projects do we have?` | `workspace_list` | Returns project directories with types | |
| C2 | `show me available projects` | `workspace_list` | Same — flexible phrasing | |
| C3 | `any projects?` | `workspace_list` | Same — minimal phrasing | |
| C4 | `switch to <project-name>` | `workspace_select` | Activates project | |
| C5 | `switch to it` (after listing) | `workspace_select` | Pronoun resolution | |
| C6 | `project status` | `workspace_status` | Git info, modified files | |
| C7 | `create a project called demo` | `workspace_create` | Creates dir with template | ❌ Failed (UX Breakdown: "Needs explicit confirmation") |
| C8 | `delete demo` (project context) | `workspace_delete` | Confirms, then deletes | |

#### Task Tools

| # | Send Message | Expected Tool Call | Expected Behavior | Result |
|---|-------------|-------------------|-------------------|--------|
| C9 | `add a health check endpoint` (with project selected) | `task_create` | Creates task, delegates to harness | ❌ Failed (State amnesia: forgets project immediately after use) |
| C10 | `what's the status of my task?` | `task_status` | Returns task progress | |
| C11 | `cancel that task` | `task_cancel` | Aborts running task | |

#### Interaction Tools (Internal)

| # | Behavior | Expected | Result |
|---|----------|----------|--------|
| C12 | LLM needs clarification during task | `ask_user` — sends question, pauses task | ⚠️ Partial (Used `ask_user` excessively) |
| C13 | LLM reports mid-task progress | `report_progress` — sends status update | |

#### Conversation (No Tools)

| # | Send Message | Expected | Result |
|---|-------------|----------|--------|
| C14 | `hey fetch` | Greeting response, NO tool calls | |
| C15 | `what can you do?` | Capability overview, no tools | |
| C16 | `how does React work?` | Conversational answer, no tools | |
| C17 | `yes` (after Fetch asks a question) | Approves action — routes to task/approval, NOT conversation | ✅ Passed (Context: "Proceed with file creation?") |
| C18 | `ok` (with active task) | Should continue task, not be classified as reaction | |

### D — @fetch Trigger & Routing

| # | Scenario | Send | Expected | Result |
|---|----------|------|----------|--------|
| D1 | DM, with trigger | `@fetch what time is it?` | Processes message | |
| D2 | DM, no trigger | `what time is it?` | ❌ Silently ignored | |
| D3 | Group, with trigger | `@fetch hello` | Processes, responds in group | |
| D4 | Group, no trigger | `hello` | ❌ Silently ignored | |
| D5 | Group, trigger mid-message | `hey @fetch help me` | ✅ Trigger detected anywhere in body | |
| D6 | Thread reply to Fetch msg (owner) | Reply without `@fetch` | ✅ Processed (thread detection) | ✅ Passed (F1) |
| D7 | Thread reply to Fetch msg (trusted) | Reply without `@fetch` | ✅ Processed (whitelist check) | |
| D8 | Thread reply to Fetch msg (untrusted) | Reply without `@fetch` | ❌ Blocked | |
| D9 | Thread reply to non-Fetch msg | Reply without `@fetch` | ❌ Silently ignored (not fromMe) | |
| D10 | Self-chat (fromMe), thread reply | Reply to own msg | ❌ Thread detection disabled (loop prevention) | |

### E — Group Chat Isolation

> ⚠️ **CRITICAL:** Sessions are currently keyed on **participant JID** (`@c.us`),
> NOT on group JID (`@g.us`). This means DM and group conversations from the same
> user share ONE session. This section tests whether that causes problems.

| # | Test | Steps | Expected | Risk | Result |
|---|------|-------|----------|------|--------|
| E1 | **DM context doesn't leak to group** | 1. DM: `/project my-api`<br>2. Group: `@fetch what project am I on?` | ⚠️ Will show `my-api` — same session | **Session bleed** | 🔴 FAILED (Confirmed Session Bleed) |
| E2 | **Group context doesn't leak to DM** | 1. Group: `@fetch /project web-app`<br>2. DM: `@fetch project status` | ⚠️ Will show `web-app` — same session | **Session bleed** | |
| E3 | **Two groups, same user** | 1. Group A: `@fetch /project alpha`<br>2. Group B: `@fetch what project?` | ⚠️ Will show `alpha` — same session | **Session bleed** | |
| E4 | **Different users, same group** | 1. User A in group: `@fetch /project X`<br>2. User B in group: `@fetch what project?` | ✅ Different sessions — different users | **Isolated** | |
| E5 | **Message history separation** | 1. DM: discuss private code<br>2. Group: `@fetch summarize our convo` | ⚠️ LLM sees mixed DM+group history | **History bleed** | |
| E6 | **Task running, switch chat** | 1. DM: start a coding task<br>2. Group: `@fetch status` | ⚠️ Shows DM task in group — same session | **Task bleed** | |
| E7 | **Reply routing** | 1. Group: `@fetch hello`<br>2. Verify response appears in GROUP, not DM | ✅ whatsapp-web.js routes replies correctly | **Safe** | |

> **Verdict:** If E1–E3 confirm session bleed, we need to scope sessions by
> `chatId + participantId` instead of just `participantId`. Log this as a future fix.

### F — Thread Replies

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| F1 | Reply to Fetch's DM message | Long-press Fetch's msg → Reply → type message | ✅ Processed without `@fetch` | ✅ Passed |
| F2 | Reply to Fetch in group | Long-press Fetch's msg → Reply → type message | ✅ Processed without `@fetch` | ⏭️ Skipped |
| F3 | Reply to someone else's msg | Long-press other msg → Reply → type message | ❌ Not processed (not fromMe reply) | |
| F4 | Owner sends "fromMe" reply | Reply to your OWN msg (self-chat) | ❌ Thread detection disabled (loop prevention) | |

### G — Memory & Session Compaction

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| G1 | **Session creation** | DM `@fetch hello` from fresh number | New session created in SQLite | |
| G2 | **Message persistence** | Send 5 messages, restart bridge | All 5 messages in session.messages | |
| G3 | **History window** | Send 25+ messages, check LLM context | LLM only sees last 20 (historyWindow) | |
| G4 | **Compaction trigger** | Send 41+ messages (threshold=40) | Older msgs summarized, kept=20 | |
| G5 | **Compaction summary** | After compaction, check system prompt | "Conversation History 🧠" section present | |
| G6 | **Clear resets history** | `/clear` then check | messages=[], activeFiles=[], no compaction summary | |
| G7 | **Session isolation** | Two users send messages | Each user has own session, own messages | |
| G8 | **Token counts** | Check tool response | max_tokens = 2048 for tool calls, 512 for chat | |

**How to verify compaction:**

```bash
# Check message count in live container
docker exec fetch-bridge node -e "
  const db = require('better-sqlite3')('/app/data/sessions.db');
  const rows = db.prepare('SELECT user_id, json_extract(data, \"$.messages\") as msgs FROM sessions').all();
  for (const r of rows) {
    const msgs = JSON.parse(r.msgs || '[]');
    console.log(r.user_id, '→', msgs.length, 'messages');
  }
"

# Check if compaction summary exists
docker exec fetch-bridge node -e "
  const db = require('better-sqlite3')('/app/data/sessions.db');
  const rows = db.prepare('SELECT user_id, json_extract(data, \"$.compactionSummary\") as summary FROM sessions').all();
  for (const r of rows) {
    console.log(r.user_id, '→', r.summary ? r.summary.substring(0,100) + '...' : 'none');
  }
"
```

### H — Task Delegation & Harnesses

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| H1 | **Task creation** | Select project → ask for code change | `task_create` called, task queued | |
| H2 | **Harness dispatch** | (Requires at least one enabled harness) | Task dispatched to claude/gemini/copilot | |
| H3 | **Task status** | `/task` during execution | Shows status (planning/executing/etc.) | |
| H4 | **Task cancel** | `/stop` during task | Task aborted cleanly | |
| H5 | **Task pause/resume** | `/pause` then `/resume` | Task pauses and resumes | |
| H6 | **Approval flow** | In supervised mode, Fetch asks permission | `yes` approves, `no` rejects | |
| H7 | **No harness available** | All harnesses disabled | Graceful error message, not crash | |

### I — Proactive / Scheduling

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| I1 | **Set reminder** | `/remind "check deploy" in 5m` | Confirmation with time shown | |
| I2 | **List schedules** | `/cron list` | Shows active jobs (or empty) | |
| I3 | **Remove job** | `/cron remove <id>` | Job removed confirmation | |
| I4 | **Reminder fires** | Wait for reminder to trigger | Notification received | |

---

## Session Architecture (Critical)

### How Sessions Are Keyed

```
DM:    senderId = 15551234567@c.us   → session key = 15551234567@c.us
Group: senderId = 120363XXX@g.us     → participantId = 15551234567@c.us
                                     → session key = 15551234567@c.us (PARTICIPANT, not group!)
```

**Implication:** A user's DM session and group session are the **SAME object**.
Project context, message history, active tasks, threads, and preferences are shared
across all chats for the same phone number.

### What's Session-Scoped

| Data | Scoped To | Isolation |
|------|-----------|-----------|
| `session.messages[]` | User JID (`@c.us`) | ⚠️ DM + group messages mixed |
| `session.currentProject` | User JID | ⚠️ Shared across all chats |
| `session.activeTaskId` | User JID | ⚠️ Task visible in all chats |
| `session.activeFiles` | User JID | ⚠️ Shared |
| `session.preferences` | User JID | ✅ OK — preferences are personal |
| `session.compactionSummary` | User JID | ⚠️ Summarizes mixed DM+group history |
| `session.currentThreadId` | User JID | ⚠️ Thread switches affect all chats |

### Known Risk: Session Bleed

If a user interacts with Fetch in BOTH a DM and a group:
- Project context set in DM will be visible in group and vice versa
- Message history will be a single interleaved stream
- Task started in DM will show status in group

**Future Fix:** Key sessions on `chatId:participantId` composite key instead of
just `participantId`. This would give each chat context its own session.

---

## Debugging Reference

### View Bridge Logs

```bash
# Real-time logs
docker logs -f fetch-bridge

# Last 200 lines
docker logs fetch-bridge 2>&1 | tail -200

# Filter by category
docker logs fetch-bridge 2>&1 | grep "Intent"           # Intent classification
docker logs fetch-bridge 2>&1 | grep -E "tool|Tool"      # Tool calls
docker logs fetch-bridge 2>&1 | grep -iE "error|fail"    # Errors
docker logs fetch-bridge 2>&1 | grep -iE "trust|whitelist|gate"  # Security
docker logs fetch-bridge 2>&1 | grep -iE "session|compact"       # Sessions
docker logs fetch-bridge 2>&1 | grep -iE "task|harness"          # Tasks
```

### View Kennel Logs

```bash
docker logs -f fetch-kennel
```

### Inspect Session State

```bash
# Count sessions
docker exec fetch-bridge node -e "
  const db = require('better-sqlite3')('/app/data/sessions.db');
  console.log(db.prepare('SELECT COUNT(*) as c FROM sessions').get());
"

# List all sessions with message counts
docker exec fetch-bridge node -e "
  const db = require('better-sqlite3')('/app/data/sessions.db');
  const rows = db.prepare('SELECT user_id, json_extract(data, \"$.messages\") as msgs FROM sessions').all();
  for (const r of rows) {
    const msgs = JSON.parse(r.msgs || '[]');
    console.log(r.user_id, '→', msgs.length, 'messages');
  }
"
```

### Check Whitelist State

```bash
# Host file (what TUI writes)
cat data/whitelist.json | jq .

# Container file (what bridge reads)
docker exec fetch-bridge cat /app/data/whitelist.json | jq .

# These MUST be the same file (via volume mount ./data:/app/data)
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
| `historyWindow` | 20 | `FETCH_HISTORY_WINDOW` | Messages in sliding window sent to LLM |
| `compactionThreshold` | 40 | `FETCH_COMPACTION_THRESHOLD` | Compact when messages exceed this count |
| `compactionKeep` | 20 | `FETCH_COMPACTION_KEEP` | Messages retained after compaction |
| `truncationLimit` | 100 | `FETCH_TRUNCATION_LIMIT` | Hard truncation safety net |
| `chatTemperature` | 0.7 | `FETCH_CHAT_TEMPERATURE` | Creativity for conversation |
| `toolTemperature` | 0.3 | `FETCH_TOOL_TEMPERATURE` | Precision for tool calls |
| `compactionModel` | `openai/gpt-4o-mini` | `SUMMARY_MODEL` | Model used for summarization |

Override via `docker-compose.yml`:

```yaml
services:
  fetch-bridge:
    environment:
      - FETCH_TOOL_MAX_TOKENS=4096
      - FETCH_CHAT_MAX_TOKENS=1024
```

---

## Known Issues & Risks

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| **Context Amnesia: Agent forgets project mid-conversation** | 🔴 Critical | 🔴 Confirmed | System prompt not rebuilt after tool calls. Fix: Phase 1 of FIX_PLAN.md |
| **Excessive confirmation loops (ask_user overuse)** | 🔴 Critical | 🔴 Confirmed | LLM asks "which project?" even with active project. Fix: Phase 2 of FIX_PLAN.md |
| **Conversation handler has no tools** | 🟡 High | 🔴 Confirmed | "How's the project?" gets hallucinated answer. Fix: Phase 3 |
| **Short messages (<15 chars) forced to conversation** | 🟡 High | 🔴 Confirmed | "fix auth" misrouted. Fix: Phase 3 |
| **`/status` shows system health, not git status** | 🟡 Medium | 🔴 Confirmed | Users expect git status. Fix: Phase 4 |
| **Project type detection shows `(unknown)`** | 🟡 Medium | 🔴 Confirmed | Weak detection patterns. Fix: Phase 4 |
| **`/mode verbose` fails** | 🟢 Low | 🔴 Confirmed | Should redirect to `/verbose`. Fix: Phase 4 |
| **`/add` and `/files` don't show full paths** | 🟡 Medium | 🔴 Confirmed | Missing project-relative paths. Fix: Phase 4 |
| **Mode toggle responses lack explanation** | 🟡 Medium | 🔴 Confirmed | "Autonomous mode" not explained. Fix: Phase 4 |
| **Session bleed: DM ↔ group** | 🔴 High | 🟡 Deferred | Sessions keyed on participant, not chat. Separate effort |
| `gh auth token` expired in kennel | 🟡 Medium | 🟡 Open | Copilot harness unavailable. Re-auth inside container |
| Claude harness disabled | 🟢 Low | ⚪ Expected | Enable when `claude` CLI available in kennel |
| Gemini harness disabled | 🟢 Low | ⚪ Expected | Enable when `gemini` CLI available in kennel |
| Proactive notifications route to DM | 🟡 Medium | 🟡 Open | Tasks started from group send completions to DM |
| `/version` shows v3.3.0 | 🟢 Low | 🟡 Stale | Should be updated to v3.5.0 |

---

## Test Execution Log

> Record your test runs here. Copy the date header and fill in results.

### Run: 2026-02-07

**Tester:** Traves
**Bridge version:** v3.4.0+
**Commit:** main (15 ahead of origin)

| Section | Passed | Failed | Skipped | Notes |
|---------|--------|--------|---------|-------|
| A — Security | 2/11 | 0 | 9 | A3-A11 need second phone |
| B — Commands | 7/49 | 1 | 41 | B7 `/status` confusion. Multiple UX flags |
| C — AI Tools | 1/18 | 2 | 15 | C7 Context Amnesia (Critical). C12 ask_user overuse |
| D — Triggers | 1/10 | 0 | 9 | D6/F1 thread reply works |
| E — Group Isolation | 0/7 | 1 | 6 | E1 Session Bleed CONFIRMED |
| F — Threads | 1/4 | 0 | 3 | F1 Passed |
| G — Memory | 0/8 | 0 | 8 | Blocked by core session bugs |
| H — Tasks | 0/7 | 0 | 7 | Blocked by context amnesia |
| I — Proactive | 0/4 | 0 | 4 | Lower priority |
| **TOTAL** | **12/118** | **4** | **102** | See FIX_PLAN.md for remediation |
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
