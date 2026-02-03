# Fetch V2 Architecture Review

A comprehensive review of the V2 orchestrator architecture and how it works end-to-end.

---

## Executive Summary

Fetch V2 replaces the original 4-mode agent system with a streamlined **3-intent orchestrator** that delegates complex tasks to specialized AI CLI tools (harnesses). This architecture provides:

- **Simpler routing** — 3 intents instead of 4 modes
- **Powerful delegation** — Complex tasks use Claude, Gemini, or Copilot CLIs directly
- **Focused tools** — 8 orchestrator tools instead of 24
- **Better separation** — Orchestrator handles workspace, harnesses handle coding

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        WhatsApp Message                         │
│                     "@fetch build a REST API"                   │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Security Gate                              │
│  • @fetch trigger check                                         │
│  • Whitelist verification (OWNER_PHONE_NUMBER only)             │
│  • Rate limiting (30 req/min)                                   │
│  • Input validation (no shell injection)                        │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Intent Classifier                            │
│                    (fetch-app/src/agent/intent.ts)              │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Conversation│  │  Workspace  │  │    Task     │             │
│  │  Patterns   │  │   Patterns  │  │  Patterns   │             │
│  │ hello, hi,  │  │ list, show  │  │ build, fix  │             │
│  │ thanks, hey │  │ projects,   │  │ create, add │             │
│  │             │  │ switch, git │  │ refactor    │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ 💬       │    │ 📁       │    │ 🚀       │
    │ Direct   │    │ 8 Tools  │    │ Harness  │
    │ Response │    │ Execute  │    │ Delegate │
    └──────────┘    └──────────┘    └────┬─────┘
                                         │
                         ┌───────────────┼───────────────┐
                         ▼               ▼               ▼
                   ┌──────────┐   ┌──────────┐   ┌──────────┐
                   │ Claude   │   │ Gemini   │   │ Copilot  │
                   │ CLI      │   │ CLI      │   │ CLI      │
                   └──────────┘   └──────────┘   └──────────┘
```

---

## The 3 Intents

### 💬 Conversation Intent

**Purpose:** Handle casual chat, greetings, and thanks without any tool calls.

**Trigger Patterns:**
- Greetings: `hello`, `hi`, `hey`, `good morning`, `howdy`
- Thanks: `thanks`, `thank you`, `ty`, `cheers`, `appreciate`
- Help: `help`, `what can you do`
- Short messages (< 10 chars)

**Handling:**
```typescript
// Direct LLM response, no tools
const response = await llm.chat(message);
return formatResponse(response);
```

**Example Flow:**
```
User: "@fetch hello!"
→ Intent: conversation (confidence: 0.95)
→ Handler: handleConversation()
→ Response: "Hey! 👋 What can I help you build today?"
```

---

### 📁 Workspace Intent

**Purpose:** Project management and git operations using 8 orchestrator tools.

**Trigger Patterns:**
- Listing: `list`, `show`, `projects`, `workspaces`
- Selection: `switch`, `use`, `work on`, `select`
- Status: `status`, `git status`, `diff`, `log`
- Creation: `clone`, `init`, `create workspace`

**Available Tools:**

| Tool | Description | Auto-Approve |
|------|-------------|--------------|
| `list_workspaces` | List all projects in /workspace | ✅ |
| `get_workspace_info` | Get details about a project | ✅ |
| `switch_workspace` | Change active project | ✅ |
| `create_workspace` | Initialize new project | ❌ |
| `clone_repository` | Clone from git URL | ❌ |
| `get_git_status` | Show git status | ✅ |
| `get_git_diff` | Show file changes | ✅ |
| `get_git_log` | Show commit history | ✅ |

**Example Flow:**
```
User: "@fetch list projects"
→ Intent: workspace (confidence: 0.90)
→ Handler: handleWorkspace()
→ Tool: list_workspaces()
→ Response: "📁 Available projects:\n• my-app\n• api-server\n• web-client"
```

---

### 🚀 Task Intent

**Purpose:** Complex coding work delegated to AI CLI harnesses.

**Trigger Patterns:**
- Creation: `build`, `create`, `make`, `implement`
- Modification: `fix`, `add`, `update`, `change`
- Refactoring: `refactor`, `improve`, `optimize`
- Analysis: `review`, `analyze`, `debug`, `test`

**Handling:**
```typescript
// Delegate to harness (Claude, Gemini, or Copilot)
const harness = registry.get(preferredHarness);
const config = harness.buildConfig({ task: message, workspace });
const result = await registry.execute(harness.name, config);
return formatTaskResult(result);
```

**Example Flow:**
```
User: "@fetch build a user authentication system"
→ Intent: task (confidence: 0.95)
→ Handler: handleTask()
→ Harness: claude
→ CLI: docker exec fetch-kennel claude --print "Build a user authentication system"
→ [Claude CLI executes multi-step task]
→ Response: "✅ Task Complete: Created auth system with login, register, JWT tokens"
```

---

## Harness System

The harness system provides adapters for different AI CLI tools.

### Interface

```typescript
interface HarnessAdapter {
  name: string;           // 'claude', 'gemini', 'copilot'
  executable: string;     // CLI command to run
  
  // Build CLI configuration
  buildConfig(task: TaskConfig): HarnessConfig;
  
  // Parse streaming output
  parseOutputLine(line: string): ParsedOutput;
  
  // Detect if AI is asking a question
  detectQuestion(line: string): boolean;
  
  // Extract summary from completed output
  extractSummary(output: string): string;
}
```

### Available Harnesses

| Harness | CLI | Best For |
|---------|-----|----------|
| `claude` | `claude --print` | Complex coding, refactoring, analysis |
| `gemini` | `gemini` | Code explanations, quick tasks |
| `copilot` | `gh copilot suggest` | Command suggestions, Git workflows |

### Registry

```typescript
// harness/registry.ts
class HarnessRegistry {
  private adapters: Map<string, HarnessAdapter>;
  
  get(name: string): HarnessAdapter | undefined;
  execute(name: string, config: HarnessConfig): Promise<HarnessResult>;
  listAdapters(): HarnessAdapter[];
}

// Registered adapters
registry.register(new ClaudeAdapter());
registry.register(new GeminiAdapter());
registry.register(new CopilotAdapter());
```

---

## File Structure

```
fetch-app/src/
├── agent/
│   ├── core.ts         # V2 Orchestrator - main entry point
│   ├── intent.ts       # Intent classification (3 types)
│   └── prompts.ts      # System prompts for orchestrator
├── harness/
│   ├── types.ts        # HarnessAdapter interface
│   ├── claude.ts       # Claude CLI adapter
│   ├── gemini.ts       # Gemini CLI adapter
│   ├── copilot.ts      # Copilot CLI adapter
│   ├── registry.ts     # Harness registry
│   └── index.ts        # Barrel exports
├── tools/
│   ├── types.ts        # Tool interface
│   ├── registry.ts     # Tool registry
│   ├── workspace.ts    # 8 workspace tools
│   └── schemas.ts      # Zod validation schemas
├── handler/
│   └── index.ts        # Request handler (uses V2 orchestrator)
└── tests/
    ├── unit/           # Unit tests
    ├── integration/    # Integration tests
    └── e2e/            # End-to-end tests
```

---

## Message Flow Example

### Complete Flow: Task Delegation

```
1. USER SENDS MESSAGE
   WhatsApp → Bridge: "@fetch create a login form component"

2. SECURITY GATE
   ├── Check @fetch prefix ✓
   ├── Verify OWNER_PHONE_NUMBER ✓
   ├── Rate limit check ✓
   └── Input validation ✓

3. INTENT CLASSIFICATION
   ├── Message: "create a login form component"
   ├── Patterns matched: ["create"] 
   ├── Intent: task
   └── Confidence: 0.92

4. TASK HANDLER
   ├── Select harness: claude (default)
   ├── Build config:
   │   ├── task: "create a login form component"
   │   ├── workspace: "/workspace/my-app"
   │   └── context: session.messages
   └── Execute harness

5. HARNESS EXECUTION
   ├── Command: docker exec fetch-kennel claude --print "..."
   ├── Stream output parsing:
   │   ├── detectQuestion() → false
   │   ├── parseOutputLine() → progress updates
   │   └── extractSummary() → completion message
   └── Collect result

6. RESPONSE FORMATTING
   ├── Success: true
   ├── Summary: "Created LoginForm.tsx with email/password fields..."
   └── Files modified: ["src/components/LoginForm.tsx"]

7. WHATSAPP RESPONSE
   Bridge → WhatsApp: "✅ Task Complete\n\nCreated login form..."
```

---

## Benefits of V2 Architecture

### vs. V1 (4-Mode System)

| Aspect | V1 (4-Mode) | V2 (Orchestrator) |
|--------|-------------|-------------------|
| Intents | 4 (conversation, inquiry, action, task) | 3 (conversation, workspace, task) |
| Tools | 24 internal tools | 8 orchestrator + harness CLIs |
| Complex tasks | Internal ReAct loop | Delegated to AI CLIs |
| Coding quality | Limited by internal tool chain | Full power of Claude/Gemini/Copilot |
| Maintenance | 24 tools to maintain | 8 tools + 3 adapters |
| Extensibility | Add more internal tools | Add new harness adapters |

### Key Advantages

1. **Leverage AI CLI capabilities** — Claude, Gemini, and Copilot CLIs are optimized for coding tasks
2. **Simpler orchestrator** — Focus on routing, not execution
3. **Better separation of concerns** — Workspace management vs. coding tasks
4. **Easier to extend** — Adding a new AI CLI just requires a new adapter
5. **Reduced token usage** — Orchestrator is lightweight, heavy lifting done by harnesses

---

## Testing

### Test Coverage

```
tests/
├── unit/
│   ├── intent.test.ts          # Intent classification
│   ├── harness-adapters.test.ts # Harness adapters
│   └── tool-registry.test.ts    # Tool registry
├── integration/
│   └── (planned)
└── e2e/
    ├── task-flow.test.ts        # Task delegation flow
    ├── conversation.test.ts     # Conversation handling
    └── workspace.test.ts        # Workspace operations
```

### Running Tests

```bash
cd fetch-app
npx vitest run          # Run all tests
npx vitest run --ui     # Interactive UI
npx vitest --coverage   # With coverage report
```

### Current Status

- ✅ 63 tests passing
- ✅ Intent classification fully tested
- ✅ Harness adapters tested
- ✅ E2E flows tested

---

## Configuration

### Environment Variables

```dotenv
# Required
OWNER_PHONE_NUMBER=15551234567
OPENROUTER_API_KEY=sk-or-v1-...

# Agent
AGENT_MODEL=openai/gpt-4.1-nano    # For orchestrator decisions

# Harnesses (at least one required)
ENABLE_CLAUDE=true
ENABLE_GEMINI=false
ENABLE_COPILOT=true

# Optional
DEFAULT_HARNESS=claude             # Preferred harness for tasks
LOG_LEVEL=info
```

### Harness Selection

The orchestrator selects harnesses based on:
1. `DEFAULT_HARNESS` environment variable
2. Enabled harnesses (`ENABLE_CLAUDE`, etc.)
3. Task type (future: smart routing based on task)

---

## Future Enhancements

### Planned for Phase 7+

1. **Smart Harness Routing** — Analyze task to choose best harness
2. **Parallel Execution** — Run multiple harnesses for complex tasks
3. **Harness Chaining** — Use output of one harness as input to another
4. **Custom Harnesses** — Plugin system for user-defined adapters
5. **Token Optimization** — Compress context for large codebases
6. **Caching** — Cache common responses and tool results

---

## Summary

The V2 architecture simplifies Fetch by:

1. **Reducing intent complexity** — 3 clear intents instead of 4 overlapping modes
2. **Delegating coding work** — Harnesses handle complex tasks with full AI CLI power
3. **Focusing the orchestrator** — 8 workspace tools instead of 24 general tools
4. **Enabling extensibility** — Easy to add new AI CLI adapters

This design follows the principle: **"Do one thing well, delegate the rest."**
