# Fetch v2 - Architecture & Implementation Plan

> **Document Version:** 1.0  
> **Created:** February 3, 2026  
> **Status:** Planning Phase

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Component Specifications](#3-component-specifications)
4. [Tool Inventory](#4-tool-inventory)
5. [Prompt Inventory](#5-prompt-inventory)
6. [Data Models & Type Definitions](#6-data-models--type-definitions)
7. [Validation & Schemas](#7-validation--schemas)
8. [Naming Conventions](#8-naming-conventions)
9. [Documentation Standards](#9-documentation-standards)
10. [File Structure](#10-file-structure)
11. [Implementation Phases](#11-implementation-phases)
12. [Interaction Diagrams](#12-interaction-diagrams)
13. [Assumption Validation](#13-assumption-validation)
14. [Phase 6 Detailed Implementation](#14-phase-6-detailed-implementation)
15. [Risk Assessment](#15-risk-assessment)
16. [Open Questions](#16-open-questions)

---

## 1. Executive Summary

### 1.1 Current State Problems

| Problem | Impact |
|---------|--------|
| 24 redundant tools | Duplicates what Claude/Gemini/Copilot already do better |
| Intent classification failures | LLM responds conversationally instead of using tools |
| Direct file operations | Fetch tries to read/write files instead of delegating |
| Monolithic agent | Single LLM doing orchestration + execution |

### 1.2 Target State

**Fetch becomes a lightweight orchestrator** that:
- Routes tasks to specialized coding agents (Claude Code, Gemini CLI, Copilot CLI)
- Manages conversation state and user interaction
- Monitors task progress and relays updates to WhatsApp
- Handles approvals, cancellations, and error recovery

**Fetch does NOT:**
- Read/write files directly
- Execute shell commands directly
- Make git commits directly
- Perform code analysis directly

### 1.3 Key Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Tools | 24 | 8 |
| Prompt files | 1 | 6 |
| Lines of code | ~5000 | ~2000 |
| Average response time | N/A | <2s for routing |
| Task delegation success | 0% | >95% |

---

## 2. Architecture Overview

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER (WhatsApp)                                 │
└─────────────────────────────────────────────────┬───────────────────────────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FETCH BRIDGE CONTAINER                             │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        WhatsApp Client (whatsapp-web.js)              │   │
│  │  • Receives messages                                                  │   │
│  │  • Sends responses                                                    │   │
│  │  • Handles auth, QR codes                                            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Security Gate                                 │   │
│  │  • Phone number whitelist                                            │   │
│  │  • Trigger detection (@fetch)                                        │   │
│  │  • Rate limiting                                                     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Intent Classifier                                │   │
│  │  • TASK: Coding work → Task Manager                                  │   │
│  │  • STATUS: Progress check → Task Manager                             │   │
│  │  • CONTROL: Stop/pause → Task Manager                                │   │
│  │  • WORKSPACE: Repo management → Workspace Manager                    │   │
│  │  • APPROVAL: Yes/No response → Task Manager                          │   │
│  │  • CONVERSATION: Chat → Conversation Handler                         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│           ┌──────────────────────────┼──────────────────────────┐           │
│           ▼                          ▼                          ▼           │
│  ┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────┐     │
│  │   Workspace     │    │    Task Manager     │    │  Conversation   │     │
│  │    Manager      │    │                     │    │    Handler      │     │
│  │                 │    │  • Create tasks     │    │                 │     │
│  │  • List repos   │    │  • Route to agents  │    │  • General chat │     │
│  │  • Select repo  │    │  • Monitor progress │    │  • Help/usage   │     │
│  │  • Get status   │    │  • Handle results   │    │  • Capabilities │     │
│  └─────────────────┘    └──────────┬──────────┘    └─────────────────┘     │
│                                    │                                        │
│  ┌─────────────────────────────────┴─────────────────────────────────┐     │
│  │                         Session Manager                            │     │
│  │  • Conversation history                                           │     │
│  │  • User preferences                                               │     │
│  │  • Active tasks                                                   │     │
│  │  • Pending approvals                                              │     │
│  └───────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  Model: GPT-4.1-mini (orchestration only - no code generation)              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Docker Socket
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           KENNEL CONTAINER                                   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Harness Executor                                 │   │
│  │                                                                       │   │
│  │  • Spawns agent processes (claude, gemini, gh copilot)               │   │
│  │  • Captures stdout/stderr streams                                    │   │
│  │  • Handles stdin for interactive prompts                             │   │
│  │  • Monitors process lifecycle                                        │   │
│  │  • Enforces timeouts and resource limits                             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│           ┌──────────────────────────┼──────────────────────────┐           │
│           ▼                          ▼                          ▼           │
│  ┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────┐     │
│  │  Claude Code    │    │    Gemini CLI       │    │   Copilot CLI   │     │
│  │    Harness      │    │     Harness         │    │    Harness      │     │
│  │                 │    │                     │    │                 │     │
│  │  claude         │    │  gemini             │    │  gh copilot     │     │
│  │  --print        │    │                     │    │  suggest        │     │
│  └─────────────────┘    └─────────────────────┘    └─────────────────┘     │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         /workspace                                    │   │
│  │                                                                       │   │
│  │  Shared volume mounted from host                                     │   │
│  │  Contains user's project repositories                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Auth: ~/.config/gh, ~/.config/claude-code, ~/.gemini (mounted read-only)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
User Message Flow:
─────────────────
WhatsApp → Security Gate → Intent Classifier → Handler → Response → WhatsApp

Task Execution Flow:
────────────────────
Task Manager → Docker Exec → Kennel → Harness (Claude/Gemini/Copilot)
     ↑                                              │
     │              Progress Stream                 │
     └──────────────────────────────────────────────┘

Approval Flow:
──────────────
Harness Output → "Should I...?" detected → Task Paused → User Asked
     ↑                                                       │
     │                    User Response                      │
     └───────────────────────────────────────────────────────┘
```

---

## 3. Component Specifications

### 3.1 Fetch Bridge Components

| Component | Responsibility | Input | Output |
|-----------|---------------|-------|--------|
| **WhatsApp Client** | Message I/O | WhatsApp events | Raw messages |
| **Security Gate** | Access control | Raw messages | Authorized messages |
| **Intent Classifier** | Route messages | Authorized messages | Classified intent + entities |
| **Task Manager** | Task lifecycle | Intent + entities | Task state changes |
| **Workspace Manager** | Repo operations | Intent + entities | Repo information |
| **Conversation Handler** | General chat | Intent + entities | Response text |
| **Session Manager** | State persistence | All components | Session state |
| **Progress Reporter** | WhatsApp updates | Task progress | Formatted messages |

### 3.2 Kennel Components

| Component | Responsibility | Input | Output |
|-----------|---------------|-------|--------|
| **Harness Executor** | Process management | Task + agent type | Process handle |
| **Output Parser** | Stream processing | stdout/stderr | Structured events |
| **Input Handler** | Interactive I/O | User responses | stdin writes |
| **Claude Harness** | Claude Code wrapper | Task prompt | Execution result |
| **Gemini Harness** | Gemini CLI wrapper | Task prompt | Execution result |
| **Copilot Harness** | Copilot CLI wrapper | Task prompt | Execution result |

### 3.3 Component Interactions Matrix

| From \ To | WhatsApp | Security | Intent | Task Mgr | Workspace | Conversation | Session | Harness |
|-----------|----------|----------|--------|----------|-----------|--------------|---------|---------|
| **WhatsApp** | - | ✓ | - | - | - | - | - | - |
| **Security** | ✓ | - | ✓ | - | - | - | - | - |
| **Intent** | - | - | - | ✓ | ✓ | ✓ | ✓ | - |
| **Task Mgr** | ✓ | - | - | - | ✓ | - | ✓ | ✓ |
| **Workspace** | - | - | - | - | - | - | ✓ | - |
| **Conversation** | ✓ | - | - | - | - | - | ✓ | - |
| **Session** | - | - | - | ✓ | ✓ | ✓ | - | - |
| **Harness** | - | - | - | ✓ | - | - | - | - |

---

## 4. Tool Inventory

### 4.1 Fetch Bridge Tools (8 total)

#### 4.1.1 Workspace Tools

| Tool | Description | Parameters | Returns | Auto-Approve |
|------|-------------|------------|---------|--------------|
| `workspace_list` | List available repositories in /workspace | None | `{ repos: [{ name, path, branch, dirty }] }` | Yes |
| `workspace_select` | Set active workspace for subsequent tasks | `name: string` | `{ success, workspace }` | Yes |
| `workspace_status` | Quick git status of a workspace | `name?: string` | `{ branch, dirty, ahead, behind }` | Yes |

**Implementation:**
```typescript
// fetch-app/src/tools/workspace.ts

export const workspaceListTool: Tool = {
  name: 'workspace_list',
  description: 'List all available repositories in the workspace directory',
  category: 'workspace',
  parameters: [],
  autoApprove: true,
  modifiesWorkspace: false,
  async execute() {
    const workspaceRoot = '/workspace';
    const entries = await readdir(workspaceRoot, { withFileTypes: true });
    const repos = [];
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const repoPath = join(workspaceRoot, entry.name);
        const gitDir = join(repoPath, '.git');
        
        if (existsSync(gitDir)) {
          const branch = execSync(`git -C "${repoPath}" branch --show-current`, { encoding: 'utf8' }).trim();
          const status = execSync(`git -C "${repoPath}" status --porcelain`, { encoding: 'utf8' });
          
          repos.push({
            name: entry.name,
            path: repoPath,
            branch,
            dirty: status.length > 0
          });
        }
      }
    }
    
    return { success: true, output: JSON.stringify({ repos }, null, 2) };
  }
};
```

#### 4.1.2 Task Tools

| Tool | Description | Parameters | Returns | Auto-Approve |
|------|-------------|------------|---------|--------------|
| `task_create` | Create and start a new task | `goal: string, agent?: 'claude'\|'gemini'\|'copilot'\|'auto', workspace?: string` | `{ taskId, status }` | No* |
| `task_status` | Get status of current or specific task | `taskId?: string` | `{ task }` or `{ tasks }` | Yes |
| `task_cancel` | Cancel a running task | `taskId: string` | `{ success, message }` | Yes |
| `task_respond` | Send response to a paused task (answer harness question) | `response: string, taskId?: string` | `{ success }` | Yes |

*Note: `task_create` approval depends on user's autonomy level setting.

**Implementation:**
```typescript
// fetch-app/src/tools/task.ts

export const taskCreateTool: Tool = {
  name: 'task_create',
  description: 'Create a new task and delegate to a coding agent',
  category: 'task',
  parameters: [
    { name: 'goal', type: 'string', description: 'What the task should accomplish', required: true },
    { name: 'agent', type: 'string', description: 'Which agent to use', required: false, enum: ['claude', 'gemini', 'copilot', 'auto'] },
    { name: 'workspace', type: 'string', description: 'Workspace name (uses active if not specified)', required: false }
  ],
  autoApprove: false, // Depends on autonomy level
  modifiesWorkspace: true,
  async execute(args: { goal: string; agent?: string; workspace?: string }) {
    const task = await taskManager.create({
      goal: args.goal,
      agent: args.agent || 'auto',
      workspace: args.workspace || sessionManager.getActiveWorkspace()
    });
    
    // Start execution asynchronously
    taskManager.execute(task.id);
    
    return { 
      success: true, 
      output: `Task ${task.id} created and started with ${task.agent}`,
      metadata: { taskId: task.id }
    };
  }
};
```

#### 4.1.3 User Interaction Tools

| Tool | Description | Parameters | Returns | Auto-Approve |
|------|-------------|------------|---------|--------------|
| `ask_user` | Ask user a question (pauses execution) | `question: string, options?: string[]` | `{ response }` | Yes |
| `report_progress` | Send progress update to user | `message: string, percent?: number` | `{ success }` | Yes |

**Implementation:**
```typescript
// fetch-app/src/tools/interaction.ts

export const askUserTool: Tool = {
  name: 'ask_user',
  description: 'Ask the user a question and wait for response',
  category: 'interaction',
  parameters: [
    { name: 'question', type: 'string', description: 'Question to ask', required: true },
    { name: 'options', type: 'array', description: 'Optional choices', required: false, items: { type: 'string' } }
  ],
  autoApprove: true,
  modifiesWorkspace: false,
  async execute(args: { question: string; options?: string[] }) {
    // This tool pauses execution and waits for user input
    // The response comes through the normal message flow
    return { 
      success: true, 
      output: args.question,
      metadata: { 
        type: 'question',
        options: args.options,
        requiresResponse: true 
      }
    };
  }
};
```

### 4.2 Harness Execution Interface

These are NOT tools in the LLM sense - they're the programmatic interface for executing agents:

```typescript
// fetch-app/src/harness/executor.ts

interface HarnessConfig {
  claude: {
    command: 'claude',
    args: ['--print'],
    env: { CLAUDE_CONFIG: '/root/.config/claude-code' }
  },
  gemini: {
    command: 'gemini',
    args: [],
    env: { GEMINI_API_KEY: process.env.GEMINI_API_KEY }
  },
  copilot: {
    command: 'gh',
    args: ['copilot', 'suggest'],
    env: { GH_CONFIG_DIR: '/root/.config/gh' }
  }
}

interface HarnessExecution {
  id: string;
  taskId: string;
  agent: 'claude' | 'gemini' | 'copilot';
  process: ChildProcess;
  startedAt: Date;
  status: 'running' | 'waiting_input' | 'completed' | 'failed' | 'cancelled';
  
  // Methods
  start(prompt: string): void;
  sendInput(text: string): void;
  abort(): void;
  onOutput(callback: (chunk: string, type: 'stdout' | 'stderr') => void): void;
  onQuestion(callback: (question: string) => void): void;
  onComplete(callback: (exitCode: number, output: string) => void): void;
}
```

### 4.3 Tool Comparison: Current vs Target

| Current Tool | Keep/Remove | Replacement |
|--------------|-------------|-------------|
| `read_file` | Remove | Harness handles |
| `write_file` | Remove | Harness handles |
| `edit_file` | Remove | Harness handles |
| `search_files` | Remove | Harness handles |
| `list_directory` | Remove | `workspace_list` for repos only |
| `repo_map` | Remove | Harness handles |
| `find_definition` | Remove | Harness handles |
| `find_references` | Remove | Harness handles |
| `get_diagnostics` | Remove | Harness handles |
| `run_command` | Remove | Harness handles |
| `run_tests` | Remove | Harness handles |
| `run_lint` | Remove | Harness handles |
| `git_status` | Simplify | `workspace_status` |
| `git_diff` | Remove | Harness handles |
| `git_commit` | Remove | Harness handles |
| `git_undo` | Remove | Harness handles |
| `git_branch` | Remove | Harness handles |
| `git_log` | Remove | Harness handles |
| `git_stash` | Remove | Harness handles |
| `ask_user` | Keep | Same |
| `report_progress` | Keep | Same |
| `task_complete` | Modify | Part of task lifecycle |
| `task_blocked` | Modify | Part of task lifecycle |
| `think` | Remove | Not needed for orchestration |

---

## 5. Prompt Inventory

### 5.1 System Prompts

#### 5.1.1 Main Agent Prompt

**File:** `fetch-app/prompts/agent.md`

```markdown
# Fetch - Task Orchestration Agent

You are Fetch, a friendly task orchestration assistant. You help users accomplish coding tasks by delegating work to specialized AI coding agents.

## Your Role

You are a **router and coordinator**, not a code writer. Your job is to:

1. Understand what the user wants
2. Delegate coding tasks to the appropriate agent (Claude Code, Gemini CLI, or Copilot CLI)
3. Monitor task progress and keep the user informed
4. Handle questions, cancellations, and approvals
5. Manage workspaces (repositories)

## What You Can Do

✅ Create and manage tasks
✅ Route tasks to the best coding agent
✅ Check task status and progress
✅ Cancel running tasks
✅ Switch between workspaces/repositories
✅ Answer questions about your capabilities
✅ Have friendly conversations

## What You Cannot Do

❌ Read or write files directly
❌ Execute shell commands directly
❌ Make git commits directly
❌ Analyze code directly

These operations are performed BY your harnesses (Claude Code, Gemini CLI, Copilot CLI).

## Available Tools

### Workspace Management
- `workspace_list` - List available repositories
- `workspace_select` - Set the active workspace
- `workspace_status` - Check git status of a workspace

### Task Management
- `task_create` - Create and start a new coding task
- `task_status` - Check status of tasks
- `task_cancel` - Cancel a running task
- `task_respond` - Send a response to a task waiting for input

### User Interaction
- `ask_user` - Ask the user a question
- `report_progress` - Send a progress update

## Decision Making

When the user sends a message, decide:

1. **Is it a coding task?** → Use `task_create` to delegate
2. **Is it asking about status?** → Use `task_status`
3. **Is it a cancellation?** → Use `task_cancel`
4. **Is it about workspaces?** → Use workspace tools
5. **Is it a response to a question?** → Use `task_respond`
6. **Is it general conversation?** → Respond directly without tools

## Agent Selection

When creating a task, choose the best agent:

| Scenario | Best Agent | Reason |
|----------|------------|--------|
| Complex multi-file changes | claude | Best at large refactors |
| Quick single-file fixes | copilot | Fast and lightweight |
| Research and exploration | gemini | Good at analysis |
| Unknown/general | auto | System will decide |

## Response Style

- Be friendly and concise (WhatsApp messages)
- Use emojis sparingly but appropriately 🐕
- Keep responses under 500 characters when possible
- For long outputs, summarize and offer details

## Important Rules

1. ALWAYS delegate coding work - never try to do it yourself
2. If unsure which agent, use 'auto'
3. Always confirm task creation with the user
4. Report errors clearly but don't expose technical details
5. If a task is already running, let user know before starting another
```

#### 5.1.2 Intent Classification Prompt

**File:** `fetch-app/prompts/intent.md`

```markdown
# Intent Classification

Classify the user's message into exactly one intent category.

## Intent Categories

| Intent | Description | Examples |
|--------|-------------|----------|
| TASK | User wants coding work done | "add dark mode", "fix the login bug", "write tests" |
| STATUS | User asking about task progress | "how's it going?", "status", "what's happening?" |
| CONTROL | User wants to stop/pause/modify | "stop", "cancel", "nevermind", "pause" |
| WORKSPACE | User managing repositories | "switch to myapp", "what repos?", "list projects" |
| APPROVAL | User responding yes/no/skip | "yes", "no", "approve", "skip", "yesall" |
| RESPONSE | User answering a question from task | [follows a question from Fetch] |
| CONVERSATION | General chat, questions, greetings | "hello", "what can you do?", "thanks" |

## Classification Rules

1. If message contains coding-related verbs (add, fix, create, build, write, refactor, update, implement), classify as TASK
2. If message is asking about progress/status without requesting action, classify as STATUS
3. If message contains stop words (stop, cancel, abort, pause, nevermind), classify as CONTROL
4. If message mentions repos/projects/workspace/switch, classify as WORKSPACE
5. If message is a simple yes/no/approve/skip/reject, classify as APPROVAL
6. If there's a pending question and message seems to answer it, classify as RESPONSE
7. Otherwise, classify as CONVERSATION

## Context Awareness

Consider the conversation context:
- If Fetch just asked a question → likely RESPONSE or APPROVAL
- If a task is running → STATUS or CONTROL more likely
- If no workspace selected → might need WORKSPACE first

## Output Format

Respond with JSON:
```json
{
  "intent": "TASK",
  "confidence": 0.95,
  "entities": {
    "action": "add",
    "target": "dark mode",
    "scope": "login page"
  }
}
```
```

#### 5.1.3 Task Framing Prompt

**File:** `fetch-app/prompts/task-frame.md`

```markdown
# Task Framing Template

Use this template to frame tasks for coding agents.

## Template

```
## Task
{{goal}}

## Workspace
{{workspace_path}}

## Current Branch
{{branch}}

## Context
{{conversation_context}}

## Constraints
{{constraints}}

## Instructions
- Work within the specified workspace only
- Report progress as you work (your output is being monitored)
- If you need clarification, ask - your question will be relayed to the user
- When complete, summarize what you did
```

## Variable Definitions

| Variable | Source | Example |
|----------|--------|---------|
| `goal` | User's task description | "Add dark mode toggle to settings page" |
| `workspace_path` | Active workspace | "/workspace/myapp" |
| `branch` | Current git branch | "main" |
| `conversation_context` | Recent relevant messages | "User mentioned they want it to match the existing theme" |
| `constraints` | From user preferences | "Require approval before file writes" |

## Constraint Options

Based on user's autonomy level:
- **autonomous**: "Proceed without asking for approval"
- **cautious**: "Ask before making significant changes"
- **supervised**: "Ask before any file modifications"
```

#### 5.1.4 Progress Summarization Prompt

**File:** `fetch-app/prompts/summarize.md`

```markdown
# Progress Summarization

Summarize harness output for WhatsApp delivery.

## Input
Raw output from coding agent (potentially long, technical)

## Output Requirements
- Maximum 500 characters
- Plain text (WhatsApp formatting: *bold*, _italic_)
- Focus on user-relevant information
- No code blocks (don't render well on WhatsApp)

## Summary Structure

For in-progress updates:
```
🔄 *Working on:* [current action]
📁 Files: [files being modified]
⏱️ [time elapsed]
```

For completion:
```
✅ *Done!*
[1-2 sentence summary]
📁 Changed: [file list]
🔗 [any relevant info]
```

For errors:
```
⚠️ *Issue encountered*
[brief description]
💡 [suggestion if any]
```

## Examples

Input (raw Claude output):
```
I'll help you add dark mode. Let me first check the existing theme structure...

Reading src/styles/theme.ts...
I see you're using styled-components with a ThemeProvider.

I'll create a new dark theme variant and add a toggle component.

Creating src/styles/darkTheme.ts...
Modifying src/components/Settings/ThemeToggle.tsx...
Updating src/App.tsx to include theme switching logic...

Done! I've added:
1. Dark theme colors in darkTheme.ts
2. ThemeToggle component with a switch
3. Theme state management in App.tsx

The toggle will appear in Settings. Try it out!
```

Output (summarized):
```
✅ *Dark mode added!*
Created theme toggle in Settings page with dark color scheme.
📁 Changed: darkTheme.ts, ThemeToggle.tsx, App.tsx
```
```

#### 5.1.5 Error Recovery Prompt

**File:** `fetch-app/prompts/error-recovery.md`

```markdown
# Error Recovery

Analyze task failure and recommend recovery action.

## Error Categories

| Category | Pattern | Recovery |
|----------|---------|----------|
| Timeout | "exceeded time limit" | Suggest breaking into smaller tasks |
| Auth | "unauthorized", "permission denied" | Check credentials, report to user |
| Not Found | "file not found", "no such" | Verify workspace, ask user |
| Conflict | "merge conflict", "already exists" | Ask user for resolution |
| Quota | "rate limit", "quota exceeded" | Wait and retry, or switch agent |
| Crash | Unexpected exit, no output | Retry with different agent |

## Decision Matrix

```
Error Type × Retry Count → Action

Timeout × 1 → Retry with longer timeout
Timeout × 2 → Ask user to simplify task
Timeout × 3 → Fail and report

Auth × any → Report to user (can't auto-fix)

Not Found × 1 → Verify paths, retry
Not Found × 2 → Ask user for correct path

Conflict × any → Ask user for resolution

Quota × 1 → Wait 60s, retry
Quota × 2 → Switch to different agent
Quota × 3 → Report to user

Crash × 1 → Retry same agent
Crash × 2 → Try different agent
Crash × 3 → Fail and report
```

## Output Format

```json
{
  "category": "timeout",
  "retryable": true,
  "action": "retry",
  "modification": "increase_timeout",
  "userMessage": "Task is taking longer than expected. Retrying with more time..."
}
```
```

### 5.2 Workspace Prompts

#### 5.2.1 Project Context File

**File:** `workspace/{project}/.fetch/context.md` (per-project)

```markdown
# Project: {project_name}

## Overview
Brief description of what this project is.

## Structure
- src/ - Source code
- tests/ - Test files
- docs/ - Documentation

## Tech Stack
- Language: TypeScript
- Framework: React
- Build: Vite

## Conventions
- Use functional components
- Tests required for new features
- Commit format: type(scope): message

## Important Notes
- Don't modify .env files
- Database migrations need manual review
- API keys are in environment variables

## Active Work
- Current focus: [auto-updated by Fetch]
- Recent changes: [auto-updated by Fetch]
```

This file is automatically read and included in task context when delegating to harnesses.

### 5.3 Prompt File Summary

| File | Purpose | Used By | When |
|------|---------|---------|------|
| `prompts/agent.md` | Main agent system prompt | GPT-4.1-mini | Every LLM call |
| `prompts/intent.md` | Intent classification | GPT-4.1-mini | Message classification |
| `prompts/task-frame.md` | Task delegation template | Task Manager | Creating harness prompts |
| `prompts/summarize.md` | Output summarization | Progress Reporter | Formatting updates |
| `prompts/error-recovery.md` | Error handling | Task Manager | On task failure |
| `.fetch/context.md` | Project context | Task Manager | Task delegation |

---

## 6. Data Models & Type Definitions

### 6.1 Core Domain Models

#### 6.1.1 Task Model

```typescript
// fetch-app/src/task/types.ts

/**
 * Unique identifier for tasks
 * Format: tsk_{nanoid(10)}
 * Example: tsk_V1StGXR8_Z
 */
export type TaskId = `tsk_${string}`;

/**
 * Supported coding agent types
 */
export type AgentType = 'claude' | 'gemini' | 'copilot';

/**
 * Agent selection strategy
 */
export type AgentSelection = AgentType | 'auto';

/**
 * Task lifecycle states
 * 
 * State Machine:
 * ```
 * pending → running → completed
 *              ↓          ↑
 *         waiting_input ──┘
 *              ↓
 *           failed
 *              ↓
 *         cancelled
 * ```
 */
export type TaskStatus = 
  | 'pending'        // Created, not yet started
  | 'running'        // Harness executing
  | 'waiting_input'  // Harness asked a question
  | 'completed'      // Successfully finished
  | 'failed'         // Error occurred
  | 'cancelled';     // User cancelled

/**
 * Task priority levels
 */
export type TaskPriority = 'low' | 'normal' | 'high';

/**
 * Task execution constraints
 */
export interface TaskConstraints {
  /** Maximum execution time in milliseconds */
  timeoutMs: number;
  /** Whether to require user approval before file writes */
  requireApproval: boolean;
  /** Limit scope to specific files/directories */
  scopePaths?: string[];
  /** Maximum number of retries on failure */
  maxRetries: number;
}

/**
 * Progress update from harness
 */
export interface TaskProgress {
  /** Progress entry ID */
  id: string;
  /** ISO timestamp */
  timestamp: string;
  /** Progress message */
  message: string;
  /** Files being modified (if any) */
  files?: string[];
  /** Percentage complete (0-100, optional) */
  percent?: number;
}

/**
 * Task completion result
 */
export interface TaskResult {
  /** Whether task succeeded */
  success: boolean;
  /** Summary of what was done */
  summary: string;
  /** Files that were modified */
  filesModified: string[];
  /** Files that were created */
  filesCreated: string[];
  /** Files that were deleted */
  filesDeleted: string[];
  /** Error message if failed */
  error?: string;
  /** Raw output from harness */
  rawOutput: string;
  /** Exit code from harness process */
  exitCode: number;
}

/**
 * Complete task entity
 */
export interface Task {
  /** Unique task identifier */
  id: TaskId;
  /** User's goal/request */
  goal: string;
  /** Target workspace name */
  workspace: string;
  /** Assigned agent */
  agent: AgentType;
  /** How agent was selected */
  agentSelection: AgentSelection;
  /** Current status */
  status: TaskStatus;
  /** Priority level */
  priority: TaskPriority;
  /** Execution constraints */
  constraints: TaskConstraints;
  /** Progress updates */
  progress: TaskProgress[];
  /** Final result (when completed/failed) */
  result?: TaskResult;
  /** Pending question from harness */
  pendingQuestion?: string;
  /** Number of retry attempts */
  retryCount: number;
  /** ISO timestamp: created */
  createdAt: string;
  /** ISO timestamp: started */
  startedAt?: string;
  /** ISO timestamp: completed/failed */
  completedAt?: string;
  /** Session ID that created this task */
  sessionId: string;
}
```

#### 6.1.2 Workspace Model

```typescript
// fetch-app/src/workspace/types.ts

/**
 * Unique identifier for workspaces
 * Format: workspace name (directory name)
 * Example: "my-project"
 */
export type WorkspaceId = string;

/**
 * Git repository status
 */
export interface GitStatus {
  /** Current branch name */
  branch: string;
  /** Whether there are uncommitted changes */
  dirty: boolean;
  /** Number of commits ahead of remote */
  ahead: number;
  /** Number of commits behind remote */
  behind: number;
  /** List of modified files */
  modifiedFiles: string[];
  /** List of untracked files */
  untrackedFiles: string[];
}

/**
 * Project type detection
 */
export type ProjectType = 
  | 'node'      // package.json exists
  | 'python'    // requirements.txt or pyproject.toml
  | 'rust'      // Cargo.toml
  | 'go'        // go.mod
  | 'unknown';

/**
 * Workspace entity
 */
export interface Workspace {
  /** Workspace identifier (directory name) */
  id: WorkspaceId;
  /** Display name */
  name: string;
  /** Full path on filesystem */
  path: string;
  /** Detected project type */
  projectType: ProjectType;
  /** Git status (if git repo) */
  git?: GitStatus;
  /** Whether this is the active workspace */
  isActive: boolean;
  /** Last time workspace was accessed */
  lastAccessedAt?: string;
}
```

#### 6.1.3 Session Model

```typescript
// fetch-app/src/session/types.ts

/**
 * Unique identifier for sessions
 * Format: ses_{nanoid(8)}
 * Example: ses_Ab3dE7gH
 */
export type SessionId = `ses_${string}`;

/**
 * User autonomy preference level
 */
export type AutonomyLevel = 
  | 'supervised'   // Approve everything
  | 'cautious'     // Approve writes only
  | 'autonomous';  // No approvals needed

/**
 * User preferences
 */
export interface UserPreferences {
  /** How much freedom the agent has */
  autonomyLevel: AutonomyLevel;
  /** Default agent to use */
  defaultAgent: AgentSelection;
  /** Receive verbose progress updates */
  verboseMode: boolean;
  /** Maximum task timeout (ms) */
  maxTaskTimeout: number;
}

/**
 * Message role in conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Conversation message
 */
export interface Message {
  /** Unique message ID */
  id: string;
  /** Who sent the message */
  role: MessageRole;
  /** Message content */
  content: string;
  /** ISO timestamp */
  timestamp: string;
  /** Associated task (if any) */
  taskId?: TaskId;
}

/**
 * Complete session entity
 */
export interface Session {
  /** Unique session identifier */
  id: SessionId;
  /** WhatsApp user ID */
  userId: string;
  /** Conversation history */
  messages: Message[];
  /** Active workspace ID */
  activeWorkspace?: WorkspaceId;
  /** User preferences */
  preferences: UserPreferences;
  /** Current task (if any) */
  currentTaskId?: TaskId;
  /** ISO timestamp: created */
  createdAt: string;
  /** ISO timestamp: last activity */
  lastActivityAt: string;
}
```

#### 6.1.4 Harness Model

```typescript
// fetch-app/src/harness/types.ts

/**
 * Unique identifier for harness executions
 * Format: hrn_{nanoid(8)}
 * Example: hrn_Xy7zW9qP
 */
export type HarnessId = `hrn_${string}`;

/**
 * Harness execution status
 */
export type HarnessStatus = 
  | 'starting'      // Process spawning
  | 'running'       // Actively executing
  | 'waiting_input' // Waiting for stdin
  | 'completed'     // Exited successfully
  | 'failed'        // Exited with error
  | 'killed';       // Terminated by user/timeout

/**
 * Output event from harness
 */
export interface HarnessOutputEvent {
  /** Event type */
  type: 'stdout' | 'stderr' | 'question' | 'progress' | 'complete' | 'error';
  /** Event data */
  data: string;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * Harness configuration
 */
export interface HarnessConfig {
  /** Executable command */
  command: string;
  /** Command arguments */
  args: string[];
  /** Environment variables */
  env: Record<string, string>;
  /** Working directory */
  cwd: string;
  /** Timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Harness execution instance
 */
export interface HarnessExecution {
  /** Unique execution ID */
  id: HarnessId;
  /** Associated task ID */
  taskId: TaskId;
  /** Agent type */
  agent: AgentType;
  /** Current status */
  status: HarnessStatus;
  /** Process ID (when running) */
  pid?: number;
  /** Configuration used */
  config: HarnessConfig;
  /** Output events */
  events: HarnessOutputEvent[];
  /** Exit code (when completed) */
  exitCode?: number;
  /** ISO timestamp: started */
  startedAt: string;
  /** ISO timestamp: completed */
  completedAt?: string;
}
```

### 6.2 API Response Models

```typescript
// fetch-app/src/api/types.ts

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  /** Whether the request succeeded */
  success: boolean;
  /** Response data (if success) */
  data?: T;
  /** Error information (if failed) */
  error?: ApiError;
  /** Request timestamp */
  timestamp: string;
}

/**
 * API error details
 */
export interface ApiError {
  /** Error code */
  code: ErrorCode;
  /** Human-readable message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Standard error codes
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'      // Invalid input
  | 'NOT_FOUND'             // Resource not found
  | 'ALREADY_EXISTS'        // Duplicate resource
  | 'UNAUTHORIZED'          // Not authenticated
  | 'FORBIDDEN'             // Not authorized
  | 'TASK_RUNNING'          // Task already in progress
  | 'HARNESS_ERROR'         // Harness execution failed
  | 'TIMEOUT'               // Operation timed out
  | 'INTERNAL_ERROR';       // Unexpected error
```

### 6.3 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         SESSION                                  │
│  id: SessionId                                                  │
│  userId: string                                                 │
│  activeWorkspace?: WorkspaceId ──────────────┐                  │
│  currentTaskId?: TaskId ─────────────────────┼──┐               │
│  preferences: UserPreferences                │  │               │
│  messages: Message[]                         │  │               │
└──────────────────────────────────────────────┼──┼───────────────┘
                                               │  │
                  ┌────────────────────────────┘  │
                  ▼                               │
┌─────────────────────────────────────────────┐  │
│                 WORKSPACE                    │  │
│  id: WorkspaceId                            │  │
│  name: string                               │  │
│  path: string                               │  │
│  projectType: ProjectType                   │  │
│  git?: GitStatus                            │  │
└─────────────────────────────────────────────┘  │
                                                 │
                  ┌──────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                           TASK                                   │
│  id: TaskId                                                     │
│  goal: string                                                   │
│  workspace: WorkspaceId ─────────────────────────────────────┐  │
│  agent: AgentType                                            │  │
│  status: TaskStatus                                          │  │
│  constraints: TaskConstraints                                │  │
│  progress: TaskProgress[]                                    │  │
│  result?: TaskResult                                         │  │
└──────────────────────────────────────────────────────────────┼──┘
                  │                                            │
                  │ 1:1                                        │
                  ▼                                            │
┌─────────────────────────────────────────────┐               │
│            HARNESS_EXECUTION                 │               │
│  id: HarnessId                              │               │
│  taskId: TaskId ────────────────────────────┼───────────────┘
│  agent: AgentType                           │
│  status: HarnessStatus                      │
│  config: HarnessConfig                      │
│  events: HarnessOutputEvent[]               │
│  exitCode?: number                          │
└─────────────────────────────────────────────┘
```

---

## 7. Validation & Schemas

### 7.1 Zod Schema Definitions

All tool inputs and data models are validated using Zod schemas.

#### 7.1.1 Common Schemas

```typescript
// fetch-app/src/validation/common.ts

import { z } from 'zod';

/**
 * Nanoid pattern for IDs
 */
export const NanoidPattern = /^[A-Za-z0-9_-]+$/;

/**
 * Task ID schema
 */
export const TaskIdSchema = z.string()
  .startsWith('tsk_')
  .regex(/^tsk_[A-Za-z0-9_-]{10}$/, 'Invalid task ID format');

/**
 * Session ID schema  
 */
export const SessionIdSchema = z.string()
  .startsWith('ses_')
  .regex(/^ses_[A-Za-z0-9_-]{8}$/, 'Invalid session ID format');

/**
 * Harness ID schema
 */
export const HarnessIdSchema = z.string()
  .startsWith('hrn_')
  .regex(/^hrn_[A-Za-z0-9_-]{8}$/, 'Invalid harness ID format');

/**
 * Workspace name schema (safe directory name)
 */
export const WorkspaceNameSchema = z.string()
  .min(1, 'Workspace name required')
  .max(100, 'Workspace name too long')
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Invalid workspace name')
  .refine(
    (name) => !name.includes('..'),
    'Path traversal not allowed'
  );

/**
 * Safe file path schema (within workspace)
 */
export const SafePathSchema = z.string()
  .min(1, 'Path required')
  .refine(
    (path) => !path.includes('..'),
    'Path traversal not allowed'
  )
  .refine(
    (path) => !path.startsWith('/') || path.startsWith('/workspace'),
    'Absolute paths must be within /workspace'
  );

/**
 * Positive integer schema
 */
export const PositiveIntSchema = z.number()
  .int('Must be integer')
  .positive('Must be positive');

/**
 * Timeout schema (ms, 1s to 30min)
 */
export const TimeoutSchema = z.number()
  .int()
  .min(1000, 'Minimum timeout is 1 second')
  .max(1800000, 'Maximum timeout is 30 minutes');

/**
 * ISO timestamp schema
 */
export const ISOTimestampSchema = z.string()
  .datetime({ message: 'Invalid ISO timestamp' });
```

#### 7.1.2 Tool Input Schemas

```typescript
// fetch-app/src/validation/tools.ts

import { z } from 'zod';
import { WorkspaceNameSchema, TaskIdSchema, TimeoutSchema } from './common.js';

// ============================================================================
// Workspace Tools
// ============================================================================

/**
 * workspace_list - No parameters
 */
export const WorkspaceListInputSchema = z.object({}).strict();

/**
 * workspace_select
 */
export const WorkspaceSelectInputSchema = z.object({
  /** Workspace name to select */
  name: WorkspaceNameSchema
}).strict();

/**
 * workspace_status
 */
export const WorkspaceStatusInputSchema = z.object({
  /** Workspace name (optional, uses active if not specified) */
  name: WorkspaceNameSchema.optional()
}).strict();

// ============================================================================
// Task Tools
// ============================================================================

/**
 * Agent type enum
 */
export const AgentTypeSchema = z.enum(['claude', 'gemini', 'copilot']);

/**
 * Agent selection enum (includes 'auto')
 */
export const AgentSelectionSchema = z.enum(['claude', 'gemini', 'copilot', 'auto']);

/**
 * task_create
 */
export const TaskCreateInputSchema = z.object({
  /** What the task should accomplish */
  goal: z.string()
    .min(1, 'Goal is required')
    .max(2000, 'Goal too long (max 2000 chars)'),
  /** Which agent to use (default: auto) */
  agent: AgentSelectionSchema.optional().default('auto'),
  /** Workspace name (uses active if not specified) */
  workspace: WorkspaceNameSchema.optional(),
  /** Task timeout in ms (default: 300000 = 5min) */
  timeout: TimeoutSchema.optional().default(300000)
}).strict();

/**
 * task_status
 */
export const TaskStatusInputSchema = z.object({
  /** Task ID (optional, returns current task if not specified) */
  taskId: TaskIdSchema.optional()
}).strict();

/**
 * task_cancel
 */
export const TaskCancelInputSchema = z.object({
  /** Task ID to cancel */
  taskId: TaskIdSchema
}).strict();

/**
 * task_respond
 */
export const TaskRespondInputSchema = z.object({
  /** Response to send to the harness */
  response: z.string()
    .min(1, 'Response is required')
    .max(1000, 'Response too long'),
  /** Task ID (optional, uses current task if not specified) */
  taskId: TaskIdSchema.optional()
}).strict();

// ============================================================================
// Interaction Tools
// ============================================================================

/**
 * ask_user
 */
export const AskUserInputSchema = z.object({
  /** Question to ask the user */
  question: z.string()
    .min(1, 'Question is required')
    .max(500, 'Question too long'),
  /** Optional choices */
  options: z.array(z.string().max(100))
    .max(10, 'Maximum 10 options')
    .optional()
}).strict();

/**
 * report_progress
 */
export const ReportProgressInputSchema = z.object({
  /** Progress message */
  message: z.string()
    .min(1, 'Message is required')
    .max(500, 'Message too long'),
  /** Percentage complete (0-100) */
  percent: z.number()
    .min(0)
    .max(100)
    .optional()
}).strict();

// ============================================================================
// Schema Registry
// ============================================================================

/**
 * Map of tool names to their input schemas
 */
export const ToolInputSchemas = {
  workspace_list: WorkspaceListInputSchema,
  workspace_select: WorkspaceSelectInputSchema,
  workspace_status: WorkspaceStatusInputSchema,
  task_create: TaskCreateInputSchema,
  task_status: TaskStatusInputSchema,
  task_cancel: TaskCancelInputSchema,
  task_respond: TaskRespondInputSchema,
  ask_user: AskUserInputSchema,
  report_progress: ReportProgressInputSchema
} as const;

export type ToolName = keyof typeof ToolInputSchemas;
```

#### 7.1.3 Data Model Schemas

```typescript
// fetch-app/src/validation/models.ts

import { z } from 'zod';
import { 
  TaskIdSchema, 
  SessionIdSchema, 
  HarnessIdSchema,
  WorkspaceNameSchema,
  ISOTimestampSchema,
  TimeoutSchema,
  PositiveIntSchema 
} from './common.js';
import { AgentTypeSchema, AgentSelectionSchema } from './tools.js';

// ============================================================================
// Task Model Schemas
// ============================================================================

export const TaskStatusSchema = z.enum([
  'pending',
  'running', 
  'waiting_input',
  'completed',
  'failed',
  'cancelled'
]);

export const TaskPrioritySchema = z.enum(['low', 'normal', 'high']);

export const TaskConstraintsSchema = z.object({
  timeoutMs: TimeoutSchema,
  requireApproval: z.boolean(),
  scopePaths: z.array(z.string()).optional(),
  maxRetries: PositiveIntSchema.max(5)
}).strict();

export const TaskProgressSchema = z.object({
  id: z.string(),
  timestamp: ISOTimestampSchema,
  message: z.string(),
  files: z.array(z.string()).optional(),
  percent: z.number().min(0).max(100).optional()
}).strict();

export const TaskResultSchema = z.object({
  success: z.boolean(),
  summary: z.string(),
  filesModified: z.array(z.string()),
  filesCreated: z.array(z.string()),
  filesDeleted: z.array(z.string()),
  error: z.string().optional(),
  rawOutput: z.string(),
  exitCode: z.number().int()
}).strict();

export const TaskSchema = z.object({
  id: TaskIdSchema,
  goal: z.string(),
  workspace: WorkspaceNameSchema,
  agent: AgentTypeSchema,
  agentSelection: AgentSelectionSchema,
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  constraints: TaskConstraintsSchema,
  progress: z.array(TaskProgressSchema),
  result: TaskResultSchema.optional(),
  pendingQuestion: z.string().optional(),
  retryCount: z.number().int().min(0),
  createdAt: ISOTimestampSchema,
  startedAt: ISOTimestampSchema.optional(),
  completedAt: ISOTimestampSchema.optional(),
  sessionId: SessionIdSchema
}).strict();

// ============================================================================
// Workspace Model Schemas
// ============================================================================

export const ProjectTypeSchema = z.enum([
  'node',
  'python', 
  'rust',
  'go',
  'unknown'
]);

export const GitStatusSchema = z.object({
  branch: z.string(),
  dirty: z.boolean(),
  ahead: z.number().int().min(0),
  behind: z.number().int().min(0),
  modifiedFiles: z.array(z.string()),
  untrackedFiles: z.array(z.string())
}).strict();

export const WorkspaceSchema = z.object({
  id: WorkspaceNameSchema,
  name: z.string(),
  path: z.string(),
  projectType: ProjectTypeSchema,
  git: GitStatusSchema.optional(),
  isActive: z.boolean(),
  lastAccessedAt: ISOTimestampSchema.optional()
}).strict();

// ============================================================================
// Session Model Schemas
// ============================================================================

export const AutonomyLevelSchema = z.enum([
  'supervised',
  'cautious',
  'autonomous'
]);

export const UserPreferencesSchema = z.object({
  autonomyLevel: AutonomyLevelSchema,
  defaultAgent: AgentSelectionSchema,
  verboseMode: z.boolean(),
  maxTaskTimeout: TimeoutSchema
}).strict();

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system']);

export const MessageSchema = z.object({
  id: z.string(),
  role: MessageRoleSchema,
  content: z.string(),
  timestamp: ISOTimestampSchema,
  taskId: TaskIdSchema.optional()
}).strict();

export const SessionSchema = z.object({
  id: SessionIdSchema,
  userId: z.string(),
  messages: z.array(MessageSchema),
  activeWorkspace: WorkspaceNameSchema.optional(),
  preferences: UserPreferencesSchema,
  currentTaskId: TaskIdSchema.optional(),
  createdAt: ISOTimestampSchema,
  lastActivityAt: ISOTimestampSchema
}).strict();

// ============================================================================
// Harness Model Schemas
// ============================================================================

export const HarnessStatusSchema = z.enum([
  'starting',
  'running',
  'waiting_input',
  'completed',
  'failed',
  'killed'
]);

export const HarnessOutputEventTypeSchema = z.enum([
  'stdout',
  'stderr',
  'question',
  'progress',
  'complete',
  'error'
]);

export const HarnessOutputEventSchema = z.object({
  type: HarnessOutputEventTypeSchema,
  data: z.string(),
  timestamp: ISOTimestampSchema
}).strict();

export const HarnessConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string()),
  cwd: z.string(),
  timeoutMs: TimeoutSchema
}).strict();

export const HarnessExecutionSchema = z.object({
  id: HarnessIdSchema,
  taskId: TaskIdSchema,
  agent: AgentTypeSchema,
  status: HarnessStatusSchema,
  pid: z.number().int().positive().optional(),
  config: HarnessConfigSchema,
  events: z.array(HarnessOutputEventSchema),
  exitCode: z.number().int().optional(),
  startedAt: ISOTimestampSchema,
  completedAt: ISOTimestampSchema.optional()
}).strict();
```

### 7.2 Validation Utilities

```typescript
// fetch-app/src/validation/validator.ts

import { z, ZodError, ZodSchema } from 'zod';
import { ToolInputSchemas, ToolName } from './tools.js';
import { logger } from '../utils/logger.js';

/**
 * Validation result
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

/**
 * Individual validation error
 */
export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

/**
 * Validate data against a Zod schema
 */
export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code
      }));
      
      logger.warn('Validation failed', { errors });
      return { success: false, errors };
    }
    throw error;
  }
}

/**
 * Validate tool input
 */
export function validateToolInput<T extends ToolName>(
  toolName: T,
  args: unknown
): ValidationResult<z.infer<typeof ToolInputSchemas[T]>> {
  const schema = ToolInputSchemas[toolName];
  if (!schema) {
    return {
      success: false,
      errors: [{ path: '', message: `Unknown tool: ${toolName}`, code: 'unknown_tool' }]
    };
  }
  
  return validate(schema, args);
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .map((e) => `• ${e.path ? `${e.path}: ` : ''}${e.message}`)
    .join('\n');
}
```

### 7.3 Validation Integration Points

| Component | Validation Point | Schema Used |
|-----------|------------------|-------------|
| Tool Registry | Before tool execution | `ToolInputSchemas[toolName]` |
| Task Manager | Task creation | `TaskCreateInputSchema` |
| Session Manager | Session updates | `SessionSchema` |
| Harness Executor | Config validation | `HarnessConfigSchema` |
| API Endpoints | Request body | Endpoint-specific schemas |
| Data Store | Before persistence | Model schemas |

---

## 8. Naming Conventions

### 8.1 Identifier Formats

| Entity | Format | Example | Generator |
|--------|--------|---------|-----------|
| Task | `tsk_{nanoid(10)}` | `tsk_V1StGXR8_Z` | `generateTaskId()` |
| Session | `ses_{nanoid(8)}` | `ses_Ab3dE7gH` | `generateSessionId()` |
| Harness | `hrn_{nanoid(8)}` | `hrn_Xy7zW9qP` | `generateHarnessId()` |
| Message | `msg_{nanoid(8)}` | `msg_Pq2rS4tU` | `generateMessageId()` |
| Progress | `prg_{nanoid(8)}` | `prg_Mn3oP5qR` | `generateProgressId()` |

```typescript
// fetch-app/src/utils/id.ts

import { nanoid } from 'nanoid';

export const generateTaskId = (): TaskId => `tsk_${nanoid(10)}`;
export const generateSessionId = (): SessionId => `ses_${nanoid(8)}`;
export const generateHarnessId = (): HarnessId => `hrn_${nanoid(8)}`;
export const generateMessageId = (): string => `msg_${nanoid(8)}`;
export const generateProgressId = (): string => `prg_${nanoid(8)}`;
```

### 8.2 Tool Naming Convention

| Pattern | Format | Examples |
|---------|--------|----------|
| Resource tools | `{resource}_{action}` | `workspace_list`, `task_create` |
| User tools | `{action}_{target}` | `ask_user`, `report_progress` |

**Tool names are:**
- `snake_case`
- Maximum 30 characters
- Descriptive action verbs: `list`, `select`, `create`, `cancel`, `status`
- No abbreviations (except standard: `id`, `config`)

### 8.3 File Naming Convention

| Type | Convention | Example |
|------|------------|---------|
| TypeScript source | `kebab-case.ts` | `task-manager.ts` |
| Type definitions | `types.ts` in each module | `task/types.ts` |
| Schemas | `schemas.ts` or in `validation/` | `validation/tools.ts` |
| Tests | `*.test.ts` | `task-manager.test.ts` |
| Prompts | `kebab-case.md` | `error-recovery.md` |

### 8.4 Variable Naming Convention

| Type | Convention | Example |
|------|------------|---------|
| Types/Interfaces | PascalCase | `TaskStatus`, `HarnessConfig` |
| Type aliases | PascalCase | `TaskId`, `AgentType` |
| Enums (as union) | PascalCase | `type AgentType = 'claude' \| ...` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| Functions | camelCase | `createTask`, `validateInput` |
| Variables | camelCase | `currentTask`, `activeWorkspace` |
| Schema objects | PascalCase + `Schema` | `TaskSchema`, `WorkspaceSelectInputSchema` |

### 8.5 Event Naming Convention

| Type | Format | Example |
|------|--------|---------|
| Task events | `task:{action}` | `task:created`, `task:completed` |
| Harness events | `harness:{action}` | `harness:output`, `harness:question` |
| Session events | `session:{action}` | `session:updated` |

---

## 9. Documentation Standards

### 9.1 File Header Documentation

Every TypeScript file must have a JSDoc header:

```typescript
/**
 * @fileoverview Brief description of what this file does
 * 
 * Longer description if needed, explaining the purpose
 * and how it fits into the overall architecture.
 * 
 * @module category/module-name
 * @see {@link RelatedClass} - Description
 * @see {@link otherFunction} - Description
 * 
 * ## Overview
 * 
 * Markdown-formatted overview section for complex files.
 * 
 * ## Usage
 * 
 * ```typescript
 * // Example usage code
 * ```
 */
```

### 9.2 Function Documentation

```typescript
/**
 * Brief description of what the function does.
 * 
 * Longer description if needed, explaining behavior,
 * edge cases, and important notes.
 * 
 * @param {ParamType} paramName - Description of parameter
 * @param {OptionalType} [optionalParam] - Optional parameter
 * @param {DefaultType} [paramWithDefault=defaultValue] - Has default
 * @returns {ReturnType} Description of return value
 * @throws {ErrorType} When this error is thrown
 * 
 * @example
 * ```typescript
 * const result = myFunction('input');
 * console.log(result); // expected output
 * ```
 */
```

### 9.3 Interface Documentation

```typescript
/**
 * Brief description of what this interface represents.
 * 
 * @interface InterfaceName
 * @property {Type} propertyName - Description of property
 */
export interface InterfaceName {
  /** Description of property */
  propertyName: Type;
  
  /** 
   * Description of complex property
   * @default defaultValue
   */
  complexProperty: ComplexType;
}
```

### 9.4 Type Documentation

```typescript
/**
 * Description of what this type represents.
 * 
 * @typedef {BaseType} TypeName
 * 
 * | Value | Description |
 * |-------|-------------|
 * | 'option1' | What option1 means |
 * | 'option2' | What option2 means |
 */
export type TypeName = 'option1' | 'option2';
```

### 9.5 Required Documentation Files

| File | Purpose | Location |
|------|---------|----------|
| `README.md` | Project overview, quick start | Root |
| `PLAN.md` | This document | Root |
| `CHANGELOG.md` | Version history | Root |
| `docs/API_REFERENCE.md` | Tool and API documentation | docs/markdown/ |
| `docs/ARCHITECTURE.md` | System design | docs/markdown/ |
| `docs/DEVELOPMENT.md` | Dev setup, testing | docs/markdown/ |
| Module `README.md` | Module-specific docs | Each major module |

### 9.6 Code Comment Standards

```typescript
// Single-line comment for brief explanations

// NOTE: Important information that developers should know
// TODO: Work that needs to be done
// FIXME: Known issue that needs fixing
// HACK: Workaround that should be improved
// WARNING: Dangerous or easily misused code

/**
 * Multi-line comment for:
 * - Complex logic explanations
 * - Algorithm descriptions
 * - Non-obvious behavior
 */
```

### 9.7 API Documentation Format

Each tool must be documented with:

```markdown
### tool_name

**Description:** What the tool does

**Category:** workspace | task | interaction

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| param1 | string | Yes | - | Description |
| param2 | number | No | 100 | Description |

**Returns:**

```typescript
{
  success: boolean;
  data?: {
    // Response fields
  };
  error?: string;
}
```

**Example:**

```typescript
// Request
{ "param1": "value" }

// Response
{ "success": true, "data": { ... } }
```

**Errors:**

| Code | Condition |
|------|-----------|
| VALIDATION_ERROR | Invalid parameters |
| NOT_FOUND | Resource not found |
```

---

## 10. File Structure

### 6.1 Target Directory Structure

```
Fetch/
├── .env                          # Environment variables
├── .env.example                  # Example env file
├── docker-compose.yml            # Container orchestration
├── PLAN.md                       # This document
├── README.md                     # Project overview
├── CHANGELOG.md                  # Version history
│
├── fetch-app/                    # Main application
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   │
│   ├── prompts/                  # LLM prompts
│   │   ├── agent.md              # Main agent prompt
│   │   ├── intent.md             # Intent classification
│   │   ├── task-frame.md         # Task delegation template
│   │   ├── summarize.md          # Progress summarization
│   │   └── error-recovery.md     # Error handling
│   │
│   └── src/
│       ├── index.ts              # Entry point
│       │
│       ├── bridge/               # WhatsApp integration
│       │   ├── client.ts         # WhatsApp client wrapper
│       │   └── types.ts          # WhatsApp types
│       │
│       ├── security/             # Access control
│       │   ├── gate.ts           # Phone whitelist, rate limiting
│       │   └── types.ts
│       │
│       ├── agent/                # LLM orchestration
│       │   ├── core.ts           # Main agent loop
│       │   ├── intent.ts         # Intent classifier
│       │   ├── conversation.ts   # Conversation handler
│       │   └── format.ts         # Response formatting
│       │
│       ├── task/                 # Task management (NEW)
│       │   ├── manager.ts        # Task lifecycle
│       │   ├── queue.ts          # Task queue
│       │   ├── router.ts         # Agent selection
│       │   └── types.ts          # Task types
│       │
│       ├── harness/              # Agent harnesses (NEW)
│       │   ├── executor.ts       # Process management
│       │   ├── claude.ts         # Claude Code harness
│       │   ├── gemini.ts         # Gemini CLI harness
│       │   ├── copilot.ts        # Copilot CLI harness
│       │   ├── output-parser.ts  # Stream parsing
│       │   └── types.ts          # Harness types
│       │
│       ├── workspace/            # Workspace management (NEW)
│       │   ├── manager.ts        # Workspace operations
│       │   └── types.ts
│       │
│       ├── session/              # Session management
│       │   ├── manager.ts        # Session lifecycle
│       │   ├── store.ts          # Persistence
│       │   └── types.ts
│       │
│       ├── tools/                # Tool definitions
│       │   ├── registry.ts       # Tool registry
│       │   ├── workspace.ts      # Workspace tools
│       │   ├── task.ts           # Task tools
│       │   ├── interaction.ts    # User interaction tools
│       │   └── types.ts
│       │
│       └── utils/
│           ├── logger.ts
│           ├── docker.ts         # Docker exec utilities
│           └── stream.ts         # Stream processing
│
├── kennel/                       # Execution container
│   ├── Dockerfile
│   └── entrypoint.sh
│
├── workspace/                    # User projects (mounted)
│   └── .gitkeep
│
├── data/                         # Persistent data
│   ├── sessions.json
│   ├── tasks.json                # Task history (NEW)
│   └── .wwebjs_auth/             # WhatsApp auth
│
└── docs/
    ├── markdown/
    │   ├── API_REFERENCE.md
    │   └── DOCUMENTATION.md
    └── html/
        └── ... (generated)
```

### 6.2 Files to Create (New)

| File | Purpose | Priority |
|------|---------|----------|
| `fetch-app/prompts/agent.md` | Main agent prompt | P0 |
| `fetch-app/prompts/intent.md` | Intent classification | P0 |
| `fetch-app/prompts/task-frame.md` | Task framing | P0 |
| `fetch-app/prompts/summarize.md` | Progress summarization | P1 |
| `fetch-app/prompts/error-recovery.md` | Error handling | P1 |
| `fetch-app/src/task/manager.ts` | Task lifecycle | P0 |
| `fetch-app/src/task/queue.ts` | Task queue | P0 |
| `fetch-app/src/task/router.ts` | Agent selection | P0 |
| `fetch-app/src/task/types.ts` | Task types | P0 |
| `fetch-app/src/harness/executor.ts` | Process management | P0 |
| `fetch-app/src/harness/claude.ts` | Claude harness | P0 |
| `fetch-app/src/harness/gemini.ts` | Gemini harness | P1 |
| `fetch-app/src/harness/copilot.ts` | Copilot harness | P1 |
| `fetch-app/src/harness/output-parser.ts` | Stream parsing | P0 |
| `fetch-app/src/harness/types.ts` | Harness types | P0 |
| `fetch-app/src/workspace/manager.ts` | Workspace operations | P0 |
| `fetch-app/src/workspace/types.ts` | Workspace types | P0 |
| `fetch-app/src/tools/workspace.ts` | Workspace tools | P0 |
| `fetch-app/src/tools/task.ts` | Task tools | P0 |
| `fetch-app/src/tools/interaction.ts` | Interaction tools | P0 |
| `fetch-app/src/utils/docker.ts` | Docker utilities | P0 |
| `fetch-app/src/utils/stream.ts` | Stream utilities | P0 |
| `data/tasks.json` | Task persistence | P0 |

### 6.3 Files to Remove

| File | Reason |
|------|--------|
| `fetch-app/src/tools/file.ts` | Replaced by harness delegation |
| `fetch-app/src/tools/code.ts` | Replaced by harness delegation |
| `fetch-app/src/tools/shell.ts` | Replaced by harness delegation |
| `fetch-app/src/tools/git.ts` | Replaced by workspace_status |
| `fetch-app/src/tools/schemas.ts` | Simplified tool set doesn't need complex validation |
| `fetch-app/src/agent/action.ts` | Merged into task manager |
| `fetch-app/src/agent/inquiry.ts` | Merged into conversation handler |

### 6.4 Files to Modify

| File | Changes |
|------|---------|
| `fetch-app/src/tools/registry.ts` | Register new tools, remove old ones |
| `fetch-app/src/agent/core.ts` | Simplify to routing logic only |
| `fetch-app/src/agent/intent.ts` | Update classification for new intents |
| `fetch-app/src/session/types.ts` | Add task-related types |
| `fetch-app/src/session/manager.ts` | Add task state management |
| `docker-compose.yml` | Ensure proper mounts and networking |

---

## 11. Implementation Phases

### Phase 1: Foundation (Week 1) ✅

**Goal:** Core infrastructure for task delegation

| Status | Task | File(s) | Est. Hours |
|--------|------|---------|------------|
| ✅ | Define task types | `task/types.ts` | 2 |
| ✅ | Create task manager | `task/manager.ts` | 4 |
| ✅ | Create task queue | `task/queue.ts` | 2 |
| ✅ | Define harness types | `harness/types.ts` | 2 |
| ✅ | Create harness executor | `harness/executor.ts` | 6 |
| ✅ | Create Claude harness | `harness/claude.ts` | 4 |
| ✅ | Create output parser | `harness/output-parser.ts` | 4 |
| ✅ | Create validation schemas | `validation/common.ts`, `validation/tools.ts` | 3 |
| ✅ | Create ID generators | `utils/id.ts` | 1 |
| ✅ | Docker utilities | `utils/docker.ts` | 2 |
| ✅ | Stream utilities | `utils/stream.ts` | 2 |

**Deliverable:** Can execute a Claude Code task from code

### Phase 2: Tool Migration (Week 2) ✅

**Goal:** Replace current tools with new simplified set

| Status | Task | File(s) | Est. Hours |
|--------|------|---------|------------|
| ✅ | Create workspace types | `workspace/types.ts` | 1 |
| ✅ | Create workspace manager | `workspace/manager.ts` | 3 |
| ✅ | Create workspace tools | `tools/workspace.ts` | 2 |
| ✅ | Create task tools | `tools/task.ts` | 4 |
| ✅ | Create interaction tools | `tools/interaction.ts` | 2 |
| ✅ | Create v2 tool registry | `tools/v2/registry.ts` | 2 |
| ⬜ | Remove old tools | Delete files | 1 |
| ⬜ | Update tool tests | Test files | 4 |

**Deliverable:** New tool set working in isolation

### Phase 3: Agent Refactor (Week 3) 🔄

**Goal:** Simplify agent to routing-only logic

| Status | Task | File(s) | Est. Hours |
|--------|------|---------|------------|
| ✅ | Write agent prompt | `agent/prompts-v2.ts` | 3 |
| ✅ | Write intent prompt | `agent/prompts-v2.ts` | 2 |
| ✅ | Write task frame prompt | `agent/prompts-v2.ts` | 2 |
| ✅ | Update intent classifier | `agent/intent-v2.ts` | 4 |
| ✅ | Create v2 agent core | `agent/core-v2.ts` | 6 |
| ✅ | Create v2 handler | `handler/v2.ts` | 2 |
| ⬜ | Update agent index exports | `agent/index.ts` | 1 |
| ⬜ | Deprecate action/inquiry handlers | Soft deprecate | 1 |

**Deliverable:** Agent routes to tasks correctly

### Phase 4: Integration (Week 4) ✅

**Goal:** Connect all components end-to-end

| Status | Task | File(s) | Est. Hours |
|--------|------|---------|------------|
| ✅ | Task ↔ Harness integration | `task/integration.ts` | 4 |
| ✅ | Progress streaming to WhatsApp | `task/integration.ts` | 4 |
| ✅ | Question detection and routing | `harness/executor.ts` | 4 |
| ✅ | Error recovery implementation | `task/manager.ts` | 4 |
| ✅ | Write summarize prompt | `agent/prompts-v2.ts` | 2 |
| ✅ | Write error recovery prompt | `agent/prompts-v2.ts` | 2 |

**Deliverable:** Full flow working: WhatsApp → Fetch → Claude → WhatsApp

### Phase 5: Migration Support ✅

**Goal:** Support gradual v1→v2 migration

| Status | Task | File(s) | Est. Hours |
|--------|------|---------|------------|
| ✅ | Feature flags | `handler/v2.ts` | 2 |
| ✅ | Gradual rollout by user ID | `handler/v2.ts` | 2 |
| ✅ | Legacy tool preservation | `tools/legacy/` | 2 |

**Deliverable:** V2 can run alongside V1

### Phase 6: Polish & Testing (Future)

**Goal:** Production-ready quality

| Status | Task | File(s) | Est. Hours |
|--------|------|---------|------------|
| ⬜ | Create Gemini harness | `harness/gemini.ts` | 4 |
| ⬜ | Create Copilot harness | `harness/copilot.ts` | 4 |
| ⬜ | End-to-end tests | Test files | 8 |
| ⬜ | Error handling polish | Multiple | 4 |
| ⬜ | Performance optimization | Multiple | 4 |
| ⬜ | Documentation updates | Docs | 4 |

**Deliverable:** v2.0 release candidate

---

## 14. Phase 6 Detailed Implementation

### 14.1 Additional Harnesses

#### 14.1.1 Gemini CLI Harness (`harness/gemini.ts`)

**CLI Reference:**
```bash
# Gemini CLI invocation patterns
gemini -p "Add dark mode to settings"           # Basic prompt
gemini --model gemini-2.0-flash -p "..."        # With model selection
gemini --sandbox=none -p "..."                  # Full file access
```

**Implementation Tasks:**
| # | Task | Description |
|---|------|-------------|
| 1 | Research Gemini CLI | Document CLI flags, output patterns, behaviors |
| 2 | Define constants | Command, default args, patterns |
| 3 | Implement `GeminiAdapter` class | Following `HarnessAdapter` interface |
| 4 | Parse output patterns | Progress, questions, completion, file ops |
| 5 | Handle Gemini-specific quirks | Model selection, tool permissions |
| 6 | Unit tests | Test config building, output parsing |

**Output Patterns to Detect:**
```typescript
// Gemini CLI output patterns (to be validated)
const GEMINI_PATTERNS = {
  question: /^>\s*(.+\?)\s*$/m,           // "> Should I continue?"
  fileOp: /^\[(Created|Modified|Deleted)\]\s+(.+)$/m,
  progress: /^(Analyzing|Working|Generating)\.\.\./m,
  complete: /^(Done|Complete|Finished)[.!]?\s*$/im,
  error: /^Error:\s+(.+)$/m,
};
```

**Class Structure:**
```typescript
// harness/gemini.ts
export class GeminiAdapter implements HarnessAdapter {
  readonly agent: AgentType = 'gemini';
  
  buildConfig(goal: string, workspacePath: string, timeoutMs: number): HarnessConfig;
  parseOutputLine(line: string): HarnessOutputEventType | null;
  detectQuestion(output: string): string | null;
  formatResponse(response: string): string;
  extractFileOperations(output: string): FileOperations;
  extractSummary(output: string): string;
}

export const geminiAdapter = new GeminiAdapter();
```

#### 14.1.2 GitHub Copilot CLI Harness (`harness/copilot.ts`)

**CLI Reference:**
```bash
# Copilot CLI invocation patterns (gh extension)
gh copilot suggest "Add dark mode"              # Suggestion mode
gh copilot explain "What does this do?"         # Explanation mode
```

**Implementation Tasks:**
| # | Task | Description |
|---|------|-------------|
| 1 | Research Copilot CLI | Document `gh copilot` flags and behaviors |
| 2 | Determine viability | Can Copilot CLI do file edits? Or suggestions only? |
| 3 | Define constants | Command (`gh copilot`), args, patterns |
| 4 | Implement `CopilotAdapter` class | Following `HarnessAdapter` interface |
| 5 | Handle auth flow | GitHub CLI must be authenticated |
| 6 | Unit tests | Test config building, output parsing |

**Output Patterns to Detect:**
```typescript
// Copilot CLI output patterns (to be validated)
const COPILOT_PATTERNS = {
  suggestion: /^Suggestion:\s*(.+)$/m,
  explanation: /^Explanation:\s*(.+)$/m,
  command: /^\$\s+(.+)$/m,                // Suggested shell command
  complete: /^(Done|Suggestion complete)/im,
};
```

**Class Structure:**
```typescript
// harness/copilot.ts
export class CopilotAdapter implements HarnessAdapter {
  readonly agent: AgentType = 'copilot';
  
  buildConfig(goal: string, workspacePath: string, timeoutMs: number): HarnessConfig;
  parseOutputLine(line: string): HarnessOutputEventType | null;
  detectQuestion(output: string): string | null;
  formatResponse(response: string): string;
  extractSuggestion(output: string): string;  // Copilot-specific
}

export const copilotAdapter = new CopilotAdapter();
```

#### 14.1.3 Harness Registry Updates

```typescript
// harness/registry.ts (new file)
import { claudeAdapter } from './claude.js';
import { geminiAdapter } from './gemini.js';
import { copilotAdapter } from './copilot.js';
import type { HarnessAdapter } from './types.js';
import type { AgentType } from '../task/types.js';

const adapters: Map<AgentType, HarnessAdapter> = new Map([
  ['claude', claudeAdapter],
  ['gemini', geminiAdapter],
  ['copilot', copilotAdapter],
]);

export function getAdapter(agent: AgentType): HarnessAdapter {
  const adapter = adapters.get(agent);
  if (!adapter) {
    throw new Error(`No adapter for agent: ${agent}`);
  }
  return adapter;
}

export function listAdapters(): AgentType[] {
  return Array.from(adapters.keys());
}
```

---

### 14.2 End-to-End Tests

#### 14.2.1 Test Structure

```
fetch-app/
├── src/
└── tests/
    ├── e2e/
    │   ├── task-flow.test.ts      # Full task lifecycle
    │   ├── conversation.test.ts   # Conversation routing
    │   ├── workspace.test.ts      # Workspace management
    │   ├── error-recovery.test.ts # Error scenarios
    │   └── harness-mock.ts        # Mock harness for testing
    ├── integration/
    │   ├── handler-v2.test.ts     # HTTP handler tests
    │   ├── orchestrator.test.ts   # Core V2 routing
    │   └── tools.test.ts          # Tool execution
    └── unit/
        ├── intent-v2.test.ts      # Intent classification
        ├── task-queue.test.ts     # Queue operations
        └── harness-adapters.test.ts
```

#### 14.2.2 E2E Test Scenarios

| # | Scenario | Description | Expected Outcome |
|---|----------|-------------|------------------|
| 1 | Happy path task | User requests coding task | Task created, executed, completed |
| 2 | Conversation fallback | User asks casual question | No task created, conversational response |
| 3 | Workspace selection | User switches workspace | Workspace updated in session |
| 4 | Task cancellation | User sends "stop" during task | Task cancelled, harness killed |
| 5 | Harness question | Harness asks user question | Question relayed, answer forwarded |
| 6 | Task timeout | Harness exceeds timeout | Task failed, user notified |
| 7 | Circuit breaker | 3 consecutive API errors | Requests blocked, user informed |
| 8 | Graceful degradation | Harness unavailable | Fallback message, no crash |

#### 14.2.3 Test Implementation Example

```typescript
// tests/e2e/task-flow.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { processMessageV2 } from '../../src/agent/core-v2.js';
import { createMockSession } from '../helpers/session.js';
import { MockHarnessExecutor } from '../helpers/harness-mock.js';

describe('E2E: Task Flow', () => {
  let mockExecutor: MockHarnessExecutor;
  
  beforeEach(() => {
    mockExecutor = new MockHarnessExecutor();
  });
  
  afterEach(() => {
    mockExecutor.cleanup();
  });
  
  it('should complete a coding task successfully', async () => {
    const session = createMockSession({
      workspace: { path: '/workspace/test-project', name: 'test-project' }
    });
    
    // Mock harness to return success after "working"
    mockExecutor.queueResponse({
      status: 'completed',
      output: 'Created src/dark-mode.ts\nDone.',
      exitCode: 0,
    });
    
    const response = await processMessageV2(
      'Add dark mode toggle',
      session
    );
    
    expect(response.text).toContain('Done');
    expect(mockExecutor.calls).toHaveLength(1);
    expect(mockExecutor.calls[0].goal).toBe('Add dark mode toggle');
  });
  
  it('should handle circuit breaker activation', async () => {
    const session = createMockSession();
    
    // Cause 3 consecutive errors
    for (let i = 0; i < 3; i++) {
      mockExecutor.queueError(new Error('API Error'));
      await processMessageV2('Do something', session);
    }
    
    // 4th request should be blocked
    const response = await processMessageV2('Another request', session);
    expect(response.text).toContain('taking a short break');
  });
});
```

#### 14.2.4 Mock Harness Implementation

```typescript
// tests/helpers/harness-mock.ts
import type { HarnessResult } from '../../src/harness/types.js';

interface MockResponse {
  status: 'completed' | 'failed';
  output: string;
  exitCode: number;
  delay?: number;
}

export class MockHarnessExecutor {
  public calls: Array<{ goal: string; workspace: string }> = [];
  private responseQueue: Array<MockResponse | Error> = [];
  
  queueResponse(response: MockResponse): void {
    this.responseQueue.push(response);
  }
  
  queueError(error: Error): void {
    this.responseQueue.push(error);
  }
  
  async execute(goal: string, workspace: string): Promise<HarnessResult> {
    this.calls.push({ goal, workspace });
    
    const response = this.responseQueue.shift();
    if (!response) {
      throw new Error('No mock response queued');
    }
    
    if (response instanceof Error) {
      throw response;
    }
    
    if (response.delay) {
      await new Promise(r => setTimeout(r, response.delay));
    }
    
    return {
      status: response.status,
      output: response.output,
      exitCode: response.exitCode,
      duration: 1000,
    };
  }
  
  cleanup(): void {
    this.calls = [];
    this.responseQueue = [];
  }
}
```

---

### 14.3 Documentation Updates

#### 14.3.1 Files to Update

| Priority | File | Updates Needed |
|----------|------|----------------|
| P0 | `README.md` | V2 overview, new architecture, feature flags |
| P0 | `docs/markdown/API_REFERENCE.md` | All 8 V2 tools with schemas |
| P1 | `docs/markdown/DOCUMENTATION.md` | V2 concepts, task lifecycle |
| P1 | `docs/markdown/COMMANDS.md` | V2 command patterns |
| P2 | `docs/markdown/SETUP_GUIDE.md` | V2 configuration |
| P2 | `docs/markdown/AGENTIC_PLAN.md` | Update or deprecate |

#### 14.3.2 README.md Updates

**New Sections to Add:**
```markdown
## V2 Architecture

Fetch v2 introduces a new orchestration architecture:

### Key Concepts

- **Intent Classification**: Messages are classified as `task`, `workspace`, or `conversation`
- **Task Delegation**: Coding tasks are delegated to external harnesses (Claude Code, Gemini CLI)
- **Feature Flags**: V2 can be enabled gradually via environment variables

### Enabling V2

```bash
# In .env
FETCH_V2_ENABLED=true
FETCH_V2_ROLLOUT_PERCENT=100  # % of users on V2
```

### V2 Tools

| Tool | Purpose |
|------|---------|
| workspace_status | Get current workspace info |
| workspace_list | List available workspaces |
| workspace_select | Switch active workspace |
| task_create | Create a new coding task |
| task_status | Check task progress |
| task_cancel | Cancel running task |
| harness_answer | Answer harness questions |
| search_code | Search codebase (future) |
```

#### 14.3.3 API_REFERENCE.md Updates

Each tool needs:
```markdown
### workspace_status

Get information about the currently selected workspace.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "path": { "type": "string" },
    "gitBranch": { "type": "string" },
    "lastModified": { "type": "string", "format": "date-time" }
  }
}
```

**Example:**
```typescript
// Request
{}

// Response
{
  "name": "fetch",
  "path": "/workspace/fetch",
  "gitBranch": "main",
  "lastModified": "2026-02-03T10:30:00Z"
}
```

**Error Codes:**
| Code | Message | Cause |
|------|---------|-------|
| NO_WORKSPACE | No workspace selected | User hasn't selected a workspace |
```

---

### 14.4 Performance Optimization

#### 14.4.1 Token Usage Optimization

**Current Issues:**
- System prompts may be too long
- Conversation history grows unbounded
- Tool descriptions repeated each call

**Optimizations:**
| # | Optimization | Expected Savings |
|---|--------------|------------------|
| 1 | Truncate conversation history to last 10 messages | 40-60% tokens |
| 2 | Use `messages.slice(-10)` in OpenAI calls | N/A (implementation) |
| 3 | Compress system prompt for simple intents | 30% for conversation |
| 4 | Cache tool definitions | Reduces parsing overhead |
| 5 | Lazy-load tools only when needed | Reduces initial payload |

**Implementation:**
```typescript
// agent/core-v2.ts - Add conversation truncation
function truncateHistory(messages: Message[], maxMessages = 10): Message[] {
  if (messages.length <= maxMessages) {
    return messages;
  }
  
  // Always keep system message
  const systemMsg = messages.find(m => m.role === 'system');
  const recentMsgs = messages.slice(-maxMessages);
  
  if (systemMsg && recentMsgs[0].role !== 'system') {
    return [systemMsg, ...recentMsgs.slice(1)];
  }
  
  return recentMsgs;
}
```

#### 14.4.2 Response Time Optimization

**Current Flow:**
```
User message → Intent classification → Tool selection → Tool execution → Response
              ~500ms                  ~300ms          ~varies         ~100ms
```

**Optimizations:**
| # | Optimization | Target Improvement |
|---|--------------|-------------------|
| 1 | Cache intent classification results | Skip classification for known patterns |
| 2 | Pre-warm OpenAI connection | Reduce cold start by 200ms |
| 3 | Parallel tool calls where safe | 30-50% faster for multi-tool |
| 4 | Stream responses for long tasks | Better perceived performance |
| 5 | Use faster model for simple intents | gpt-4o-mini for conversation |

**Model Selection by Intent:**
```typescript
function getModelForIntent(intent: IntentType): string {
  switch (intent) {
    case 'conversation':
      return 'gpt-4o-mini';  // Faster, cheaper for chat
    case 'task':
    case 'workspace':
      return 'gpt-4o';       // Full power for tool use
    default:
      return 'gpt-4o';
  }
}
```

#### 14.4.3 Metrics to Track

```typescript
// utils/metrics.ts
interface PerformanceMetrics {
  intentClassificationMs: number;
  toolExecutionMs: number;
  totalResponseMs: number;
  tokensInput: number;
  tokensOutput: number;
  model: string;
}

function logMetrics(metrics: PerformanceMetrics): void {
  logger.info('Performance metrics', {
    ...metrics,
    timestamp: new Date().toISOString(),
  });
}
```

---

### 14.5 Phase 6 Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Gemini Harness | `harness/gemini.ts`, unit tests |
| 1 | Copilot Harness | `harness/copilot.ts`, unit tests |
| 2 | E2E Test Setup | Test infrastructure, mock harness |
| 2 | E2E Tests | 8 core scenarios |
| 3 | Documentation | README, API_REFERENCE, COMMANDS |
| 3 | Performance | Token optimization, response time |
| 4 | Polish | Bug fixes, edge cases, release prep |

### 14.6 Success Criteria

| Metric | Target |
|--------|--------|
| E2E test coverage | >80% of core flows |
| Average response time | <2s for routing decisions |
| Token usage reduction | 30% vs current |
| Documentation completeness | All 8 tools documented |
| Harness adapters | 3 (Claude, Gemini, Copilot) |

---

## 8. Interaction Diagrams

### 8.1 Happy Path: Task Completion

```
User                    Fetch Bridge              Kennel                Claude Code
 │                           │                      │                        │
 │  "@fetch add dark mode"   │                      │                        │
 │ ─────────────────────────>│                      │                        │
 │                           │                      │                        │
 │                           │ [Intent: TASK]       │                        │
 │                           │ [Create task]        │                        │
 │                           │                      │                        │
 │  "🐕 Got it! Starting..." │                      │                        │
 │ <─────────────────────────│                      │                        │
 │                           │                      │                        │
 │                           │  docker exec claude  │                        │
 │                           │ ────────────────────>│                        │
 │                           │                      │                        │
 │                           │                      │  claude --print "..."  │
 │                           │                      │ ───────────────────────>│
 │                           │                      │                        │
 │                           │                      │  [Working on files...] │
 │                           │      stdout stream   │ <───────────────────────│
 │                           │ <────────────────────│                        │
 │                           │                      │                        │
 │  "🔄 Modifying files..."  │                      │                        │
 │ <─────────────────────────│                      │                        │
 │                           │                      │                        │
 │                           │                      │  [Done! Added 3 files] │
 │                           │    exit code 0      │ <───────────────────────│
 │                           │ <────────────────────│                        │
 │                           │                      │                        │
 │  "✅ Done! Dark mode..."  │                      │                        │
 │ <─────────────────────────│                      │                        │
 │                           │                      │                        │
```

### 8.2 Interactive Flow: Harness Asks Question

```
User                    Fetch Bridge              Kennel                Claude Code
 │                           │                      │                        │
 │  "@fetch refactor auth"   │                      │                        │
 │ ─────────────────────────>│                      │                        │
 │                           │                      │                        │
 │  "🐕 Starting refactor..."│                      │                        │
 │ <─────────────────────────│                      │                        │
 │                           │                      │                        │
 │                           │  docker exec claude  │                        │
 │                           │ ────────────────────>│                        │
 │                           │                      │                        │
 │                           │                      │  claude --print "..."  │
 │                           │                      │ ───────────────────────>│
 │                           │                      │                        │
 │                           │                      │  "Should I also update │
 │                           │                      │   the tests?"          │
 │                           │  question detected   │ <───────────────────────│
 │                           │ <────────────────────│                        │
 │                           │                      │                        │
 │  "❓ Should I also update │  [Task: WAITING]     │                        │
 │      the tests?"          │                      │                        │
 │ <─────────────────────────│                      │                        │
 │                           │                      │                        │
 │  "yes"                    │                      │                        │
 │ ─────────────────────────>│                      │                        │
 │                           │                      │                        │
 │                           │ [Intent: RESPONSE]   │                        │
 │                           │                      │                        │
 │                           │  stdin: "yes\n"      │                        │
 │                           │ ────────────────────>│                        │
 │                           │                      │                        │
 │                           │                      │  stdin: "yes\n"        │
 │                           │                      │ ───────────────────────>│
 │                           │                      │                        │
 │                           │                      │  [Updating tests...]   │
 │                           │      stdout stream   │ <───────────────────────│
 │                           │ <────────────────────│                        │
 │                           │                      │                        │
```

### 8.3 Error Flow: Timeout Recovery

```
User                    Fetch Bridge              Kennel                Claude Code
 │                           │                      │                        │
 │  "@fetch migrate DB"      │                      │                        │
 │ ─────────────────────────>│                      │                        │
 │                           │                      │                        │
 │  "🐕 Starting migration..."                      │                        │
 │ <─────────────────────────│                      │                        │
 │                           │                      │                        │
 │                           │  docker exec claude  │                        │
 │                           │ ────────────────────>│                        │
 │                           │                      │                        │
 │                           │      ... 5 minutes pass ...                   │
 │                           │                      │                        │
 │                           │  timeout reached     │                        │
 │                           │ <────────────────────│                        │
 │                           │                      │                        │
 │                           │ [Error Recovery]     │                        │
 │                           │ Retry count: 1       │                        │
 │                           │ Action: extend timeout                        │
 │                           │                      │                        │
 │  "⏱️ Taking longer than   │                      │                        │
 │   expected. Continuing..."│                      │                        │
 │ <─────────────────────────│                      │                        │
 │                           │                      │                        │
 │                           │  docker exec claude  │                        │
 │                           │  (timeout: 10min)    │                        │
 │                           │ ────────────────────>│                        │
 │                           │                      │                        │
```

---

## 9. Assumption Validation

### 9.1 Validated Assumptions ✅

| Assumption | Validation | Notes |
|------------|------------|-------|
| GPT-4.1-mini can handle routing | ✅ Intent classification is simple | Could even use fine-tuned smaller model |
| Docker exec works for harnesses | ✅ Standard Docker functionality | Need proper socket permissions |
| Harnesses accept stdin | ✅ Claude Code supports interactive mode | Need PTY for proper handling |
| stdout can be streamed | ✅ Node.js ChildProcess supports this | Use spawn, not exec |
| Conversation history persists | ✅ Current implementation works | Session manager already handles this |

### 9.2 Partially Validated Assumptions ⚠️

| Assumption | Status | Validation Needed |
|------------|--------|-------------------|
| Claude Code outputs parseable progress | ⚠️ Need to verify output format | Test with real Claude Code |
| Gemini CLI has similar interface | ⚠️ Different CLI structure | Test Gemini CLI |
| Copilot CLI can execute tasks | ⚠️ Suggest vs Execute modes differ | Test gh copilot capabilities |
| Question detection is reliable | ⚠️ Heuristics may miss edge cases | Need pattern testing |
| 500 char summaries are sufficient | ⚠️ Some tasks may need more | User feedback needed |

### 9.3 Invalidated/Modified Assumptions ❌

| Original Assumption | Reality | Modification |
|---------------------|---------|--------------|
| "Each system has prompt/intent classification" | Harnesses do their own classification | Fetch only classifies for routing |
| "Tools between harnesses and tasking system" | Harnesses are black boxes | Use process I/O, not tool calls |
| "Can assign tasks like a job queue" | Harnesses run synchronously | One task at a time per harness |
| "Conversation history shared with harnesses" | Each harness has own context | Serialize relevant history in prompt |
| "Harnesses need skills.md" | They have built-in capabilities | Only provide task + workspace context |

### 9.4 New Assumptions to Validate

| Assumption | Risk if Wrong | Validation Method |
|------------|---------------|-------------------|
| Claude Code CLI is available in container | P0 - Core functionality broken | Test installation in Kennel |
| Auth tokens persist across container restarts | P1 - Re-auth needed each time | Test with mounted volumes |
| Process kill terminates cleanly | P2 - Zombie processes | Test abort scenarios |
| Output encoding is UTF-8 | P2 - Garbled text | Test with special characters |
| Rate limits are per-user not per-container | P1 - Shared limits exhausted | Check API documentation |

---

## 10. Risk Assessment

### 10.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Harness process hangs | Medium | High | Implement hard timeout + kill |
| Question detection misses | Medium | Medium | Fallback to timeout-based prompt |
| Output parsing breaks | Low | High | Graceful degradation to raw output |
| Docker socket permissions | Low | High | Document setup requirements |
| Memory leak in long sessions | Low | Medium | Session cleanup, process recycling |

### 10.2 Functional Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Wrong agent selected | Medium | Low | Allow user override, learn preferences |
| Task takes too long | High | Medium | Progress updates, cancellation support |
| Harness produces bad code | Low | High | User review before merging (git status) |
| Context lost between messages | Low | Medium | Robust session management |

### 10.3 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| API rate limits hit | Medium | Medium | Queue tasks, switch agents |
| WhatsApp disconnects | Medium | Low | Auto-reconnect, auth persistence |
| Container crashes | Low | High | Auto-restart, state persistence |
| Disk fills up | Low | Medium | Log rotation, workspace limits |

---

## 11. Open Questions

### 11.1 Architecture Questions

1. **Should Fetch support multiple concurrent tasks?**
   - ✅ **Decision: One task at a time**
   - Rationale: Simpler state management, clearer user experience
   - Implementation: Task manager blocks new tasks while one is running

2. **How to handle very long tasks (>10 min)?**
   - Option A: Just let them run with periodic updates
   - Option B: Break into subtasks automatically
   - Decision needed: Phase 4

3. **Should workspace be per-user or shared?**
   - ✅ **Decision: Shared /workspace**
   - Rationale: Single user system, simpler setup
   - Implementation: All repos in /workspace, user selects active

### 11.2 UX Questions

1. **How verbose should progress updates be?**
   - ✅ **Decision: Summaries (every 30s)**
   - Rationale: Less noise, WhatsApp-friendly
   - Implementation: Aggregate changes, report periodically

2. **How to present code diffs on WhatsApp?**
   - Option A: Don't (just list files)
   - Option B: Shortened inline
   - Option C: Link to web view
   - Decision needed: Phase 4

3. **Should cancelled tasks attempt rollback?**
   - Option A: Yes, git reset
   - Option B: No, leave as-is
   - Option C: Ask user
   - Decision needed: Phase 3

### 11.3 Integration Questions

1. **What's the exact Claude Code CLI syntax?**
   - Need: Test current installation
   - Blocking: Phase 1 harness implementation

2. **Does Gemini CLI support stdin interaction?**
   - Need: Test with actual CLI
   - Blocking: Phase 5 Gemini harness

3. **What Copilot CLI capabilities are useful?**
   - Need: Review gh copilot documentation
   - Blocking: Phase 5 Copilot harness

---

## Appendix A: Configuration Reference

### Environment Variables

```bash
# Fetch Bridge
OPENROUTER_API_KEY=sk-or-...        # LLM API access
AGENT_MODEL=openai/gpt-4.1-mini     # Orchestration model
OWNER_PHONE=+1234567890             # Authorized user
TRIGGER_WORD=@fetch                  # Activation trigger

# Task Settings
TASK_TIMEOUT_DEFAULT=300000         # 5 minutes
TASK_TIMEOUT_MAX=600000             # 10 minutes
TASK_PROGRESS_INTERVAL=30000        # 30 seconds

# Harness Settings
CLAUDE_PATH=/usr/local/bin/claude
GEMINI_PATH=/usr/local/bin/gemini
COPILOT_PATH=/usr/bin/gh

# Feature Flags
ENABLE_GEMINI=false                 # Phase 5
ENABLE_COPILOT=false                # Phase 5
VERBOSE_MODE=false                  # Debug output
FETCH_V2_ENABLED=true               # Enable V2 orchestrator
FETCH_V2_ROLLOUT_PERCENT=100        # Gradual rollout (0-100)
```

### Docker Compose Configuration

```yaml
services:
  fetch-bridge:
    volumes:
      - ./data:/app/data
      - ./workspace:/workspace
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - KENNEL_CONTAINER=fetch-kennel

  fetch-kennel:
    volumes:
      - ./workspace:/workspace
      - ~/.config/gh:/root/.config/gh:ro
      - ~/.config/claude-code:/root/.config/claude-code:ro
      - ~/.gemini:/root/.gemini:ro
```

---

## 12. Documentation Update Plan

### Overview

This section outlines the plan to update all documentation to reflect the V2 orchestrator architecture.

### 12.1 Documentation Files to Update

| Priority | File | Status | Description |
|----------|------|--------|-------------|
| 1 | `docs/markdown/API_REFERENCE.md` | ⬜ | V2 tool APIs, data models, params |
| 2 | `docs/markdown/DOCUMENTATION.md` | ⬜ | Architecture overview, flow diagrams |
| 3 | `docs/markdown/AGENTIC_PLAN.md` | ⬜ | V2 task delegation model |
| 4 | `docs/markdown/COMMANDS.md` | ⬜ | New slash commands for V2 |
| 5 | `docs/markdown/SETUP_GUIDE.md` | ⬜ | V2 configuration, feature flags |
| 6 | `docs/markdown/CHANGELOG.md` | ⬜ | Sync with root CHANGELOG |
| 7 | `README.md` | ⬜ | Update architecture section |

### 12.2 API Reference Structure

```markdown
# Fetch V2 API Reference

## 1. Tool APIs

### 1.1 Workspace Tools
- workspace_list
- workspace_select  
- workspace_status

### 1.2 Task Tools
- task_create
- task_status
- task_cancel
- task_respond

### 1.3 Interaction Tools
- ask_user
- report_progress

## 2. Data Models

### 2.1 Task
### 2.2 Session
### 2.3 Workspace
### 2.4 HarnessResult

## 3. Request/Response Formats

## 4. Error Codes
```

### 12.3 API Specifications

#### Workspace Tools

| Tool | Description | Input Schema | Output |
|------|-------------|--------------|--------|
| `workspace_list` | List available workspaces | `{}` | `{workspaces: Workspace[]}` |
| `workspace_select` | Select active workspace | `{name: string}` | `{success: boolean, workspace: Workspace}` |
| `workspace_status` | Get workspace status | `{name?: string}` | `{workspace: Workspace, git: GitStatus}` |

#### Task Tools

| Tool | Description | Input Schema | Output |
|------|-------------|--------------|--------|
| `task_create` | Create a coding task | `{goal: string, agent?: AgentType, workspace?: string, timeout?: number}` | `{taskId: TaskId, status: TaskStatus}` |
| `task_status` | Get task status | `{taskId?: TaskId}` | `{task: Task}` |
| `task_cancel` | Cancel a task | `{taskId?: TaskId, reason?: string}` | `{success: boolean}` |
| `task_respond` | Respond to task question | `{taskId?: TaskId, response: string}` | `{success: boolean}` |

#### Interaction Tools

| Tool | Description | Input Schema | Output |
|------|-------------|--------------|--------|
| `ask_user` | Ask user a question | `{question: string, options?: string[]}` | `{response: string}` |
| `report_progress` | Report task progress | `{taskId?: TaskId, message: string, percent?: number, files?: string[]}` | `{success: boolean}` |

### 12.4 Data Model Definitions

```typescript
// Task
interface Task {
  id: TaskId;                    // Format: tsk_{nanoid(10)}
  goal: string;                  // User's request
  workspace: string;             // Target workspace name
  agent: AgentType;              // 'claude' | 'gemini' | 'copilot'
  agentSelection: AgentSelection; // 'auto' | specific agent
  status: TaskStatus;            // Lifecycle state
  priority: TaskPriority;        // 'low' | 'normal' | 'high' | 'urgent'
  constraints: TaskConstraints;  // Execution limits
  progress: TaskProgress[];      // Progress updates
  result?: TaskResult;           // Final result
  pendingQuestion?: string;      // Current question
  retryCount: number;            // Retry attempts
  createdAt: string;             // ISO timestamp
  startedAt?: string;            // When execution began
  completedAt?: string;          // When finished
  sessionId: string;             // Parent session
}

// TaskStatus - Lifecycle states
type TaskStatus =
  | 'pending'        // Created, waiting to start
  | 'running'        // Harness executing
  | 'waiting_input'  // Waiting for user response
  | 'completed'      // Successfully finished
  | 'failed'         // Error occurred
  | 'cancelled';     // User cancelled

// Workspace
interface Workspace {
  id: string;                    // Directory name
  name: string;                  // Display name
  path: string;                  // Absolute path
  type: ProjectType;             // 'node' | 'python' | 'rust' | etc
  gitBranch?: string;            // Current branch
  gitStatus?: GitStatus;         // Dirty/clean status
  lastAccessed?: string;         // Last activity
}

// Session
interface Session {
  id: string;                    // Session ID
  userId: string;                // WhatsApp JID
  messages: Message[];           // Conversation history
  currentProject: ProjectContext | null;
  availableProjects: string[];
  activeFiles: string[];
  preferences: UserPreferences;
  currentTask: AgentTask | null;
  gitStartCommit: string | null;
  createdAt: string;
  lastActivityAt: string;
}

// HarnessResult
interface HarnessResult {
  success: boolean;              // Execution succeeded
  output: string;                // Full output
  exitCode: number;              // Process exit code
  error?: string;                // Error message if failed
  durationMs: number;            // Execution time
}
```

### 12.5 Error Handling & Codes

| Code | Name | Description | Recovery |
|------|------|-------------|----------|
| 400 | BAD_REQUEST | Invalid input parameters | Validate input, retry |
| 401 | UNAUTHORIZED | Not on whitelist | Check OWNER_PHONE_NUMBER |
| 404 | NOT_FOUND | Workspace/task not found | Check ID exists |
| 408 | TIMEOUT | Task exceeded timeout | Increase timeout or simplify |
| 409 | CONFLICT | Task already running | Wait or cancel existing |
| 429 | RATE_LIMITED | Too many requests | Wait and retry |
| 500 | INTERNAL_ERROR | Server error | Check logs, retry |
| 503 | SERVICE_UNAVAILABLE | Harness unavailable | Check container health |

### 12.6 Diagrams to Create/Update

1. **System Architecture** - Update with V2 orchestrator
2. **Task Lifecycle** - State machine diagram
3. **Intent Classification** - Decision flow
4. **Harness Execution** - Sequence diagram
5. **Error Recovery** - Retry flow

### 12.7 End-to-End Flow Example

```
1. User sends: "@fetch add dark mode toggle"

2. Intent Classification:
   - Pattern: contains "add", "create", "build"
   - Result: TASK intent

3. Tool Selection:
   - workspace_status → verify workspace selected
   - task_create → create task with goal

4. Task Execution:
   - TaskIntegration.executeTask()
   - HarnessExecutor.execute('claude', goal, workspace)
   - Stream progress to user

5. Completion:
   - Parse harness output
   - task_complete with result
   - Send summary to user
```

---

## 13. Error Recovery & Rate Limiting

### 13.1 Runaway Prevention

To prevent runaway responses on errors:

```typescript
// Max consecutive errors before backing off
const MAX_CONSECUTIVE_ERRORS = 3;

// Exponential backoff on repeated errors
const ERROR_BACKOFF_MS = [1000, 5000, 30000];

// Circuit breaker states
type CircuitState = 'closed' | 'open' | 'half-open';
```

### 13.2 Error Response Handling

| Error Type | Action | Max Retries |
|------------|--------|-------------|
| 400 Bad Request | Log, don't retry | 0 |
| 401 Unauthorized | Log, block session | 0 |
| 404 Not Found | Log, inform user | 0 |
| 408 Timeout | Retry with backoff | 2 |
| 429 Rate Limited | Wait, then retry | 3 |
| 500+ Server Error | Retry with backoff | 3 |
| Network Error | Retry with backoff | 3 |

### 13.3 Implementation

```typescript
// In agent/core-v2.ts
const errorTracker = new Map<string, number>();

function handleError(sessionId: string, error: Error): boolean {
  const count = (errorTracker.get(sessionId) ?? 0) + 1;
  errorTracker.set(sessionId, count);
  
  if (count >= MAX_CONSECUTIVE_ERRORS) {
    logger.warn(`Circuit breaker triggered for ${sessionId}`);
    return false; // Stop processing
  }
  
  return true; // Allow retry
}

function resetErrorCount(sessionId: string): void {
  errorTracker.delete(sessionId);
}
```

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Fetch** | The orchestration agent (this system) |
| **Harness** | Wrapper around a coding CLI (Claude/Gemini/Copilot) |
| **Task** | A unit of work to be delegated to a harness |
| **Workspace** | A git repository in /workspace |
| **Intent** | Classified user message type |
| **Kennel** | Container running the harnesses |
| **Bridge** | Container running Fetch + WhatsApp |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-03 | Fetch Team | Initial draft |
| 1.1 | 2026-02-03 | Fetch Team | Added documentation plan, API specs, error handling |

---

*End of Document*
