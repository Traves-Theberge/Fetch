# Fetch v2: Agentic Development Platform

## Implementation Plan

---

## Executive Summary

Transform Fetch from a "command-response" system into a true **agentic coding assistant** optimized for WhatsApp's text-based interface. The key insight is that WhatsApp's constraints (no rich UI, async messaging) actually push us toward a better architecture: one that's transparent, recoverable, and works with the user rather than requiring constant supervision.

---

## Design Principles

### 1. **WhatsApp-Native Design**
- All output must be readable in plain text
- Diffs displayed as compact, scannable blocks
- Commands are simple words, not complex syntax
- Responses chunked for mobile readability

### 2. **Git as the Undo Button**
- Every approved change = automatic commit
- User can always say "undo" to revert
- Branch isolation for risky changes
- No fear of breaking things

### 3. **Progressive Autonomy**
- Start supervised (ask before each action)
- User can say "auto" to enable autonomous mode
- Agent checks in at milestones, not every step
- Always interruptible with "stop" or "pause"

### 4. **Conversation as Context**
- Full message history = agent memory
- Files mentioned become "active" context
- Context persists across sessions
- Clear commands to manage what agent "knows"

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FETCH v2                                        │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         WHATSAPP LAYER                                  │ │
│  │                                                                         │ │
│  │   Inbound: Parse messages, extract commands, queue tasks               │ │
│  │   Outbound: Format responses, chunk long messages, send updates        │ │
│  │                                                                         │ │
│  └───────────────────────────────────┬────────────────────────────────────┘ │
│                                      │                                       │
│  ┌───────────────────────────────────▼────────────────────────────────────┐ │
│  │                         SESSION MANAGER                                 │ │
│  │                                                                         │ │
│  │   • Conversation history (messages + tool calls)                       │ │
│  │   • Active files list (user's current focus)                           │ │
│  │   • Repo map cache (codebase structure)                                │ │
│  │   • User preferences (autonomy level, etc.)                            │ │
│  │                                                                         │ │
│  └───────────────────────────────────┬────────────────────────────────────┘ │
│                                      │                                       │
│  ┌───────────────────────────────────▼────────────────────────────────────┐ │
│  │                          AGENT CORE                                     │ │
│  │                                                                         │ │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │ │
│  │   │   DECIDE    │───▶│   EXECUTE   │───▶│   OBSERVE   │               │ │
│  │   │             │    │             │    │             │               │ │
│  │   │ What next?  │    │ Run tool    │    │ Record      │               │ │
│  │   └──────▲──────┘    └─────────────┘    └──────┬──────┘               │ │
│  │          │                                      │                      │ │
│  │          │           ┌─────────────┐           │                      │ │
│  │          └───────────│   REFLECT   │◀──────────┘                      │ │
│  │                      │             │                                   │ │
│  │                      │ Update plan │                                   │ │
│  │                      └─────────────┘                                   │ │
│  │                                                                         │ │
│  └───────────────────────────────────┬────────────────────────────────────┘ │
│                                      │                                       │
│  ┌───────────────────────────────────▼────────────────────────────────────┐ │
│  │                         TOOL REGISTRY                                   │ │
│  │                                                                         │ │
│  │   File Ops    │  Code Intel   │  Shell      │  Git        │  Control  │ │
│  │   ──────────  │  ──────────   │  ─────      │  ───        │  ───────  │ │
│  │   read_file   │  find_symbol  │  run_cmd    │  status     │  ask_user │ │
│  │   write_file  │  find_refs    │  run_tests  │  commit     │  complete │ │
│  │   search      │  get_errors   │  run_lint   │  diff       │  abort    │ │
│  │   list_dir    │  repo_map     │             │  undo       │           │ │
│  │                                                                         │ │
│  └───────────────────────────────────┬────────────────────────────────────┘ │
│                                      │                                       │
│  ┌───────────────────────────────────▼────────────────────────────────────┐ │
│  │                         APPROVAL GATE                                   │ │
│  │                                                                         │ │
│  │   Mode: supervised │ cautious │ autonomous                             │ │
│  │                                                                         │ │
│  │   Auto-approve: read_file, search, list_dir, find_*, repo_map          │ │
│  │   Ask user: write_file, run_cmd, commit                                │ │
│  │   Show diff: Always before write_file                                  │ │
│  │                                                                         │ │
│  └───────────────────────────────────┬────────────────────────────────────┘ │
│                                      │                                       │
│  ┌───────────────────────────────────▼────────────────────────────────────┐ │
│  │                         KENNEL (Sandbox)                                │ │
│  │                                                                         │ │
│  │   Isolated Docker container with:                                      │ │
│  │   • Mounted workspace (your code)                                      │ │
│  │   • Git, Node, Python, common dev tools                                │ │
│  │   • NO network access (security)                                       │ │
│  │   • Resource limits (memory, CPU)                                      │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### Session State (Persistent)

```typescript
interface Session {
  id: string;
  userId: string;                    // Phone number
  
  // Conversation
  messages: Message[];               // Full history with tool calls
  
  // Context
  activeFiles: string[];             // Files user is working with
  repoMap: string | null;            // Cached repo structure
  repoMapUpdatedAt: string | null;
  
  // Preferences
  preferences: {
    autonomyLevel: 'supervised' | 'cautious' | 'autonomous';
    autoCommit: boolean;
    verboseMode: boolean;
  };
  
  // Current task
  currentTask: AgentTask | null;
  
  // Timestamps
  createdAt: string;
  lastActivityAt: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
    result?: string;
    approved?: boolean;
  };
  timestamp: string;
}
```

### Agent Task State

```typescript
interface AgentTask {
  id: string;
  goal: string;                      // What user asked for
  status: TaskStatus;
  
  // Planning
  plan: PlanStep[];
  currentStepIndex: number;
  
  // Execution tracking
  iterations: number;
  maxIterations: number;             // Safety limit (default: 25)
  
  // Pending approval
  pendingApproval: ApprovalRequest | null;
  
  // Results
  filesModified: string[];
  commitsCreated: string[];
  output: string;
  
  // Timing
  startedAt: string;
  completedAt: string | null;
}

type TaskStatus = 
  | 'planning'           // Creating execution plan
  | 'executing'          // Running a tool
  | 'awaiting_approval'  // Waiting for user yes/no
  | 'paused'             // User said "pause"
  | 'completed'          // Goal achieved
  | 'failed'             // Unrecoverable error
  | 'aborted';           // User said "stop"

interface PlanStep {
  id: number;
  description: string;
  tool: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
  result?: string;
}

interface ApprovalRequest {
  tool: string;
  args: Record<string, unknown>;
  description: string;
  diff?: string;                     // For write_file
  createdAt: string;
}
```

---

## Tool Definitions

### File Operations

```typescript
const fileTools = [
  {
    name: 'read_file',
    description: 'Read contents of a file',
    autoApprove: true,
    parameters: {
      path: { type: 'string', required: true },
      startLine: { type: 'number' },
      endLine: { type: 'number' }
    }
  },
  {
    name: 'write_file',
    description: 'Write content to file (shows diff for approval)',
    autoApprove: false,
    parameters: {
      path: { type: 'string', required: true },
      content: { type: 'string', required: true }
    }
  },
  {
    name: 'edit_file',
    description: 'Make targeted edit using search/replace',
    autoApprove: false,
    parameters: {
      path: { type: 'string', required: true },
      search: { type: 'string', required: true },
      replace: { type: 'string', required: true }
    }
  },
  {
    name: 'search_files',
    description: 'Search for text/pattern across files',
    autoApprove: true,
    parameters: {
      query: { type: 'string', required: true },
      path: { type: 'string' },              // Optional: limit to path
      regex: { type: 'boolean' }
    }
  },
  {
    name: 'list_directory',
    description: 'List files in directory',
    autoApprove: true,
    parameters: {
      path: { type: 'string', required: true },
      recursive: { type: 'boolean' }
    }
  }
];
```

### Code Intelligence

```typescript
const codeTools = [
  {
    name: 'repo_map',
    description: 'Get condensed view of codebase structure',
    autoApprove: true,
    parameters: {
      path: { type: 'string' },              // Optional: subtree only
      depth: { type: 'number' }              // How deep to show
    }
  },
  {
    name: 'find_definition',
    description: 'Find where a symbol is defined',
    autoApprove: true,
    parameters: {
      symbol: { type: 'string', required: true },
      fileHint: { type: 'string' }
    }
  },
  {
    name: 'find_references',
    description: 'Find all usages of a symbol',
    autoApprove: true,
    parameters: {
      symbol: { type: 'string', required: true },
      fileHint: { type: 'string' }
    }
  },
  {
    name: 'get_diagnostics',
    description: 'Get TypeScript/ESLint errors in file',
    autoApprove: true,
    parameters: {
      path: { type: 'string' }               // Optional: all files if empty
    }
  }
];
```

### Shell Execution

```typescript
const shellTools = [
  {
    name: 'run_command',
    description: 'Execute shell command in workspace',
    autoApprove: false,                      // Always ask
    parameters: {
      command: { type: 'string', required: true },
      timeout: { type: 'number' }            // Seconds, default 60
    }
  },
  {
    name: 'run_tests',
    description: 'Run test suite',
    autoApprove: true,                       // Safe to auto-run
    parameters: {
      pattern: { type: 'string' },           // Test file pattern
      coverage: { type: 'boolean' }
    }
  },
  {
    name: 'run_lint',
    description: 'Run linter on files',
    autoApprove: true,
    parameters: {
      path: { type: 'string' },
      fix: { type: 'boolean' }               // Auto-fix requires approval
    }
  }
];
```

### Git Operations

```typescript
const gitTools = [
  {
    name: 'git_status',
    description: 'Show git status',
    autoApprove: true,
    parameters: {}
  },
  {
    name: 'git_diff',
    description: 'Show uncommitted changes',
    autoApprove: true,
    parameters: {
      path: { type: 'string' },
      staged: { type: 'boolean' }
    }
  },
  {
    name: 'git_commit',
    description: 'Commit staged changes',
    autoApprove: false,                      // In auto mode, this is auto
    parameters: {
      message: { type: 'string', required: true }
    }
  },
  {
    name: 'git_undo',
    description: 'Revert last commit (keeps changes unstaged)',
    autoApprove: false,
    parameters: {
      hard: { type: 'boolean' }              // true = discard changes
    }
  },
  {
    name: 'git_branch',
    description: 'Create and checkout new branch',
    autoApprove: false,
    parameters: {
      name: { type: 'string', required: true }
    }
  }
];
```

### Control Flow

```typescript
const controlTools = [
  {
    name: 'ask_user',
    description: 'Ask user for clarification or choice',
    parameters: {
      question: { type: 'string', required: true },
      options: { type: 'array' }             // Optional multiple choice
    }
  },
  {
    name: 'report_progress',
    description: 'Update user on current progress',
    parameters: {
      message: { type: 'string', required: true },
      percentComplete: { type: 'number' }
    }
  },
  {
    name: 'task_complete',
    description: 'Signal that the goal has been achieved',
    parameters: {
      summary: { type: 'string', required: true },
      filesModified: { type: 'array' }
    }
  },
  {
    name: 'task_blocked',
    description: 'Signal that agent cannot proceed',
    parameters: {
      reason: { type: 'string', required: true },
      suggestion: { type: 'string' }
    }
  }
];
```

---

## WhatsApp Commands

### User Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `/add <file>` | `+` | Add file to active context |
| `/drop <file>` | `-` | Remove file from context |
| `/files` | `/context` | Show active files |
| `/undo` | | Revert last change (git reset) |
| `/undo all` | | Revert all changes in session |
| `/status` | `/s` | Show current task status |
| `/plan` | | Show agent's current plan |
| `/pause` | | Pause current task |
| `/resume` | | Resume paused task |
| `/stop` | `/abort` | Cancel current task |
| `/auto` | | Toggle autonomous mode |
| `/mode` | | Show/set autonomy level |
| `/clear` | `/reset` | Clear conversation context |
| `/help` | `?` | Show available commands |

### Approval Responses

| Response | Aliases | Effect |
|----------|---------|--------|
| `yes` | `y`, `ok`, `👍` | Approve pending action |
| `no` | `n`, `nope`, `👎` | Reject pending action |
| `edit` | `modify` | Modify the proposed change |
| `skip` | | Skip this step, continue |
| `yesall` | `ya` | Approve this and future actions |

---

## Message Formatting

### Diff Display (WhatsApp-Optimized)

```
📝 *Edit: src/auth/session.ts*
─────────────────────
Line 45:
```
- const expired = new Date(exp) < new Date();
+ const expired = exp < Date.now() / 1000;
```
─────────────────────
Apply? (yes/no/edit)
```

### Progress Updates

```
🔄 *Working on: Fix auth bug*

✅ 1. Read session.ts
✅ 2. Found expiry check issue  
⏳ 3. Preparing fix...
⬚ 4. Run tests
⬚ 5. Commit changes

Step 3/5 │ Auto-commit: ON
```

### Task Completion

```
✅ *Task Complete*

Fixed the session expiry bug. Changes:

📁 *Modified:*
• src/auth/session.ts (1 change)

📝 *Commits:*
• `a1b2c3d` fix: use UTC for token expiry

🧪 *Tests:* 12/12 passing

Say "undo" to revert, or continue chatting.
```

### Error/Blocked State

```
⚠️ *Need Help*

I tried to run tests but got an error:

```
npm ERR! Missing script: "test"
```

Options:
1. Tell me the correct test command
2. Skip testing and continue
3. Abort task

Reply with 1, 2, or 3
```

---

## Agent Loop Implementation

### Core Loop

```typescript
class AgentCore {
  private session: Session;
  private llm: AnthropicClient;
  private tools: Tool[];
  
  async processMessage(userMessage: string): Promise<string[]> {
    // Add user message to history
    this.session.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    });
    
    // Check for commands first
    if (userMessage.startsWith('/')) {
      return this.handleCommand(userMessage);
    }
    
    // Check for approval response
    if (this.session.currentTask?.pendingApproval) {
      return this.handleApprovalResponse(userMessage);
    }
    
    // Check for task resumption
    if (this.session.currentTask?.status === 'paused') {
      if (this.isResumeIntent(userMessage)) {
        return this.resumeTask();
      }
    }
    
    // Start new task or continue conversation
    return this.runAgentLoop(userMessage);
  }
  
  private async runAgentLoop(userMessage: string): Promise<string[]> {
    const responses: string[] = [];
    
    // Create or update task
    if (!this.session.currentTask) {
      this.session.currentTask = this.createTask(userMessage);
      responses.push(this.formatTaskStarted());
    }
    
    const task = this.session.currentTask;
    let iterations = 0;
    
    while (iterations < task.maxIterations) {
      iterations++;
      task.iterations = iterations;
      
      // DECIDE: Ask LLM what to do next
      const decision = await this.decide();
      
      // Handle different decision types
      switch (decision.type) {
        case 'use_tool':
          // Check if approval needed
          if (this.needsApproval(decision.tool)) {
            task.pendingApproval = {
              tool: decision.tool.name,
              args: decision.args,
              description: decision.reasoning,
              diff: await this.generateDiff(decision),
              createdAt: new Date().toISOString()
            };
            task.status = 'awaiting_approval';
            responses.push(this.formatApprovalRequest(task.pendingApproval));
            return responses;  // Wait for user response
          }
          
          // Execute tool
          task.status = 'executing';
          const result = await this.executeTool(decision.tool, decision.args);
          
          // Record in conversation
          this.session.messages.push({
            role: 'tool',
            content: result.output,
            toolCall: {
              name: decision.tool.name,
              args: decision.args,
              result: result.output,
              approved: true
            },
            timestamp: new Date().toISOString()
          });
          
          // Handle write operations
          if (decision.tool.name === 'write_file' || decision.tool.name === 'edit_file') {
            task.filesModified.push(decision.args.path as string);
            
            // Auto-commit if enabled
            if (this.session.preferences.autoCommit) {
              const commitHash = await this.autoCommit(decision);
              task.commitsCreated.push(commitHash);
            }
          }
          break;
          
        case 'ask_user':
          responses.push(this.formatQuestion(decision.question, decision.options));
          return responses;  // Wait for user response
          
        case 'report_progress':
          if (this.session.preferences.verboseMode) {
            responses.push(this.formatProgress(task));
          }
          break;
          
        case 'complete':
          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          task.output = decision.summary;
          responses.push(this.formatTaskComplete(task));
          this.session.currentTask = null;
          return responses;
          
        case 'blocked':
          task.status = 'failed';
          responses.push(this.formatBlocked(decision.reason, decision.suggestion));
          return responses;
      }
    }
    
    // Hit iteration limit
    responses.push(this.formatIterationLimit(task));
    return responses;
  }
  
  private async decide(): Promise<Decision> {
    // Build context for LLM
    const systemPrompt = this.buildSystemPrompt();
    const messages = this.buildMessages();
    
    // Call Claude with tool definitions
    const response = await this.llm.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages,
      tools: this.tools.map(t => t.toClaudeFormat())
    });
    
    return this.parseDecision(response);
  }
  
  private buildSystemPrompt(): string {
    const repoMap = this.session.repoMap || 'No repo map available';
    const activeFiles = this.session.activeFiles.join(', ') || 'None';
    const mode = this.session.preferences.autonomyLevel;
    
    return `You are Fetch, an AI coding assistant communicating via WhatsApp.

## Your Capabilities
You can read files, edit code, run commands, and manage git - all within a sandboxed workspace.

## Current Context
- Active files: ${activeFiles}
- Autonomy mode: ${mode}
- Auto-commit: ${this.session.preferences.autoCommit ? 'ON' : 'OFF'}

## Repository Structure
${repoMap}

## Guidelines
1. Be concise - responses appear on mobile phones
2. Show diffs before making changes
3. Run tests after code changes when possible
4. Commit with clear, conventional messages
5. Ask for clarification when requirements are ambiguous
6. Break large tasks into smaller steps

## Tool Usage
- Use read_file to understand code before editing
- Use edit_file for targeted changes (search/replace)
- Use write_file only for new files or complete rewrites
- Use repo_map when you need to understand project structure
- Use ask_user when you need clarification

## When to Complete
Call task_complete when:
- The user's goal is achieved
- Tests pass (if applicable)
- Changes are committed (if auto-commit is on)`;
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal:** Core infrastructure for agentic loop

#### 1.1 Session Management
```
fetch-app/src/session/
├── types.ts          # Session, Message, Task interfaces
├── store.ts          # lowdb persistence
└── manager.ts        # Session CRUD operations
```

**Tasks:**
- [ ] Define TypeScript interfaces for Session, Message, AgentTask
- [ ] Create lowdb schema with sessions collection
- [ ] Implement session creation, retrieval, update
- [ ] Add session cleanup for inactive sessions (>7 days)
- [ ] Write unit tests for session manager

#### 1.2 Tool Registry
```
fetch-app/src/tools/
├── types.ts          # Tool interface definitions
├── registry.ts       # Tool registration and lookup
├── file.ts           # read_file, write_file, edit_file, search, list
├── code.ts           # repo_map, find_definition, find_references
├── shell.ts          # run_command, run_tests, run_lint
├── git.ts            # status, diff, commit, undo, branch
└── control.ts        # ask_user, report_progress, complete, blocked
```

**Tasks:**
- [ ] Define Tool interface with Claude-compatible schema generation
- [ ] Implement tool registry with auto-approve flags
- [ ] Implement file tools (read, write, edit, search, list)
- [ ] Implement shell tools (run_command, run_tests)
- [ ] Implement git tools (status, diff, commit, undo)
- [ ] Implement control tools (ask_user, complete, blocked)
- [ ] Write integration tests for each tool

#### 1.3 Repo Map Generator
```
fetch-app/src/tools/code.ts
```

**Tasks:**
- [ ] Implement tree-sitter or regex-based symbol extraction
- [ ] Generate condensed repo map (files + signatures)
- [ ] Cache repo map with invalidation on file changes
- [ ] Limit repo map to fit in context window (~8K tokens)

---

### Phase 2: Agent Core (Week 3-4)

**Goal:** Working agent loop with tool execution

#### 2.1 Agent Loop
```
fetch-app/src/agent/
├── core.ts           # Main agent loop
├── decide.ts         # LLM decision making
├── execute.ts        # Tool execution with Docker
├── approval.ts       # Approval gate logic
└── format.ts         # WhatsApp message formatting
```

**Tasks:**
- [ ] Implement core agent loop (decide → execute → observe → reflect)
- [ ] Build system prompt with context injection
- [ ] Implement decision parsing from Claude tool_use responses
- [ ] Add iteration limits and safety checks
- [ ] Implement approval gate with mode-based logic
- [ ] Add tool result recording to conversation history

#### 2.2 Diff Generation
```
fetch-app/src/agent/diff.ts
```

**Tasks:**
- [ ] Implement unified diff generation for write_file
- [ ] Implement search/replace preview for edit_file
- [ ] Create WhatsApp-friendly diff formatting
- [ ] Add line number context for large files

#### 2.3 Git Integration
```
fetch-app/src/agent/git.ts
```

**Tasks:**
- [ ] Implement auto-commit after approved writes
- [ ] Generate conventional commit messages from changes
- [ ] Implement undo (git reset --soft HEAD~1)
- [ ] Implement undo all (reset to session start)
- [ ] Add branch creation for large changes

---

### Phase 3: WhatsApp Integration (Week 5)

**Goal:** Seamless chat experience

#### 3.1 Command Parser
```
fetch-app/src/bridge/commands.ts
```

**Tasks:**
- [ ] Parse /commands with arguments
- [ ] Parse approval responses (yes/no/edit/skip)
- [ ] Handle emoji responses (👍/👎)
- [ ] Support command aliases

#### 3.2 Message Formatter
```
fetch-app/src/bridge/format.ts
```

**Tasks:**
- [ ] Format diffs for WhatsApp (monospace, compact)
- [ ] Format progress updates with emoji indicators
- [ ] Format task completion summaries
- [ ] Chunk long messages (WhatsApp limit handling)
- [ ] Add typing indicators during processing

#### 3.3 Bridge Updates
```
fetch-app/src/bridge/client.ts
```

**Tasks:**
- [ ] Integrate session manager into message handler
- [ ] Route messages through agent core
- [ ] Handle multi-message responses
- [ ] Add "typing..." indicator during processing
- [ ] Implement graceful error handling

---

### Phase 4: Polish & Testing (Week 6)

**Goal:** Production-ready system

#### 4.1 Error Handling
**Tasks:**
- [ ] Graceful handling of tool execution failures
- [ ] LLM API error recovery with retry
- [ ] Session corruption recovery
- [ ] Docker container health checks

#### 4.2 Testing
**Tasks:**
- [ ] Unit tests for all tools
- [ ] Integration tests for agent loop
- [ ] End-to-end tests for common workflows
- [ ] Load testing for rate limits

#### 4.3 Documentation
**Tasks:**
- [ ] Update README with v2 features
- [ ] Create user guide with examples
- [ ] Document all commands
- [ ] Add troubleshooting guide

---

## File Structure (Final)

```
fetch-app/
├── src/
│   ├── index.ts                    # Entry point
│   │
│   ├── bridge/                     # WhatsApp layer
│   │   ├── client.ts               # WhatsApp client (updated)
│   │   ├── commands.ts             # Command parser (updated)
│   │   └── format.ts               # Message formatting (new)
│   │
│   ├── session/                    # Session management (new)
│   │   ├── types.ts
│   │   ├── store.ts
│   │   └── manager.ts
│   │
│   ├── agent/                      # Agent core (new)
│   │   ├── core.ts                 # Main loop
│   │   ├── decide.ts               # LLM integration
│   │   ├── execute.ts              # Tool execution
│   │   ├── approval.ts             # Approval gate
│   │   ├── diff.ts                 # Diff generation
│   │   └── git.ts                  # Git helpers
│   │
│   ├── tools/                      # Tool registry (new)
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   ├── file.ts
│   │   ├── code.ts
│   │   ├── shell.ts
│   │   ├── git.ts
│   │   └── control.ts
│   │
│   ├── security/                   # Security (unchanged)
│   │   ├── gate.ts
│   │   ├── rateLimiter.ts
│   │   ├── validator.ts
│   │   └── index.ts
│   │
│   └── utils/                      # Utilities
│       ├── logger.ts
│       ├── sanitize.ts
│       └── truncate.ts
│
├── package.json
├── tsconfig.json
└── Dockerfile
```

---

## Success Criteria

### Functional Requirements
- [ ] Agent can read, understand, and modify code files
- [ ] Agent commits changes with meaningful messages
- [ ] User can undo any change with single command
- [ ] Agent maintains context across messages
- [ ] Agent asks for clarification when needed
- [ ] Agent runs tests after code changes

### Performance Requirements
- [ ] Response time < 5s for simple queries
- [ ] Full task completion < 5 minutes for typical changes
- [ ] Memory usage < 500MB for Bridge container

### Security Requirements
- [ ] All code execution sandboxed in Kennel
- [ ] No arbitrary command execution without approval
- [ ] Input validation on all user input
- [ ] Rate limiting maintained

---

## Example Workflows

### Workflow 1: Bug Fix

```
User: There's a bug in the login - users get logged out randomly

Fetch: 🔍 Let me investigate the auth system...

[reads auth files, searches for session handling]

Found it! In `session.ts` line 45, the expiry check uses local 
time instead of UTC. Here's the fix:

📝 *Edit: src/auth/session.ts*
─────────────────────
Line 45:
```
- const expired = new Date(exp) < new Date();
+ const expired = exp < Date.now() / 1000;
```
─────────────────────
Apply? (yes/no)

User: yes

Fetch: ✅ Applied. Running tests...

🧪 12/12 tests passing

📝 Committed: `fix: use UTC timestamp for session expiry check`

Anything else?
```

### Workflow 2: New Feature

```
User: Add a /health endpoint to the API

Fetch: 📋 I'll add a health check endpoint. Let me look at the 
existing route structure...

[reads routes, understands patterns]

I'll create the endpoint following your existing patterns:

📝 *New file: src/routes/health.ts*
─────────────────────
```typescript
import { Router } from 'express';

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;
```
─────────────────────

📝 *Edit: src/app.ts* (add import + route)

Apply both? (yes/no)

User: yes

Fetch: ✅ Created health.ts
✅ Updated app.ts
🧪 Tests passing

📝 Committed: `feat: add /health endpoint for monitoring`

Want me to also add a /ready endpoint for k8s?
```

### Workflow 3: Autonomous Mode

```
User: /auto

Fetch: 🤖 Autonomous mode ON. I'll work independently and 
check in at milestones. Say "stop" anytime to pause.

User: Refactor the auth module to use JWT instead of sessions

Fetch: 🔄 Starting refactor...

[5 minutes later]

✅ *Task Complete*

Refactored auth from sessions to JWT:

📁 *Changes:*
• Deleted: src/auth/session.ts
• Created: src/auth/jwt.ts
• Modified: src/auth/middleware.ts
• Modified: src/routes/auth.ts
• Modified: src/config/index.ts
• Updated: 8 test files

📝 *Commits:* (4 total)
• `refactor: replace session auth with JWT`
• `feat: add JWT utilities and middleware`
• `test: update auth tests for JWT`
• `docs: update auth documentation`

🧪 *Tests:* 24/24 passing

Say "undo all" to revert, or continue chatting.
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Agent makes destructive changes | Git auto-commit + easy undo |
| Agent gets stuck in loop | Iteration limit (25) + user can "stop" |
| Context window overflow | Repo map condensation + message truncation |
| Long-running tasks | Progress updates + pause/resume |
| Security vulnerabilities | Sandbox execution + approval gate |
| API costs | Rate limiting + efficient prompting |

---

## Next Steps

1. **Review this plan** - Any adjustments needed?
2. **Set up development branch** - `git checkout -b feat/agentic-v2`
3. **Start Phase 1** - Session management and tool registry
4. **Iterate** - Build, test, refine

Ready to start implementation?
