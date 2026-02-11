---
name: Git Operations
description: Git workflow orchestration — commits, branches, syncing, and GitHub integration.
harnessHint: copilot
triggers:
  - git
  - commit
  - push
  - branch
  - merge
  - rebase
  - pull request
  - PR
requirements:
  binaries:
    - git
---

# Git Operations Skill

Guide Fetch to orchestrate git workflows using its workspace and GitHub tools.

## Instructions

**Before any git operation**, always call `workspace_status` to check current branch, uncommitted changes, and sync state.

When the user asks to commit or push:
1. Call `workspace_status` to verify there are uncommitted changes
2. Delegate to a harness via `task_create` with a clear goal: "Commit changes with message: ..."
3. After the task completes, call `workspace_sync` to push to the remote

When the user asks to create a branch:
1. Use `github_branch_create` with the branch name
2. Report the result

When the user asks about pull requests:
1. Use `github_pr_list` to show open PRs
2. Use `github_pr_view` for details on a specific PR
3. Use `github_pr_create` to open a new PR (requires title, body, and branch)

When the user asks to sync or pull:
1. Use `workspace_sync` — this handles git pull/push for the active workspace

## Standards

- **Commit messages:** Conventional Commits format — `type(scope): description`
- **Branching:** Feature branches (`feat/name`), bugfix (`fix/name`)
- **Safety:** Never force push to main/master without explicit user confirmation. Use `ask_user` if a destructive git operation is requested.

## Harness Routing

- Simple commits/pushes → **Gemini** (fast, low complexity)
- Complex merges, rebases, conflict resolution → **Claude** (needs reasoning)
- GitHub-specific operations (PRs, issues, actions) → **Copilot** (GitHub integration)

## Tool Reference

- `workspace_status` — Check branch, uncommitted changes, sync state
- `workspace_sync` — Pull/push the active workspace
- `github_branch_create` — Create a new branch
- `github_pr_create` / `github_pr_list` / `github_pr_view` — PR management
- `github_issue_create` / `github_issue_list` — Issue management
- `github_action_status` — Check CI/CD pipeline status
- `task_create` — Delegate complex git operations to a harness
