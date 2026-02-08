# Agentic Architecture

## LLM-First Model (v4.0)

Fetch uses an **LLM-first architecture** where every message (except 5 safety escapes) takes the same single path through the LLM with full tool access. The LLM decides what to do — chat, call tools, or delegate to a harness — based on the message content and conversation context.

### What Was Removed (v4.0)

The following pre-LLM routing layers were deleted:

| Layer | What It Did | Why Removed |
|-------|-------------|-------------|
| **Instinct Registry** | 12 pattern-matching handlers for `/stop`, `yes`, `ping`, etc. | The LLM handles these naturally; 5 safety escapes remain for reliability |
| **Intent Classifier** | ~200 regex patterns classifying messages as `conversation`/`inquiry`/`action` | The LLM inherently knows intent — classifying before the LLM is redundant |
| **Mode Detector** | Regex-based classification feeding into handler selection | Collapsed into the single path |
| **35 Slash Commands** | `/project`, `/skill`, `/context`, `/trust`, `/mode`, etc. | Natural language + tools replaces all of them |

**Result:** ~2,800 lines deleted, 17 files removed, zero regressions. The LLM naturally responds to "hi" without calling tools and to "fix the bug" by calling `task_create`.

### Safety Gate (5 Escapes)

These bypass the LLM entirely because they must work even when the LLM is unreachable:

| Command | Effect |
|---------|--------|
| `/stop` | Kill the running task immediately |
| `/undo` | Soft git reset of the last commit |
| `/clear` | Clear conversation history |
| `/help` | Show command help |
| `/status` | Show system status |

### Single Path Architecture

```
Message → Security Gate → Safety Gate (5 commands)
                              ↓ (not matched)
                         LLM with ALL 12 tools
                              ↓
                         ReAct loop (reason → act → observe)
                              ↓
                         Response or task delegation
```

Every message that isn't a safety escape gets the full LLM with all 12 orchestrator tools. The LLM has the intelligence to:
- Respond conversationally to greetings
- Call `workspace_list` when asked about projects
- Call `task_create` when asked to build something
- Chain multiple tools together for complex requests

## ReAct Loop

<!-- DIAGRAM:react -->

The single `handleWithTools()` method runs a ReAct (Reason + Act) loop for every non-safety message:

1. **Decide** — LLM examines the goal, session context, and tool results
2. **Execute** — LLM calls one of 12 orchestrator tools (or responds directly)
3. **Observe** — Tool result is appended to context
4. **Reflect** — LLM decides whether to continue or report completion
5. Loop repeats until task is complete, cancelled, or max iterations reached

The loop uses OpenRouter to call the configured `AGENT_MODEL` with tool definitions, session context, identity prompt, and activated skills.

## Harness Delegation

When the ReAct loop calls `task_create`, Fetch delegates actual coding work to an AI CLI:

1. **Executor** looks up the requested harness from the **Registry**
2. **Spawner** wraps the CLI command with `docker exec -w <cwd> fetch-kennel <command>` (via the `container` field on the adapter config)
3. The harness adapter formats the goal into CLI-specific arguments
4. The CLI process runs against the mounted `/workspace` inside the Kennel container
5. Output is streamed back, parsed by the adapter, and reported to the user

### Container Field (v4.0)

Each harness adapter sets `container: 'fetch-kennel'` in its config. The spawner detects this and wraps the command with `docker exec`:

```bash
docker exec -w /workspace/my-project -e GOAL="..." fetch-kennel claude --print --dangerously-skip-permissions -p "..."
```

This replaces the previous approach where the command format was hardcoded.

### Adapter Hierarchy

All three harness adapters extend `AbstractHarnessAdapter`, which provides shared logic for:
- `formatGoal()` — Prepare the task description
- `isQuestion()` — Detect when the harness is asking a question
- `extractSummary()` — Parse completion summary from output
- `extractFileOperations()` — Detect file changes

Individual adapters override CLI-specific behavior (command args, output patterns).

## System Prompt Architecture

The system prompt is built dynamically by `IdentityManager.buildSystemPrompt()`:

1. **COLLAR.md** — Core identity and behavioral rules
2. **ALPHA.md** — Owner info and preferences
3. **Pack profiles** — Available agents as `<available_agents>` XML
4. **Available skills** — Skill summaries as `<available_skills>` XML
5. **Activated skills** — Full instruction bodies for triggered skills
6. **Session context** — Active project, git state, repo map, task state
7. **Tool definitions** — 12 orchestrator tools with Zod schemas

### Dynamic Prompt Rebuild

The system prompt is **rebuilt after every state-changing tool call**. When `workspace_select`, `workspace_create`, or `task_create` executes, the system message at `messages[0]` is replaced with a fresh prompt containing the updated project, git, and task context. This eliminates the "Context Amnesia" bug where the LLM would lose track of the active workspace mid-conversation.

### Autonomy Rules

The system prompt includes **7 autonomy rules** injected as `HIGHEST PRIORITY` directives. These enforce agentic behavior:

1. Execute tasks immediately — never ask permission to start work
2. Never ask "shall I?", "would you like me to?" — just do it
3. Infer missing details from context (project, files, branch)
4. Report results after completion, not plans before starting
5. When workspace is active, use it without asking
6. Chain tool calls to accomplish goals without pausing
7. Only ask the user when genuinely missing information

## Autonomy Guard

The `ask_user` tool includes a pattern-matching guard that intercepts unnecessary confirmation requests from the LLM. In non-supervised modes, questions matching patterns like:

- "Shall I...", "Would you like me to..."
- "Do you want me to...", "Should I..."
- "Can I proceed...", "Is it okay if I..."

…are auto-approved with the message "Yes, proceed." The LLM never sees the guard — it believes the user approved. This is controlled by `ToolContext.autonomyLevel` passed through the tool registry.
