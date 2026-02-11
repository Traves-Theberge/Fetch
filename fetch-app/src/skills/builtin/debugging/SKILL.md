---
name: Debugging
description: Structured bug diagnosis and resolution via harness delegation.
harnessHint: claude
triggers:
  - debug
  - error
  - broken
  - crash
  - why is this failing
  - not working
  - bug
---

# Debugging Skill

Guide Fetch to systematically diagnose and resolve bugs.

## Instructions

When the user reports a bug or error:
1. Call `workspace_status` to check current project state, branch, and recent changes
2. Use `ask_user` if the error description is vague — get the specific error message, file, or behavior
3. Delegate to **Claude** via `task_create` with a structured debugging goal:
   - Include the exact error message
   - Include the file path if known
   - Include: "Follow this process: 1) Read the failing code, 2) Add logging if needed, 3) Identify root cause, 4) Fix and verify"

When the user shares a stack trace:
1. Include the full stack trace in the `task_create` goal
2. Add: "Look for the first line within our codebase in the stack trace. Start investigation there."

When a task fails:
1. Call `task_status` to get the failure output
2. Analyze the error type:
   - **Syntax/type error** → delegate fix to **Gemini** (fast, focused)
   - **Logic error / wrong behavior** → delegate to **Claude** (needs reasoning)
   - **Environment/config error** → check with `workspace_status`, may need Docker or env fix
3. If the same error recurs 3+ times, use `ask_user` to escalate: "This keeps failing. Here's the pattern — want to try a different approach?"

When debugging Docker or infrastructure issues:
1. Use `task_create` to run diagnostic commands: `docker logs fetch-bridge`, `docker compose ps`
2. Check if the issue is in Bridge (Node.js) vs Kennel (sandbox) vs SearXNG (search)

## Debugging Process

1. **Isolate** — Reproduce the issue with minimal context
2. **Observe** — Check logs, state, and recent changes
3. **Hypothesize** — What changed? What's the root cause?
4. **Fix** — Delegate the fix to the appropriate harness
5. **Verify** — Run tests or manual verification after the fix

## Harness Routing

- Logic bugs, complex debugging → **Claude** (deep reasoning, broad context)
- Syntax errors, quick fixes → **Gemini** (fast, focused)
- Git/GitHub related issues → **Copilot** (GitHub integration)

## Tool Reference

- `workspace_status` — Check project state, recent changes, branch info
- `task_status` — Get failure output from a completed/failed task
- `task_create` — Delegate debugging and fix to a harness
- `ask_user` — Clarify vague bug reports or escalate repeated failures
- `report_progress` — Send interim findings during complex debugging
- `web_search` — Look up error messages or known issues
