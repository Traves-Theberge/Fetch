/**
 * @fileoverview Workspace tools
 *
 * Tool handlers for workspace operations.
 *
 * @module tools/workspace
 * @see {@link WorkspaceManager} - Workspace operations
 * @see {@link WorkspaceListInputSchema} - Input validation
 *
 * ## Tools
 *
 * - `workspace_list` - List available workspaces
 * - `workspace_select` - Select active workspace
 * - `workspace_status` - Get workspace status
 * - `workspace_create` - Create a new workspace
 * - `workspace_delete` - Delete a workspace
 * - `workspace_sync` - Sync workspace to GitHub
 */

import { workspaceManager } from '../workspace/manager.js';
import {
  WorkspaceListInputSchema,
  WorkspaceSelectInputSchema,
  WorkspaceStatusInputSchema,
  WorkspaceCreateInputSchema,
  WorkspaceDeleteInputSchema,
  WorkspaceSyncInputSchema,
  type WorkspaceSelectInput,
  type WorkspaceStatusInput,
  type WorkspaceCreateInput,
  type WorkspaceDeleteInput,
  type WorkspaceSyncInput,
} from '../validation/tools.js';
import type { ToolResult } from './types.js';

// ============================================================================
// workspace_list
// ============================================================================

/**
 * List available workspaces
 *
 * Returns all workspaces mounted in the Kennel container with
 * basic information about each (name, type, git branch, dirty status).
 *
 * @param input - Tool input (empty object)
 * @returns List of workspace summaries
 *
 * @example
 * ```typescript
 * const result = await handleWorkspaceList({});
 * // Returns: { success: true, output: JSON with workspaces }
 * ```
 */
export async function handleWorkspaceList(
  input: unknown
): Promise<ToolResult> {
  const start = Date.now();

  // Validate input (empty object expected)
  const parseResult = WorkspaceListInputSchema.safeParse(input ?? {});
  if (!parseResult.success) {
    return {
      success: false,
      output: '',
      error: `Invalid input: ${parseResult.error.message}`,
      duration: Date.now() - start,
    };
  }

  try {
    const result = await workspaceManager.listWorkspaces();

    return {
      success: true,
      output: JSON.stringify({
        workspaces: result.workspaces,
        activeWorkspace: result.activeWorkspace,
        count: result.count,
      }, null, 2),
      duration: Date.now() - start,
      metadata: {
        count: result.count,
        activeWorkspace: result.activeWorkspace,
      },
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// workspace_select
// ============================================================================

/**
 * Select a workspace as active
 *
 * Sets the specified workspace as the active workspace. The active
 * workspace is used by default for task creation and status queries.
 *
 * @param input - Tool input with workspace name
 * @returns Selected workspace details
 *
 * @example
 * ```typescript
 * const result = await handleWorkspaceSelect({ name: 'my-project' });
 * // Returns: { success: true, output: JSON with workspace }
 * ```
 */
export async function handleWorkspaceSelect(
  input: unknown
): Promise<ToolResult> {
  const start = Date.now();

  // Validate input
  const parseResult = WorkspaceSelectInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      output: '',
      error: `Invalid input: ${parseResult.error.message}`,
      duration: Date.now() - start,
    };
  }

  // Schema uses 'name' field
  const { name } = parseResult.data as WorkspaceSelectInput;

  try {
    const selected = await workspaceManager.selectWorkspace(name);

    const workspaceData = {
      id: selected.id,
      name: selected.name,
      path: selected.path,
      projectType: selected.projectType,
      description: selected.description,
      isActive: selected.isActive,
      git: selected.git ? {
        branch: selected.git.branch,
        dirty: selected.git.dirty,
        ahead: selected.git.ahead,
        behind: selected.git.behind,
      } : undefined,
    };

    return {
      success: true,
      output: JSON.stringify(workspaceData, null, 2),
      duration: Date.now() - start,
      metadata: {
        workspace: selected.name,
        projectType: selected.projectType,
      },
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// workspace_status
// ============================================================================

/**
 * Get workspace status
 *
 * Returns detailed status for a workspace including full git status
 * with modified files, staged files, and untracked files.
 *
 * @param input - Tool input (optional workspace name, uses active if not provided)
 * @returns Detailed workspace status
 *
 * @example
 * ```typescript
 * // Get active workspace status
 * const result = await handleWorkspaceStatus({});
 *
 * // Get specific workspace status
 * const result = await handleWorkspaceStatus({ name: 'other-project' });
 * ```
 */
export async function handleWorkspaceStatus(
  input: unknown
): Promise<ToolResult> {
  const start = Date.now();

  // Validate input
  const parseResult = WorkspaceStatusInputSchema.safeParse(input ?? {});
  if (!parseResult.success) {
    return {
      success: false,
      output: '',
      error: `Invalid input: ${parseResult.error.message}`,
      duration: Date.now() - start,
    };
  }

  // Schema uses 'name' field (optional)
  const { name } = parseResult.data as WorkspaceStatusInput;

  // If no workspace specified, use active
  const workspaceId = name ?? workspaceManager.getActiveWorkspaceId();

  if (!workspaceId) {
    return {
      success: false,
      output: '',
      error: 'No workspace specified and no active workspace selected',
      duration: Date.now() - start,
    };
  }

  try {
    const status = await workspaceManager.getWorkspaceStatus(workspaceId);

    if (!status) {
      return {
        success: false,
        output: '',
        error: `Workspace not found: ${workspaceId}`,
        duration: Date.now() - start,
      };
    }

    const workspaceData = {
      id: status.id,
      name: status.name,
      path: status.path,
      projectType: status.projectType,
      description: status.description,
      isActive: status.isActive,
      lastAccessedAt: status.lastAccessedAt,
      git: status.git ? {
        branch: status.git.branch,
        dirty: status.git.dirty,
        ahead: status.git.ahead,
        behind: status.git.behind,
        modifiedFiles: status.git.modifiedFiles,
        stagedFiles: status.git.stagedFiles,
        untrackedFiles: status.git.untrackedFiles,
        remoteUrl: status.git.remoteUrl,
        lastCommit: status.git.lastCommit,
        lastCommitMessage: status.git.lastCommitMessage,
      } : undefined,
    };

    return {
      success: true,
      output: JSON.stringify(workspaceData, null, 2),
      duration: Date.now() - start,
      metadata: {
        workspace: status.name,
        projectType: status.projectType,
        dirty: status.git?.dirty,
      },
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// workspace_create
// ============================================================================

/**
 * Create a new workspace/project
 *
 * Creates a new project directory with optional template scaffolding.
 * Can initialize git and set up basic project structure.
 *
 * @param input - Tool input with name, template, and options
 * @returns Created workspace details
 *
 * @example
 * ```typescript
 * const result = await handleWorkspaceCreate({
 *   name: 'my-new-project',
 *   template: 'node',
 *   initGit: true
 * });
 * ```
 */
export async function handleWorkspaceCreate(
  input: unknown
): Promise<ToolResult> {
  const start = Date.now();

  // Validate input
  const parseResult = WorkspaceCreateInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      output: '',
      error: `Invalid input: ${parseResult.error.message}`,
      duration: Date.now() - start,
    };
  }

  const { name, template, description, initGit } = parseResult.data as WorkspaceCreateInput;

  try {
    const workspace = await workspaceManager.createWorkspace({
      name,
      template: template ?? 'empty',
      description,
      initGit: initGit ?? true,
    });

    const workspaceData = {
      id: workspace.id,
      name: workspace.name,
      path: workspace.path,
      projectType: workspace.projectType,
      description: workspace.description,
      isActive: workspace.isActive,
      git: workspace.git ? {
        branch: workspace.git.branch,
        initialized: true,
      } : undefined,
      message: `Created workspace "${name}" with template "${template ?? 'empty'}"`,
    };

    return {
      success: true,
      output: JSON.stringify(workspaceData, null, 2),
      duration: Date.now() - start,
      metadata: {
        workspace: workspace.name,
        template: template ?? 'empty',
      },
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// workspace_delete
// ============================================================================

/**
 * Delete a workspace
 *
 * Permanently deletes a workspace directory. Requires explicit confirmation.
 * Cannot delete the currently active workspace.
 *
 * @param input - Tool input with workspace name and confirmation
 * @returns Deletion result
 *
 * @example
 * ```typescript
 * const result = await handleWorkspaceDelete({
 *   name: 'old-project',
 *   confirm: true
 * });
 * ```
 */
export async function handleWorkspaceDelete(
  input: unknown
): Promise<ToolResult> {
  const start = Date.now();

  // Validate input
  const parseResult = WorkspaceDeleteInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      output: '',
      error: `Invalid input: ${parseResult.error.message}`,
      duration: Date.now() - start,
    };
  }

  const { name, confirm } = parseResult.data as WorkspaceDeleteInput;

  // Extra safety check
  if (!confirm) {
    return {
      success: false,
      output: '',
      error: 'Deletion requires explicit confirmation. Set confirm: true to proceed.',
      duration: Date.now() - start,
    };
  }

  // Check if it's the active workspace
  const activeId = workspaceManager.getActiveWorkspaceId();
  if (activeId === name) {
    return {
      success: false,
      output: '',
      error: 'Cannot delete the active workspace. Select a different workspace first.',
      duration: Date.now() - start,
    };
  }

  try {
    await workspaceManager.deleteWorkspace(name);

    return {
      success: true,
      output: JSON.stringify({
        deleted: name,
        message: `Workspace "${name}" has been permanently deleted`,
      }, null, 2),
      duration: Date.now() - start,
      metadata: {
        workspace: name,
        deleted: true,
      },
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// workspace_sync
// ============================================================================

/**
 * Sync workspace to GitHub
 *
 * Stages all changes, commits with optional message, creates a GitHub
 * repo if none exists, and pushes. This is the "save my work" tool —
 * the LLM should call this when the user says things like:
 * - "push my code"
 * - "sync to GitHub"
 * - "save this project"
 * - "back this up"
 *
 * @param input - Tool input with optional workspace name and commit message
 * @returns Sync result with commit hash, remote URL, and push status
 */
export async function handleWorkspaceSync(
  input: unknown
): Promise<ToolResult> {
  const start = Date.now();

  // Validate input
  const parseResult = WorkspaceSyncInputSchema.safeParse(input ?? {});
  if (!parseResult.success) {
    return {
      success: false,
      output: '',
      error: `Invalid input: ${parseResult.error.message}`,
      duration: Date.now() - start,
    };
  }

  const { name, message } = parseResult.data as WorkspaceSyncInput;

  // Use active workspace if not specified
  const workspaceId = name ?? workspaceManager.getActiveWorkspaceId();

  if (!workspaceId) {
    return {
      success: false,
      output: '',
      error: 'No workspace specified and no active workspace selected',
      duration: Date.now() - start,
    };
  }

  try {
    const result = await workspaceManager.syncWorkspace(workspaceId, message);

    if (!result.success) {
      return {
        success: false,
        output: '',
        error: result.error || 'Sync failed',
        duration: Date.now() - start,
      };
    }

    const syncData = {
      workspace: workspaceId,
      commitHash: result.commitHash,
      commitMessage: result.commitMessage,
      filesChanged: result.filesChanged,
      remoteUrl: result.remoteUrl,
      pushed: result.pushed,
      repoCreated: result.repoCreated,
      message: result.repoCreated
        ? `Created GitHub repo and pushed ${result.filesChanged} file(s)`
        : result.pushed
          ? `Pushed changes to GitHub`
          : result.filesChanged > 0
            ? `Committed ${result.filesChanged} change(s) locally (no remote configured)`
            : 'Everything is up to date with GitHub',
    };

    return {
      success: true,
      output: JSON.stringify(syncData, null, 2),
      duration: Date.now() - start,
      metadata: {
        workspace: workspaceId,
        pushed: result.pushed,
        repoCreated: result.repoCreated,
        filesChanged: result.filesChanged,
      },
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// workspace_publish
// ============================================================================

import {
  WorkspacePublishInputSchema,
  type WorkspacePublishInput,
} from '../validation/tools.js';

/**
 * Publish workspace to GitHub
 *
 * Creates a new GitHub repository from the current workspace and pushes
 * all local commits. Unlike workspace_sync, this explicitly creates a new
 * repo even if there are no uncommitted changes.
 *
 * @param input - Tool input with optional workspace name, description, and visibility
 * @returns Publish result with new repo URL
 *
 * @example
 * ```typescript
 * const result = await handleWorkspacePublish({ description: 'My new project' });
 * // Returns: { success: true, output: JSON with new repo URL }
 * ```
 */
export async function handleWorkspacePublish(
  input: unknown
): Promise<ToolResult> {
  const start = Date.now();

  // Validate input
  const parseResult = WorkspacePublishInputSchema.safeParse(input ?? {});
  if (!parseResult.success) {
    return {
      success: false,
      output: '',
      error: `Invalid input: ${parseResult.error.message}`,
      duration: Date.now() - start,
    };
  }

  const { name, description, isPublic } = parseResult.data as WorkspacePublishInput;

  // Use active workspace if not specified
  const workspaceId = name ?? workspaceManager.getActiveWorkspaceId();

  if (!workspaceId) {
    return {
      success: false,
      output: '',
      error: 'No workspace specified and no active workspace selected',
      duration: Date.now() - start,
    };
  }

  try {
    // Verify workspace exists
    const workspace = await workspaceManager.getWorkspace(workspaceId);
    if (!workspace) {
      return {
        success: false,
        output: '',
        error: `Workspace not found: ${workspaceId}`,
        duration: Date.now() - start,
      };
    }

    // Check if already has a remote
    const status = await workspaceManager.getWorkspaceStatus(workspaceId);
    if (status?.git?.remoteUrl) {
      return {
        success: false,
        output: '',
        error: `Workspace already has a remote: ${status.git.remoteUrl}. Use workspace_sync to push changes.`,
        duration: Date.now() - start,
      };
    }

    // Create GitHub repo
    const repoUrl = await workspaceManager.publishToGitHub(
      workspaceId,
      description,
      isPublic ?? false
    );

    if (!repoUrl) {
      return {
        success: false,
        output: '',
        error: 'Failed to create GitHub repository. Check that gh CLI is authenticated.',
        duration: Date.now() - start,
      };
    }

    return {
      success: true,
      output: JSON.stringify({
        workspace: workspaceId,
        repoUrl,
        visibility: isPublic ? 'public' : 'private',
        message: `Created GitHub repo: ${repoUrl}`,
      }, null, 2),
      duration: Date.now() - start,
      metadata: {
        workspace: workspaceId,
        repoUrl,
        isPublic: isPublic ?? false,
      },
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// Tool Registry Integration
// ============================================================================

/**
 * Workspace tool definitions for registry
 */
export const workspaceTools = {
  workspace_list: {
    name: 'workspace_list',
    description: 'List all available workspaces. Returns project directories with basic info (name, type, git branch, status).',
    handler: handleWorkspaceList,
    schema: WorkspaceListInputSchema,
  },
  workspace_select: {
    name: 'workspace_select',
    description: 'Select a workspace as active. The active workspace is used by default for new tasks.',
    handler: handleWorkspaceSelect,
    schema: WorkspaceSelectInputSchema,
  },
  workspace_status: {
    name: 'workspace_status',
    description: 'Get detailed workspace status including git info (modified files, staged files, branch, commits).',
    handler: handleWorkspaceStatus,
    schema: WorkspaceStatusInputSchema,
  },
  workspace_create: {
    name: 'workspace_create',
    description: 'Create a new workspace/project. Only the "name" parameter is required. Optionally specify template (node/python/rust/go/react/next) and description.',
    handler: handleWorkspaceCreate,
    schema: WorkspaceCreateInputSchema,
  },
  workspace_delete: {
    name: 'workspace_delete',
    description: 'Delete a workspace permanently. IMPORTANT: Always call ask_user FIRST to confirm with the user, then call this tool with confirm: true in a single call. Never simulate a two-step confirmation — the user confirms via ask_user, then you call this with confirm: true immediately.',
    handler: handleWorkspaceDelete,
    schema: WorkspaceDeleteInputSchema,
  },
  workspace_sync: {
    name: 'workspace_sync',
    description: 'Sync workspace to GitHub. Stages changes, commits (auto-generates message if not provided), creates a private GitHub repo if none exists, and pushes. Use when user says "push my code", "sync to GitHub", "save this", or "back this up".',
    handler: handleWorkspaceSync,
    schema: WorkspaceSyncInputSchema,
  },
  workspace_publish: {
    name: 'workspace_publish',
    description: 'Create a new GitHub repository from an existing local workspace. Use when user says "publish to GitHub", "create a new repo", "put this on GitHub". Unlike workspace_sync, this is for creating new repos from existing local projects that don\'t have a remote yet.',
    handler: handleWorkspacePublish,
    schema: WorkspacePublishInputSchema,
  },
} as const;
