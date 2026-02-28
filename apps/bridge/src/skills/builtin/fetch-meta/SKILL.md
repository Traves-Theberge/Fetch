---
name: Fetch Meta
description: Self-reporting for capabilities, active state, and operational limits.
triggers:
  - what can you do
  - system status
  - capabilities
  - help me
  - your tools
  - who are you
---

# Fetch Meta Skill

Use this skill when the user asks what Fetch can do, what is active right now, or where settings live.

## Instructions

When asked about capabilities:
1. Describe tool categories and what each category does.
2. Mention harness delegation through `task_create` (claude, gemini, copilot, opencode, codex).
3. Keep the response short and factual.

When asked about current status:
1. Call `workspace_list` to report available and active workspaces.
2. Call `workspace_status` when an active workspace exists.
3. Call `task_status` to report running/waiting/completed task state.
4. If available, include branch and dirty state from workspace status.

When asked where behavior is configured:
1. Explain that runtime and pipeline values come from `FETCH_*` environment variables.
2. Explain identity files are in `data/identity/` and skills are in `data/skills/`.
3. Ask a clarifying question with `ask_user` if the requested change is ambiguous.

## Tool Reference

- `workspace_list` - List workspaces and active selection.
- `workspace_status` - Show git/project state for the active workspace.
- `task_status` - Show status for the current or specified task.
- `ask_user` - Clarify unclear config or preference requests.
