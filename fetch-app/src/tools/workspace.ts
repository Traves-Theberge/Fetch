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
 */

import { workspaceManager } from '../workspace/manager.js';
import {
  WorkspaceListInputSchema,
  WorkspaceSelectInputSchema,
  WorkspaceStatusInputSchema,
  type WorkspaceSelectInput,
  type WorkspaceStatusInput,
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
// Tool Registry Integration
// ============================================================================

/**
 * Workspace tool definitions for registry
 */
export const workspaceTools = {
  workspace_list: {
    name: 'workspace_list',
    description: 'List available workspaces. Returns all project directories mounted in the development container with basic info (name, type, git branch, dirty status).',
    handler: handleWorkspaceList,
    schema: WorkspaceListInputSchema,
  },
  workspace_select: {
    name: 'workspace_select',
    description: 'Select a workspace as active. The active workspace is used by default for new tasks and status queries.',
    handler: handleWorkspaceSelect,
    schema: WorkspaceSelectInputSchema,
  },
  workspace_status: {
    name: 'workspace_status',
    description: 'Get detailed workspace status including full git information (modified files, staged files, untracked files, ahead/behind counts).',
    handler: handleWorkspaceStatus,
    schema: WorkspaceStatusInputSchema,
  },
} as const;
