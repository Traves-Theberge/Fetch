---
name: GitHub Operations
description: Pull request, issue, branch, Actions, and repository search workflows.
triggers:
  - pull request
  - pr
  - github
  - issue
  - branch
  - actions
  - ci status
  - search repos
---

# GitHub Operations Skill

Use this skill for GitHub workflows tied to the current workspace.

## Instructions

Before write operations:
1. Call `workspace_status` to confirm branch and working tree state.
2. If needed, use `workspace_sync` so remote state includes local commits.

For pull requests:
1. Use `github_pr_create` to open a PR with clear title/body/base.
2. Use `github_pr_list` to list open/closed PRs.
3. Use `github_pr_view` for details on a specific PR.

For issues:
1. Use `github_issue_create` for new issues.
2. Use `github_issue_list` with filters (`state`, `assignee`, `labels`) when asked.

For branch and CI workflows:
1. Use `github_branch_create` for branch creation.
2. Use `github_action_status` to report workflow run results.

For discovery:
1. Use `github_search_repos` when user asks to find external repositories.

## Tool Reference

- `workspace_status`
- `workspace_sync`
- `github_pr_create`
- `github_pr_list`
- `github_pr_view`
- `github_issue_create`
- `github_issue_list`
- `github_branch_create`
- `github_action_status`
- `github_search_repos`
