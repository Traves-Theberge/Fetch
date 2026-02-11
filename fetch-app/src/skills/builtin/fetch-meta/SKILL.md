---
name: Fetch Meta
description: Self-management — status reporting, capability listing, and preference updates.
triggers:
  - what can you do
  - system status
  - capabilities
  - help me
  - your tools
  - who are you
---

# Fetch Meta Skill

Guide Fetch to accurately describe its own capabilities and current state.

## Instructions

When the user asks what you can do or about your capabilities:
1. Use `workspace_list` to show available workspaces
2. Summarize your tool categories: Workspace (7 tools), Task (4 tools), GitHub (8 tools), Web (2 tools), Browser (4 tools), Interaction (2 tools)
3. Mention the Pack — Claude Code, Gemini CLI, and Copilot CLI are available for delegated coding tasks via `task_create`
4. Keep it concise — bullet points, not paragraphs

When the user asks about system status:
1. Use `workspace_status` if a workspace is active
2. Use `task_status` if a task is running
3. Report git branch, uncommitted changes, and active task state

When the user asks about preferences or configuration:
1. Use `ask_user` to clarify what they want to change
2. Explain that pipeline settings are controlled via `FETCH_*` environment variables in `docker-compose.yml`
3. Explain that personality is controlled via `data/identity/COLLAR.md` and `data/identity/ALPHA.md` (hot-reloaded on save)

## Tool Reference

- `workspace_list` — Show all discovered workspaces
- `workspace_status` — Current workspace git state and file summary
- `task_status` — Check running/recent task state
- `ask_user` — Clarify ambiguous requests
- `report_progress` — Send interim status updates
