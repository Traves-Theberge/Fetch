---
name: Git Operations
description: Advanced git workflow management and best practices.
triggers:
  - git
  - commit
  - push
  - branch
  - merge
  - rebase
requirements:
  binaries:
    - git
---

# Git Operations Skill

This skill provides expert knowledge on Git workflows.

## Standards

- **Commit Messages:** Conventional Commits (`type(scope): description`)
- **Branching:** Feature branches (`feat/name`), bugfix (`fix/name`)
- **Safety:** Never force push to main/master without explicit override.

## Workflows

### Creating a Feature
1. Update main: `git checkout main && git pull`
2. Create branch: `git checkout -b feat/my-feature`
3. Work...

### clean up
1. Squash commits if history is messy (interactive rebase)
2. Ensure message quality

## instructions
Always verify the current branch before operations.
If a merge conflict occurs, explain the conflict clearly and ask for guidance or attempt standard resolution if simple.
