# 🐕 Fetch v3.5 — "Make It Feel Alive" Fix Plan

> **Generated:** 2026-02-07
> **Based on:** Live testing session (Testing Guide results)
> **Goal:** Transform Fetch from a "boxy command parser" into a fluid, intelligent coding companion

---

## Executive Summary

Live testing revealed **4 critical architectural problems** that make Fetch feel rigid and unintelligent:

1. **Context Amnesia** — Agent forgets the active project between messages and mid-conversation
2. **Unnecessary Confirmation Loops** — LLM asks "are you sure?" when the user already said what they want
3. **Binary Intent Routing** — Messages go to either "chat (no tools)" or "action (tools)" with no middle ground
4. **Canned Command Responses** — Slash commands bypass the LLM entirely, producing rigid, personality-free output

**The fix is 5 phases, ordered by impact.** Each phase makes Fetch measurably more agentic.

---

## Test Results Summary (What Failed)

| ID | Test | Result | Root Cause |
|----|------|--------|------------|
| B2/B3 | `/project` shows `(unknown)` type | ⚠️ UX | Weak project type detection |
| B7 | `/status` shows system health, not git | ⚠️ Confusing | Command name collision |
| B16/B17 | `/add` and `/files` don't show full path | ⚠️ UX | Missing path context |
| B20 | `/auto` response unclear | ⚠️ UX | No explanation of what changed |
| B25 | `/mode verbose` fails | ⚠️ Bug | `/mode` doesn't accept `verbose` |
| C7 | "Create a file in demo-project" → asks for confirmation repeatedly | 🔴 Critical | LLM ignores session.currentProject |
| C9 | Task creation fails, agent forgets project after tool use | 🔴 Critical | System prompt not rebuilt after tool calls |
| C12 | `ask_user` used excessively | ⚠️ UX | No "just do it" directive in prompt |
| E1 | Session bleed between DM and Group | 🔴 Known | Sessions keyed on participant, not chat (DEFERRED) |

---

## Phase 1: Kill Context Amnesia (P0 — Critical)

> **Impact:** Fixes C7, C9, and the entire "forgets my project" problem
> **Files:** `agent/core.ts`, `agent/prompts.ts`

### Problem

The system prompt is built **once** at the top of `handleWithTools()` and never rebuilt after tool calls. When the LLM calls `workspace_select`, the session updates, but the system prompt still says "Workspace: None". The LLM literally cannot see its own changes.

### Fix 1.1: Rebuild System Prompt After State-Changing Tools

**File:** `fetch-app/src/agent/core.ts` → `handleWithTools()`

After the `workspace_select` sync block (around line 660), rebuild the system prompt and replace `messages[0]`:

```typescript
// AFTER workspace_select sync:
if (toolName === 'workspace_select' && result.success) {
  // ... existing sync code ...

  // REBUILD system prompt so LLM sees updated state
  const updatedContext = await buildContextSection(session);
  messages[0] = {
    role: 'system',
    content: getIdentityManager().buildSystemPrompt(activatedContext, updatedContext),
  };
  logger.info('System prompt rebuilt after workspace change');
}
```

### Fix 1.2: Inject Active Project as a Top-Level Directive

**File:** `fetch-app/src/agent/prompts.ts` → `buildContextSection()`

The project context is currently one line buried in a wall of text. Make it **the first thing the LLM sees** after its identity:

```typescript
// Replace the existing workspace section:
if (session.currentProject) {
  parts.push(`## 🎯 Active Workspace: ${session.currentProject.name}`);
  parts.push(`You are currently working in **${session.currentProject.name}** at \`${session.currentProject.path}\`.`);
  parts.push(`All file operations, tasks, and status queries default to this workspace.`);
  parts.push(`Do NOT ask the user to confirm or select a workspace — you are already in one.`);
  if (session.currentProject.gitBranch) {
    parts.push(`- Branch: \`${session.currentProject.gitBranch}\``);
  }
  if (session.currentProject.hasUncommitted) {
    parts.push(`- ⚠️ Has uncommitted changes`);
  }
}
```

### Fix 1.3: Persist Session BEFORE Next LLM Call

**File:** `fetch-app/src/agent/core.ts`

Currently `updateSession()` is called after `workspace_select`, but the session object in the tool loop might be stale. Ensure the session reference is always fresh:

```typescript
// After EVERY state-changing tool, re-read session:
if (['workspace_select', 'workspace_create', 'task_create'].includes(toolName)) {
  await sManager.updateSession(session);
  // Refresh local reference
  const fresh = await sManager.getSession(session.id);
  if (fresh) Object.assign(session, fresh);
}
```

---

## Phase 2: Stop the Confirmation Madness (P0 — Critical)

> **Impact:** Fixes C7 retry, C12 excessive ask_user, the "dumb agent" feel
> **Files:** `identity/manager.ts` (system prompt), `tools/interaction.ts`

### Problem

The system prompt contains directives like:
- "ask ONE clarifying question if needed"
- "When uncertain, ask rather than assume"

This causes the LLM to ask "Which project?" even when `session.currentProject` is set. It also causes "Proceed with file creation? (yes/no)" for simple requests.

### Fix 2.1: Add "Act, Don't Ask" Directives to System Prompt

**File:** `fetch-app/src/identity/manager.ts` → `buildSystemPrompt()`

Add these directives to the system prompt (high priority, near the top):

```markdown
## Autonomy Rules

1. **If the user tells you to do something, DO IT.** Do not ask for confirmation unless the action is destructive (delete, overwrite, reset).
2. **If a workspace is selected, use it.** Never ask "which project?" when currentProject is set.
3. **If the intent is clear from context, act immediately.** "Create index.ts" means create the file NOW, not "would you like me to create index.ts?"
4. **Use `ask_user` ONLY when genuinely missing information** — not for confirmation of what was already requested.
5. **Prefer doing and reporting over asking and waiting.** Show what you did, not what you're about to do.
```

### Fix 2.2: Guard `ask_user` Tool

**File:** `fetch-app/src/tools/interaction.ts`

Add a check: if the LLM calls `ask_user` with a question that's just confirming an action ("Would you like me to...?", "Shall I...?", "Do you want me to...?"), return an automatic "yes" instead of relaying to the user:

```typescript
// In ask_user handler:
const UNNECESSARY_PATTERNS = [
  /^(would|shall|should|do you want|can i|may i)\s+(you like|i)\s+(me to|to)/i,
  /^(proceed|continue|go ahead)\s*(with|\?)/i,
  /^(is that|does that|sound)\s*(ok|good|right|correct)/i,
];

const isUnnecessary = UNNECESSARY_PATTERNS.some(p => p.test(question.trim()));
if (isUnnecessary && session.preferences?.mode !== 'supervised') {
  return { success: true, output: JSON.stringify({ response: 'yes', auto: true }) };
}
```

### Fix 2.3: Mode-Aware Behavior

Make the autonomy level actually mean something in the prompt:

| Mode | Behavior |
|------|----------|
| `autonomous` | Never ask. Just do it. Report results. |
| `cautious` (default) | Ask only for destructive actions. Do everything else. |
| `supervised` | Ask before every tool call. Show plan first. |

**File:** `fetch-app/src/identity/manager.ts`

Inject mode-specific instructions that override the generic "ask if unsure" rule.

---

## Phase 3: Unify Intent Routing — Give Conversation Access to Tools (P1)

> **Impact:** Fixes the "conversation handler can't answer project questions" problem
> **Files:** `agent/core.ts`, `agent/intent.ts`

### Problem

Messages classified as `conversation` go to `handleConversation()` which makes an LLM call **with zero tools**. This means:
- "How's the project?" → No tools → hallucinated answer
- "What files changed?" → No tools → can't check git
- "List files" (10 chars, < 15) → forced to conversation → no tools

### Fix 3.1: Give Conversation Handler Read-Only Tools

**File:** `fetch-app/src/agent/core.ts` → `handleConversation()`

Instead of calling OpenAI with zero tools, provide a **subset** of read-only tools:

```typescript
const READ_ONLY_TOOLS = ['workspace_list', 'workspace_status', 'workspace_select'];

async function handleConversation(...) {
  const registry = getToolRegistry();
  const readOnlyTools = registry.toOpenAIFormat()
    .filter(t => READ_ONLY_TOOLS.includes(t.function.name));

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [...],
    tools: readOnlyTools.length > 0 ? readOnlyTools : undefined,
    tool_choice: readOnlyTools.length > 0 ? 'auto' : undefined,
    // ... rest
  });

  // Handle tool calls if the LLM decides to use them
  // (same loop as handleWithTools but limited to read-only tools)
}
```

### Fix 3.2: Remove the 15-Character Cutoff

**File:** `fetch-app/src/agent/intent.ts` → Phase 5

Remove or raise the arbitrary `trimmed.length < 15` → conversation rule. Short messages like "fix auth" or "list files" are valid action requests:

```typescript
// BEFORE:
if (trimmed.length < 15) {
  return { type: 'conversation', confidence: 0.6, reason: 'short_message', entities };
}

// AFTER:
if (trimmed.length < 5) {  // Only truly tiny messages (single word)
  return { type: 'conversation', confidence: 0.6, reason: 'short_message', entities };
}
```

### Fix 3.3: Add LLM Fallback for Ambiguous Intent

**File:** `fetch-app/src/agent/intent.ts`

When regex confidence is below 0.6, use a **fast LLM call** to classify:

```typescript
// At the end of classifyIntent, before fallback:
if (bestConfidence < 0.6) {
  // Use LLM to classify (1-shot, fast model)
  const llmIntent = await classifyWithLLM(trimmed, session);
  if (llmIntent) return llmIntent;
}
```

This is a small 1-shot prompt: "Given this message and context, is this a conversation or an action request? Reply with one word: conversation or action."

---

## Phase 4: Polish Command UX (P2)

> **Impact:** Fixes B2 (unknown type), B7 (/status confusion), B16/B17 (paths), B20/B25 (mode clarity)
> **Files:** `commands/parser.ts`, `agent/format.ts`, `workspace/manager.ts`

### Fix 4.1: Better Project Type Detection

**File:** `fetch-app/src/workspace/manager.ts`

The `(unknown)` type means no `package.json`, `go.mod`, etc. was found. Improve detection:

```typescript
// Add more type detection patterns:
const TYPE_INDICATORS: Record<string, string[]> = {
  'node': ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
  'typescript': ['tsconfig.json'],
  'python': ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
  'rust': ['Cargo.toml'],
  'go': ['go.mod'],
  'ruby': ['Gemfile'],
  'java': ['pom.xml', 'build.gradle'],
  'docker': ['Dockerfile', 'docker-compose.yml'],
  'empty': ['README.md'],  // Just a README = freshly initialized
};
```

For `demo-project` which only has a README.md, show `(empty project)` instead of `(unknown)`.

### Fix 4.2: Disambiguate `/status`

**File:** `fetch-app/src/commands/parser.ts`

Currently `/status` shows system health. Users expect git status. Fix:

```
/status → Show BOTH system + git status combined:
  📊 Fetch Status
  Mode: cautious | Auto-commit: ON | Verbose: OFF

  📂 demo-project (on main)
  ✨ Clean working tree
  No active task

/gs or /git status → Git-only status (shortcut)
```

### Fix 4.3: Show Full Paths in `/add` and `/files`

**File:** `fetch-app/src/commands/parser.ts` or `agent/format.ts`

When displaying files, show the project-relative path:

```
📂 Active Files (demo-project):
  • src/index.ts
  • README.md
```

### Fix 4.4: Descriptive Mode Toggles

**File:** `fetch-app/src/commands/parser.ts`

When mode changes, explain what it means:

```
🤖 Switched to autonomous mode.

What this means:
• I'll execute tasks without asking for confirmation
• I'll auto-commit changes when done
• Use /mode cautious to go back to asking first
```

### Fix 4.5: Fix `/mode verbose` Confusion

**File:** `fetch-app/src/commands/parser.ts`

When someone types `/mode verbose`, return a helpful redirect:

```
ℹ️ "verbose" isn't a mode — it's a setting.

Modes: supervised, cautious, autonomous
  → /mode <name>

Settings:
  → /verbose (toggle logging)
  → /autocommit (toggle auto-commit)
```

---

## Phase 5: Make It Feel Alive (P2)

> **Impact:** Overall personality and flow improvements
> **Files:** `identity/manager.ts`, `agent/format.ts`, `agent/core.ts`

### Fix 5.1: Reduce System Prompt Density

The current system prompt has **12+ sections** competing for attention. Consolidate:

1. **Identity** (2 lines — name, role)
2. **Active Workspace** (prominent, with directive)
3. **Autonomy Rules** (5 rules, always at top)
4. **Available Tools** (auto-injected by OpenAI)
5. **Conversation History** (compaction summary if exists)
6. **Skills** (only if matched)

Remove or condense:
- Pack member descriptions (move to tool descriptions)
- "Understanding Requests" rules (redundant with autonomy rules)
- "Response Format" rules (keep only WhatsApp-specific ones)
- Operational guidelines (merge into autonomy rules)

### Fix 5.2: Streaming-Style Progress

Instead of the agent going silent for 10+ seconds, use `onProgress` to send WhatsApp typing indicators or short status messages:

```
🐕 Reading project structure...
🐕 Creating index.ts...
✅ Done! Created index.ts with a hello world.
```

### Fix 5.3: Contextual Welcome (Not the Same Wall Every Time)

When a user says `@fetch hello`, don't dump the full capability list every time. Check if they've talked before:

```typescript
// If session.messages.length > 0:
"Hey! 👋 Still working on demo-project. What do you need?"

// If session.messages.length === 0 (first time):
// Show the full welcome
```

### Fix 5.4: Smart Error Recovery

When a tool fails, don't just say "error". Try to recover:

```typescript
// If workspace_select fails because name doesn't match:
// → Auto-list workspaces and suggest the closest match
// → "I don't see 'demo-projct'. Did you mean 'demo-project'?"
```

---

## Implementation Order

| Priority | Phase | Est. Effort | Impact |
|----------|-------|-------------|--------|
| 🔴 P0 | Phase 1: Kill Context Amnesia | 2-3 hours | Fixes the core "forgets project" bug |
| 🔴 P0 | Phase 2: Stop Confirmation Madness | 1-2 hours | Removes friction, feels intelligent |
| 🟡 P1 | Phase 3: Unified Intent Routing | 2-3 hours | Chat can answer project questions |
| 🟢 P2 | Phase 4: Command UX Polish | 1-2 hours | Cleaner command output |
| 🟢 P2 | Phase 5: Make It Feel Alive | 2-3 hours | Personality and flow |

**Total estimated effort:** 8-13 hours across all phases.

---

## Success Criteria (Retest After Fixes)

After implementing all phases, these tests should pass:

| Test | Current | Target |
|------|---------|--------|
| C7: "Create index.ts in demo-project" | ❌ Asks which project | ✅ Creates file immediately |
| C9: Task creation with active project | ❌ Forgets project | ✅ Uses active project |
| B7: `/status` | ⚠️ System-only | ✅ Shows git + system |
| B2: Project type | ⚠️ `(unknown)` | ✅ `(empty project)` or detected type |
| B20: `/auto` | ⚠️ No explanation | ✅ Explains what changed |
| Multi-turn: Select project → ask question → create file | ❌ Loses context | ✅ Maintains context throughout |
| "fix auth" (short message) | ❌ Routed to conversation | ✅ Routed to action with tools |

---

## Deferred Issues (Not In This Plan)

| Issue | Reason |
|-------|--------|
| Session Bleed (DM ↔ Group) | Requires session key refactor — separate effort |
| Harness execution testing (H1-H7) | Depends on kennel CLI setup — blocked |
| Proactive/Scheduling (I1-I4) | Lower priority, test after core fixes |
| Voice/Vision | Not tested yet — separate effort |
