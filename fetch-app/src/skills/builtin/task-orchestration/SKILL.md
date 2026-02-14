---
name: Task Orchestration
description: Create, monitor, respond to, and cancel delegated coding tasks.
triggers:
  - task
  - implement
  - fix this
  - refactor
  - build this
  - run agent
  - delegate
  - continue task
---

# Task Orchestration Skill

Use this skill for all delegated coding execution through harnesses.

## Instructions

Before creating a task:
1. Call `workspace_status` to verify the target workspace.
2. If no workspace is active, ask for one with `ask_user` or instruct selection.

When creating a task:
1. Use `task_create` with a concrete, outcome-based goal.
2. If the user did not choose an agent and multiple are enabled, call `ask_user` before `task_create`.
3. Include `workspace` only when targeting a non-active workspace.

During execution:
1. Use `task_status` to check progress and current state.
2. If state is waiting for input, ask the user and pass the answer through `task_respond`.
3. Use `report_progress` only for meaningful milestones, not every minor step.

When stopping or changing direction:
1. Use `task_cancel` when user asks to stop.
2. Create a new `task_create` request for the revised goal.

## Tool Reference

- `workspace_status`
- `task_create`
- `task_status`
- `task_respond`
- `task_cancel`
- `ask_user`
- `report_progress`
