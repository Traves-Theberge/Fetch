# 🐕 Fetch v4.0 — "The Conversation IS the Interface"

> **Generated:** 2026-02-07
> **Based on:** Architectural audit of Fetch + research into Claude Code, Goose, Cline, Aider, Continue.dev
> **Goal:** Strip 4 redundant routing layers, let the LLM be the router, reduce 35+ commands to ~5 safety escapes

---

## Executive Summary

Fetch currently passes every message through **5 deterministic layers** before the LLM ever sees it:

```
Message → Slash Parser (35 cmds) → Instinct Registry (12 matchers) → Mode Detector (5 modes)
        → Intent Classifier (3 intents, ~200 regex patterns) → Skill Matcher (keyword) → LLM
```

Every competitive tool (Claude Code, Goose, Cline, Aider) does the inverse: **the LLM is the first and primary router**. Deterministic escapes exist only for safety (stop/undo/clear). Everything else — project selection, context loading, harness routing, task creation — happens conversationally through LLM tool-calling.

**The refactor**: Collapse layers 1–5 into a thin safety gate. Give the LLM richer tools and a better system prompt. The user never learns a command vocabulary — they just talk to Fetch.

### Before vs After

| Metric | Current (v3.5) | Target (v4.0) |
|--------|---------------|---------------|
| User-facing commands | ~35 | 5 |
| Pre-LLM routing layers | 5 | 1 (safety gate) |
| Regex patterns in intent classifier | ~200 | 0 |
| Instinct handlers | 12 | 0 |
| Files to delete | — | ~15 |
| Files to modify | — | ~8 |

---

## What We Learned from the Competition

### Claude Code (The Gold Standard)
- **0 task-verb commands**. All work flows from conversation.
- ~20 commands, ALL meta/session: `/clear`, `/compact`, `/model`, `/resume`, `/memory`
- Project context = CWD. No `/project` command.
- Auto-memory: Claude writes its own `MEMORY.md` per project as it learns.
- Skills/custom commands = markdown prompt templates, not code modules.

### Goose (Most Conversational)
- ~5 commands total. Everything else is conversation → LLM → MCP tools.
- Extensions auto-enable mid-session when the LLM needs them.
- Memory extension + Chat Recall for cross-session search.

### Aider (Best Hybrid)
- Modal: `/ask` (read-only) vs `/code` (write). Only 2 real modes.
- Repo map with tree-sitter symbol ranking (we have something similar).
- No task system — git commits ARE the task record.

### Cline (Best Approval UX)
- ACT vs PLAN mode. User controls when the agent can write.
- Every tool call surfaces as "Cline wants to [X]" — approval gate.
- `/newtask`, `/smol`, `/subagent` — only 5 commands.

### The Universal Pattern
> Commands = escape hatches for session management.
> Work = conversation → LLM tool-calling → harness execution.

---

## Architecture: Current vs Proposed

### Current Message Flow (5 routing layers)

```
WhatsApp Message
│
├─ Layer 1: Slash Command Parser (commands/parser.ts)
│  35 commands across 6 modules:
│  project.ts (9 cmds), task.ts (4), context.ts (4), settings.ts (4),
│  identity-commands.ts (3), trust.ts (1), proactive/commands.ts (4+)
│  → Returns hardcoded strings. LLM never sees message. No personality.
│
├─ Layer 2: Instinct Registry (instincts/index.ts)
│  12 pattern matchers: help, status, commands, skills, tools,
│  scheduling, stop, undo, clear, whoami, identity, thread
│  → Also returns hardcoded strings. Duplicates Layer 1.
│
├─ Layer 3: Mode Detector (conversation/detector.ts)
│  Keyword classification: TASK / EXPLORATION / TEACHING / COLLABORATION / CHAT
│  → Sets metadata, doesn't route. Thread manager gets mode.
│
├─ Layer 4: Intent Classifier (agent/intent.ts)
│  ~200 regex patterns across CONVERSATION_PATTERNS, WORKSPACE_PATTERNS,
│  TASK_PATTERNS, FILE_PATTERNS, CODE_INDICATORS
│  → Routes to handleConversation (limited tools) or handleWithTools (full tools)
│
├─ Layer 5: Skill Matcher (skills/manager.ts)
│  Keyword-based trigger matching against loaded SKILL.md files
│  → Injects matched skill instructions into system prompt
│
└─ Layer 6: LLM (agent/core.ts)
   Finally reaches the model. But conversation handler gets ONLY 3 read-only tools.
   Action handler gets full tools but message was already pre-classified.
```

### Proposed Message Flow (1 safety gate + LLM)

```
WhatsApp Message
│
├─ Safety Gate (deterministic, instant — no LLM needed)
│  /stop   → kill active harness process immediately
│  /undo   → git revert last commit immediately
│  /clear  → reset session, clear history
│  /help   → show onboarding card
│  /status → quick system health (uptime, active task, workspace)
│  ↓ (anything else falls through)
│
└─ LLM Orchestrator (ALL messages go here)
   │
   │  System Prompt includes:
   │  ├─ Identity (COLLAR.md + ALPHA.md — unchanged)
   │  ├─ Pack profiles (data/agents/*.md — unchanged)
   │  ├─ Session context (workspace, git, active task — unchanged)
   │  ├─ Repo map (if workspace selected — unchanged)
   │  ├─ Active skills (semantic match, not keyword — CHANGED)
   │  └─ Conversation history (sliding window — unchanged)
   │
   │  Full Tool Suite (no conversation/action split):
   │  ├─ workspace_list        — list mounted workspaces
   │  ├─ workspace_select      — switch active workspace
   │  ├─ workspace_status      — git status, file tree, branch info
   │  ├─ workspace_create      — clone/init a new project
   │  ├─ workspace_delete      — remove a workspace (confirms first)
   │  ├─ task_create            — delegate to harness (LLM picks agent)
   │  ├─ task_status            — check running task
   │  ├─ task_cancel            — cancel running task
   │  ├─ ask_user               — pause for user input
   │  ├─ report_progress        — send progress update
   │  ├─ schedule_reminder      — set a timed reminder
   │  └─ update_preferences     — change autonomy, mode, settings
   │
   └─ The LLM handles EVERYTHING:
      • "hi" → responds conversationally (no tool calls needed)
      • "what projects do I have?" → calls workspace_list
      • "work on the API" → calls workspace_select
      • "fix the auth bug" → calls task_create(agent: claude)
      • "quick, rename that variable" → calls task_create(agent: gemini)
      • "stop" → calls task_cancel (or user uses /stop for instant kill)
      • "remind me in 2 hours" → calls schedule_reminder
      • "be more autonomous" → calls update_preferences
      • "who are you?" → answers from system prompt (identity)
      • "what skills do you have?" → answers from system prompt (skills)
```

---

## Detailed Phase Plan

### Phase 1: Collapse Intent Classifier + Mode Detector (Remove Layers 3 & 4)

> **Impact:** Eliminates ~520 lines of regex patterns. All messages reach LLM with full tools.
> **Risk:** Low — the LLM already handles both paths, we're just removing the pre-filter.

#### What Changes

| File | Action | Details |
|------|--------|---------|
| `agent/intent.ts` | **DELETE** | 520 lines of regex. The LLM classifies intent natively. |
| `conversation/detector.ts` | **DELETE** | 80 lines. Mode detection moves to LLM system prompt context. |
| `conversation/types.ts` | **MODIFY** | Remove `ConversationMode`, `ModeDetectionResult` types. Keep thread types. |
| `agent/core.ts` | **MODIFY** | Remove `classifyIntent()` call, remove `handleConversation()` vs `handleWithTools()` split. Single `handleMessage()` path with all tools. |

#### The Key Change in `agent/core.ts`

**Before:** Two handlers with different tool access:
```
classifyIntent() → conversation? → handleConversation() (3 read-only tools)
                 → action?       → handleWithTools() (all tools)
                 → clarify?      → hardcoded "head tilt" response
```

**After:** One handler, all tools, LLM decides:
```
processMessage() → handleMessage() (all tools, always)
```

The LLM naturally responds to "hi" without calling tools, and to "fix the bug" by calling `task_create`. No regex needed to route this. The system prompt's autonomy rules already tell the LLM when to act vs chat.

#### Why This Is Safe

The `handleConversation` path already has 3 read-only tools (`workspace_list`, `workspace_select`, `workspace_status`). The only difference between "conversation" and "action" is which tools are available. By giving ALL tools in ALL cases, the LLM just... doesn't use `task_create` when someone says "hi". This is exactly how Claude Code, Goose, and Cline work.

---

### Phase 2: Delete Instinct Registry (Remove Layer 2)

> **Impact:** Eliminates 12 handlers, ~800 lines across 12 files. Removes duplicate routing.
> **Risk:** Low-Medium — need to ensure LLM system prompt covers the same info instincts returned.

#### What Changes

| File | Action | Details |
|------|--------|---------|
| `instincts/index.ts` | **DELETE** | Registry class + singleton |
| `instincts/types.ts` | **DELETE** | Instinct types |
| `instincts/help.ts` | **DELETE** | Hardcoded help text → move to system prompt or `/help` safety command |
| `instincts/status.ts` | **DELETE** | → LLM calls `workspace_status` tool |
| `instincts/commands.ts` | **DELETE** | No commands to list anymore |
| `instincts/skills.ts` | **DELETE** | → LLM answers from system prompt skills section |
| `instincts/tools.ts` | **DELETE** | → LLM answers from its tool descriptions |
| `instincts/scheduling.ts` | **DELETE** | → LLM calls `schedule_reminder` tool |
| `instincts/safety.ts` | **DELETE** | stop/undo/clear → handled by safety gate in Phase 3 |
| `instincts/whoami.ts` | **DELETE** | → LLM answers from identity in system prompt |
| `instincts/identity.ts` | **DELETE** | → LLM answers from identity in system prompt |
| `instincts/thread.ts` | **DELETE** | → LLM manages thread context naturally |
| `agent/core.ts` | **MODIFY** | Remove `getInstinctRegistry()` call, `checkInstincts()`, `handleInstinctAction()` |

#### What The LLM Needs To Replace Instincts

The instincts returned hardcoded text. The LLM needs the same information available to it:

1. **Help text** → Already in system prompt (identity, capabilities, tool descriptions)
2. **Status** → `workspace_status` tool already returns this data
3. **Skills list** → Already in system prompt `AVAILABLE SKILLS` section
4. **Identity info** → Already in system prompt from COLLAR.md/ALPHA.md
5. **Thread info** → Session history already provides this context
6. **Scheduling** → `schedule_reminder` tool
7. **Stop/undo/clear** → Safety gate (Phase 3)

The only thing that "lives" in instincts and isn't already available to the LLM is the **hardcoded help card**. This moves to the `/help` safety command.

---

### Phase 3: Collapse Slash Commands (Rebuild Layer 1)

> **Impact:** 35 commands → 5. Eliminates 6 command modules (~1,200 lines).
> **Risk:** Medium — users familiar with commands need the safety escapes to work perfectly.

#### The 5 Surviving Commands (Safety Gate)

| Command | Aliases | Why It Must Be Deterministic |
|---------|---------|------------------------------|
| `/stop` | `/cancel` | Must kill harness process INSTANTLY. Can't wait for LLM round-trip. |
| `/undo` | — | Must `git revert` INSTANTLY. Safety-critical. |
| `/clear` | `/reset` | Session reset must be guaranteed, not LLM-dependent. |
| `/help` | `/h`, `/?` | Onboarding card. Should work even if LLM is down. |
| `/status` | `/st` | Quick health check. Should work even if LLM is down. |

#### What Gets Absorbed Into LLM Tools

| Current Commands | Replacement | How User Triggers It |
|-----------------|-------------|---------------------|
| `/projects`, `/ls` | `workspace_list` tool | "What projects do I have?" |
| `/project X`, `/cd X`, `/select X` | `workspace_select` tool | "Work on X" / "Switch to X" |
| `/clone URL` | `workspace_create` tool | "Clone this repo: URL" |
| `/init NAME` | `workspace_create` tool | "Create a new project called NAME" |
| `/git`, `/gs` | `workspace_status` tool | "What's the git status?" |
| `/diff` | `workspace_status` tool (enhanced) | "What changed?" / "Show me the diff" |
| `/log` | `workspace_status` tool (enhanced) | "Show recent commits" |
| `/add FILE` | Automatic (repo map + LLM reads on demand) | Not needed — LLM reads files as needed |
| `/drop FILE` | Automatic | Not needed |
| `/files`, `/context` | Automatic | "What files are in context?" → LLM answers from session |
| `/auto`, `/autonomous` | `update_preferences` tool | "Be more autonomous" / "Ask me before changing things" |
| `/mode X` | `update_preferences` tool | "Switch to cautious mode" |
| `/verbose` | `update_preferences` tool | "Give me more detail" / "Be concise" |
| `/autocommit` | `update_preferences` tool | "Auto-commit my changes" |
| `/identity` | LLM answers from system prompt | "Who are you?" / "Show your identity" |
| `/skill`, `/skills` | LLM answers from system prompt | "What skills do you have?" |
| `/thread`, `/threads` | LLM manages naturally | "What were we talking about?" |
| `/trust` | Config file only | Remove from runtime commands |
| `/remind`, `/schedule`, `/cron` | `schedule_reminder` tool | "Remind me in 2 hours to check tests" |
| `/version` | Fold into `/status` | Status shows version |
| `/task` | `task_status` tool | "How's the task going?" |
| `/pause`, `/resume` | `task_cancel` + restart | "Pause that" / "Continue" |

#### Files to Delete/Modify

| File | Action |
|------|--------|
| `commands/project.ts` | **DELETE** (302 lines) |
| `commands/context.ts` | **DELETE** |
| `commands/settings.ts` | **DELETE** |
| `commands/identity-commands.ts` | **DELETE** |
| `commands/task.ts` | **DELETE** |
| `commands/trust.ts` | **DELETE** |
| `commands/types.ts` | **KEEP** (simplified) |
| `commands/parser.ts` | **REWRITE** — 243 lines → ~60 lines (5 commands) |
| `commands/index.ts` | **KEEP** (re-export) |

#### New `commands/parser.ts` (Sketch)

```typescript
/**
 * Safety Gate — 5 deterministic escape hatches.
 * Everything else passes through to the LLM.
 */
export async function parseCommand(message, session, sessionManager): Promise<CommandResult> {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/')) return { handled: false, shouldProcess: true };

  const [command] = trimmed.slice(1).split(/\s+/);

  switch (command.toLowerCase()) {
    case 'stop':
    case 'cancel':
      return handleStop(session, sessionManager);

    case 'undo':
      return handleUndo(session, sessionManager);

    case 'clear':
    case 'reset':
      return handleClear(session, sessionManager);

    case 'help':
    case 'h':
    case '?':
      return { handled: true, responses: [HELP_CARD] };

    case 'status':
    case 'st':
      return { handled: true, responses: [await formatQuickStatus(session)] };

    default:
      // Don't block — let unknown /commands pass to the LLM
      // "I don't have a /foo command, but let me try to help..."
      return { handled: false, shouldProcess: true };
  }
}
```

**Key difference**: Unknown `/commands` now **fall through to the LLM** instead of returning "Unknown command". This means `/refactor auth` just becomes a message the LLM handles naturally.

---

### Phase 4: New `update_preferences` Tool

> **Impact:** Replaces `/auto`, `/mode`, `/verbose`, `/autocommit` with a conversational interface.
> **Risk:** Low — session preferences already exist.

#### Tool Definition

```typescript
{
  name: 'update_preferences',
  description: 'Update user preferences for this session. Call when the user wants to change autonomy level, verbosity, auto-commit behavior, or other settings.',
  parameters: {
    autonomyLevel: { type: 'string', enum: ['supervised', 'cautious', 'autonomous'], optional: true },
    verbose: { type: 'boolean', optional: true },
    autoCommit: { type: 'boolean', optional: true },
  }
}
```

#### How It Works Conversationally

```
User: "be more autonomous"
LLM:  (thinks: user wants less confirmation) → calls update_preferences({ autonomyLevel: 'autonomous' })
LLM:  "🐕 Switched to autonomous mode — I'll act first, report after. Say /stop anytime."

User: "ask me before making changes"
LLM:  → calls update_preferences({ autonomyLevel: 'supervised' })
LLM:  "🐕 Got it — I'll check with you before any edits."

User: "auto commit my stuff"
LLM:  → calls update_preferences({ autoCommit: true })
LLM:  "🐕 Auto-commit enabled. I'll commit after each successful change."
```

---

### Phase 5: Enhance `workspace_status` Tool

> **Impact:** Replaces `/git`, `/diff`, `/log`, `/files` with a single rich tool.
> **Risk:** Low — extending existing tool.

The current `workspace_status` tool returns basic info. Enhance it to cover what the deleted commands did:

```typescript
{
  name: 'workspace_status',
  description: 'Get detailed workspace status including git state, recent commits, changed files, and project info.',
  parameters: {
    include: {
      type: 'array',
      items: { type: 'string', enum: ['git', 'diff', 'log', 'files', 'summary'] },
      description: 'What to include. Defaults to ["summary"].',
      optional: true,
    },
    logCount: { type: 'number', description: 'Number of recent commits for log.', optional: true },
  }
}
```

Now "show me the diff", "what changed?", "recent commits" all route through the LLM calling this single tool with the right `include` parameter.

---

### Phase 6: Skill Matching — Keyword → Semantic

> **Impact:** Kills the keyword trigger system. Skills activate when contextually relevant.
> **Risk:** Medium — needs testing to ensure correct skill activation.

#### Current Problem

Skills use keyword triggers:
```yaml
triggers: [git, commit, branch, merge, rebase]
```

This misses semantic matches ("push my changes" doesn't contain "git") and false-positives ("git" appearing in conversation about something else).

#### Proposed Approach

**Option A: LLM-in-the-loop skill selection** (preferred)
- List all skill names + descriptions in the system prompt (already done)
- Add a lightweight `select_skills` step: before the main LLM call, a fast/cheap model (gpt-4o-mini) sees the message + skill list and returns which skills to activate
- Activated skill instructions get injected into the main system prompt
- Cost: ~100 tokens extra per message for the skill selector

**Option B: Embedding-based semantic match**
- Pre-compute embeddings for each skill's description + triggers
- Embed the user message
- Cosine similarity > threshold → activate
- Cost: embedding API call per message, but very fast

**Option C: Just put all skills in the system prompt** (simplest)
- If total skill instructions are <2K tokens, just include everything
- The LLM naturally follows relevant instructions and ignores irrelevant ones
- This is what Claude Code does with `CLAUDE.md` — always loaded, LLM self-selects
- Cost: slightly larger system prompt, zero extra API calls

**Recommendation: Start with Option C**, graduate to Option A if skill count grows past ~10.

---

### Phase 7: Auto-Memory (Claude Code Pattern)

> **Impact:** Fetch learns project patterns, preferences, and conventions over time.
> **Risk:** Low — additive feature, no breaking changes.

#### Concept

After completing tasks or conversations, Fetch writes observations to a per-project `MEMORY.md`:

```
data/cache/{project-name}/MEMORY.md
```

Contents might include:
```markdown
## Project Patterns
- Uses Vitest for testing, not Jest
- Prefers functional components over class components
- API routes follow /api/v1/{resource} convention

## Build & Run
- `pnpm dev` starts the dev server
- `pnpm test` runs tests
- Port 3000 for dev, 8080 for production

## Key Files
- src/index.ts — entry point
- src/config/env.ts — environment config (Zod validated)

## User Preferences
- Traves prefers concise responses
- Uses TypeScript strict mode everywhere
- Likes emoji in status messages
```

#### Implementation

1. New tool: `update_memory` — LLM calls this when it learns something worth remembering
2. Memory file loaded into system prompt (first 200 lines, like Claude Code)
3. Memory is per-workspace (keyed on project path)
4. LLM is instructed to write memory when it discovers patterns, NOT for every message

---

## File Impact Summary

### Files to DELETE (~2,500 lines removed)

| File | Lines | Reason |
|------|-------|--------|
| `agent/intent.ts` | 520 | Regex intent classifier → LLM |
| `conversation/detector.ts` | 80 | Mode detector → LLM |
| `instincts/index.ts` | 246 | Registry → deleted |
| `instincts/types.ts` | ~60 | Types → deleted |
| `instincts/help.ts` | ~80 | → `/help` safety command |
| `instincts/status.ts` | ~60 | → `workspace_status` tool |
| `instincts/commands.ts` | ~90 | → no commands to list |
| `instincts/skills.ts` | ~60 | → system prompt |
| `instincts/tools.ts` | ~60 | → system prompt |
| `instincts/scheduling.ts` | ~60 | → `schedule_reminder` tool |
| `instincts/safety.ts` | ~80 | → safety gate |
| `instincts/whoami.ts` | ~50 | → system prompt |
| `instincts/identity.ts` | ~100 | → system prompt |
| `instincts/thread.ts` | ~60 | → LLM |
| `commands/project.ts` | 302 | → `workspace_*` tools |
| `commands/context.ts` | ~120 | → automatic context |
| `commands/settings.ts` | ~100 | → `update_preferences` tool |
| `commands/identity-commands.ts` | ~100 | → system prompt |
| `commands/task.ts` | ~120 | → `task_*` tools |
| `commands/trust.ts` | ~50 | → config file only |

### Files to MODIFY

| File | Change |
|------|--------|
| `commands/parser.ts` | 243 → ~60 lines (5 safety commands) |
| `agent/core.ts` | Remove 5-layer routing, single `handleMessage()` path with all tools |
| `handler/index.ts` | Simplify — no instinct check, just safety gate → LLM |
| `tools/workspace.ts` | Enhance `workspace_status` with git/diff/log/files |
| `tools/registry.ts` | Add `update_preferences` and `update_memory` tools |
| `identity/manager.ts` | Load auto-memory into system prompt |
| `skills/manager.ts` | Remove keyword matching, use Option C (include all) or Option A (LLM selector) |
| `conversation/types.ts` | Remove unused mode types, keep thread types |

### Files to CREATE

| File | Purpose |
|------|---------|
| `tools/preferences.ts` | `update_preferences` tool handler |
| `tools/memory.ts` | `update_memory` tool handler + memory file I/O |

---

## Migration Strategy

### Phase Ordering (by dependency)

```
Phase 1 (Intent + Mode)  ──┐
Phase 2 (Instincts)      ──┤── Can happen together (both modify agent/core.ts)
                            │
Phase 3 (Commands)        ──┤── After 1+2 (safety gate replaces instinct safety)
Phase 4 (Preferences)    ──┤── After 3 (replaces deleted settings commands)
Phase 5 (Workspace tool)  ─┤── After 3 (replaces deleted project commands)
                            │
Phase 6 (Skills)          ──┤── Independent, can happen anytime
Phase 7 (Auto-memory)    ──┘── Independent, additive
```

**Recommended batch:**
1. **Sprint 1** (Phases 1+2): Delete intent classifier, mode detector, instinct registry. Single LLM path.
2. **Sprint 2** (Phases 3+4+5): Collapse commands, add preferences tool, enhance workspace tool.
3. **Sprint 3** (Phases 6+7): Semantic skills, auto-memory.

### Testing at Each Phase

After each phase, test these conversations:

```
"hi"                                → Conversational response (no tools)
"what projects do I have?"          → Calls workspace_list
"work on demo-project"              → Calls workspace_select
"what's the git status?"            → Calls workspace_status
"fix the auth bug in login.ts"      → Calls task_create (picks appropriate harness)
"stop"                              → Instant cancel (safety gate OR LLM tool)
"undo"                              → Instant revert (safety gate)
"be more autonomous"                → Calls update_preferences
"remind me in 2 hours"              → Calls schedule_reminder
"who are you?"                      → Answers from system prompt
"what skills do you have?"          → Answers from system prompt
"/stop"                             → Safety gate fires instantly
"/clear"                            → Safety gate fires instantly
"/refactor the auth module"         → Falls through to LLM (not a real command)
```

---

## What This Preserves

Everything valuable in the current architecture stays:

- ✅ **Identity system** (COLLAR.md, ALPHA.md, pack profiles) — untouched
- ✅ **Harness architecture** (Claude/Gemini/Copilot adapters, pool, executor) — untouched
- ✅ **Task lifecycle** (TaskManager, integration, persistence) — untouched
- ✅ **Session management** (SQLite, compaction, summarization) — untouched
- ✅ **Workspace management** (kennel mount, docker exec) — untouched
- ✅ **WhatsApp formatting** — untouched
- ✅ **Security** (whitelist, rate limiting, input validation) — untouched
- ✅ **Repo map generation** — untouched
- ✅ **System prompt building** (IdentityManager.buildSystemPrompt) — enhanced, not replaced
- ✅ **Skill system** (SKILL.md format, hot-reload) — matching changes, format preserved
- ✅ **Proactive system** (scheduler, reminders) — exposed via tool instead of command

## What Dies

- ❌ 200+ regex patterns trying to understand human language
- ❌ 12 instinct handlers returning hardcoded strings
- ❌ Conversation vs Action intent split
- ❌ 5-mode keyword classifier
- ❌ 30 slash commands for things the LLM handles naturally
- ❌ Keyword-based skill triggers
- ❌ `/add` and `/drop` manual context management
- ❌ "Unknown command" error messages (everything falls through to LLM)

---

## The Philosophical Shift

**v3.5 Fetch**: "I'm a command-line tool with AI features."
**v4.0 Fetch**: "I'm a conversational AI with safety escape hatches."

The deterministic layer moves from **above** the conversation (command parsers, intent classifiers, mode detectors) to **below** it (tool schemas, harness configs, workspace mounts, safety gates). The LLM is the router. The user just talks.
