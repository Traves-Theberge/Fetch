---
name: Workspace Operations
description: Workspace lifecycle, file deletion, and repository sync/publish workflows.
triggers:
  - workspace
  - project
  - create project
  - switch project
  - publish project
  - sync repo
  - delete file
  - delete folder
  - delete workspace
---

# Workspace Operations Skill

Use this skill for project setup, selection, cleanup, and repository sync.

## Instructions

When the user asks what projects exist:
1. Call `workspace_list`.
2. If needed, call `workspace_status` for the active project.

When the user asks to start a new project:
1. Call `workspace_create` with `name` and appropriate `template`.
2. Call `workspace_select` for the new workspace.
3. Call `workspace_status` and report branch/dirty state.

When the user asks to switch projects:
1. Call `workspace_select` with the requested workspace name.
2. Call `workspace_status` to confirm the current state.

When the user asks to publish or sync:
1. Call `workspace_status` first.
2. If repository does not exist remotely, call `workspace_publish`.
3. Otherwise call `workspace_sync`.

When the user asks to delete files/folders/workspaces:
1. Call `ask_user` to confirm destructive intent if it is not explicit.
2. Call exactly one of `file_delete`, `folder_delete`, or `workspace_delete` with `confirm: true`.
3. Report what was removed and what remains.

## Tool Reference

- `workspace_list`
- `workspace_select`
- `workspace_status`
- `workspace_create`
- `workspace_publish`
- `workspace_sync`
- `file_delete`
- `folder_delete`
- `workspace_delete`
- `ask_user`
