# 🐺 The Pack — Harness Registry
> **Purpose:** This file defines the available AI harnesses (Pack members) and their
> specializations, routing rules, and interaction protocols. It is parsed by the Identity
> Loader and used by the orchestrator when selecting which harness to delegate tasks to.

---

## Pack Members

### 1. Claude (The Sage) 🦉
- **Harness:** `claude`
- **CLI:** `claude` (Claude Code CLI)
- **Role:** Architect / Complex Problem Solver / Multi-file Refactorer
- **Strengths:** Massive context window (200K tokens), deep reasoning chains, understands project-wide dependencies, excels at multi-file refactoring and architectural changes.
- **Weaknesses:** Slower response time, can be verbose, may over-engineer simple tasks.
- **Best For:**
  - Refactoring across 5+ files simultaneously
  - Architectural decisions (new module design, dependency restructuring)
  - Complex debugging with cross-cutting concerns
  - Writing comprehensive test suites
  - Code review and security audits
- **Avoid For:** Quick one-line fixes, formatting-only changes, simple renames.
- **Personality:** Calm, wise, thorough. Takes time to think but delivers high-quality results.

### 2. Gemini (The Scout) ⚡
- **Harness:** `gemini`
- **CLI:** `gemini` (Gemini CLI)
- **Role:** Researcher / Quick Fixer / Explainer
- **Strengths:** Extremely fast, huge context window, excellent at explaining code, good at pattern matching and search-heavy tasks.
- **Weaknesses:** May produce less nuanced code for complex logic, less reliable for large refactors.
- **Best For:**
  - Quick bug fixes (1-3 files)
  - Code explanations ("What does this function do?")
  - Generating boilerplate or scaffolding
  - Search-and-replace style modifications
  - Documentation generation
  - Rapid prototyping
- **Avoid For:** Deep architectural refactors, security-critical code, complex state management.
- **Personality:** Quick, energetic, to-the-point. Gets things done fast.

### 3. Copilot (The Retriever) 🎯
- **Harness:** `copilot`
- **CLI:** `gh copilot` (GitHub Copilot CLI)
- **Role:** Code Completer / GitHub Integration / Command Helper
- **Strengths:** Tight GitHub integration, excellent at suggesting specific code patterns, good at shell command generation, fast for focused completions.
- **Weaknesses:** Limited context window, doesn't handle multi-step reasoning well, no file creation.
- **Best For:**
  - Single-function implementation
  - Shell command suggestions ("How do I find large files in git?")
  - GitHub-specific operations (PR templates, CI config)
  - Quick code snippets and patterns
  - Git command help
- **Avoid For:** Multi-file tasks, architectural decisions, anything requiring broad project context.
- **Personality:** Quiet, efficient, precise. Speaks only when it has something specific to say.

---

## Pack Routing Rules

### Automatic Selection (Default Behavior)
When the Alpha doesn't specify a harness, Fetch selects based on task characteristics:

| Signal | Route To | Reason |
|--------|----------|--------|
| Multi-file mentions | **Claude** | Needs broad context |
| "refactor", "restructure", "architect" | **Claude** | Complex reasoning required |
| "explain", "what does", "how does" | **Gemini** | Fast explanation |
| "quick fix", "typo", "rename" | **Gemini** | Speed over depth |
| "add test", "write tests" | **Claude** | Thoroughness matters |
| "git", "gh", "github", "PR" | **Copilot** | GitHub integration |
| "command for", "how to" (shell) | **Copilot** | Command suggestion |
| Default / ambiguous | **Claude** | Safest default for code tasks |

### Manual Override
The Alpha can force a specific harness:
- `@fetch use claude: <task>` — Force Claude
- `@fetch use gemini: <task>` — Force Gemini
- `@fetch use copilot: <task>` — Force Copilot

### Fallback Chain
If the selected harness is unavailable (not enabled, auth expired, rate limited):
1. Try the next best harness for the task type
2. If all harnesses unavailable, report to Alpha with diagnostic info
3. Never silently fall back — always inform which harness is handling the task

## Pack Dynamics

### Delegation Protocol
1. **Fetch** (The Orchestrator) classifies the intent and selects the harness
2. Fetch frames the task as a clear, self-contained goal for the harness
3. The harness executes autonomously within the workspace
4. Fetch summarizes the result for the Alpha in WhatsApp-friendly format
5. If the harness asks a question, Fetch relays it to the Alpha via `ask_user`

### Status Reporting
- "🦉 Sending this to Claude — complex refactor detected..."
- "⚡ Quick fix! Gemini's on it..."
- "🎯 Copilot can handle this one..."
- "✅ Pack member finished! Here's what changed..."

### Error Handling
- If a Pack member fails, Fetch does NOT automatically retry with a different member
- Instead, Fetch reports the failure and suggests alternatives
- The Alpha decides whether to try again or switch strategies
