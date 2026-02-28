---
name: Workflow Automation
description: Create, run, schedule, and manage deterministic workflow and cron automation.
triggers:
  - workflow
  - cron
  - schedule
  - recurring
  - nightly check
  - run tests nightly
  - automate
  - browser smoke test
---

# Workflow Automation Skill

Use this skill for reusable deterministic automation across workflow, cron, and runtime execution tools.

## Instructions

When creating workflows:
1. Prefer deterministic execution-layer tools in steps (`app_run`, `app_test`, `browser_test`, `workspace_status`, `workspace_sync`).
2. Use `workflow_create` with concise step names and explicit args.
3. Avoid open-ended delegation in workflow steps (`task_*`) unless the user explicitly requests it.

When running workflows:
1. Use `workflow_run` for immediate execution.
2. Summarize step-level pass/fail output clearly.
3. If a step fails, report the failed step and recommended next action.

When scheduling with cron:
1. Use `cron_create` with a 5-field UTC expression (`minute hour day month weekday`).
2. Explain UTC explicitly when user gives a local-time schedule.
3. Use `cron_list` to confirm active schedules and `cron_run` for immediate verification.

When cleaning up automation:
1. Use `workflow_list` to identify existing workflows/runs.
2. Use `workflow_delete` for obsolete workflows.
3. Use `cron_delete` to remove outdated schedules.

When user asks for direct deterministic checks:
1. Use `app_run` for explicit commands.
2. Use `app_test` for test execution (explicit command or auto-detected).
3. Use `browser_test` for URL + `mustInclude` assertions and optional screenshots.

## Tool Reference

- `workflow_create`
- `workflow_list`
- `workflow_run`
- `workflow_delete`
- `cron_create`
- `cron_list`
- `cron_delete`
- `cron_run`
- `app_run`
- `app_test`
- `browser_test`
- `workspace_status`
- `workspace_sync`
