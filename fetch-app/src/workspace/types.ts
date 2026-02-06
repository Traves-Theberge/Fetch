/**
 * @fileoverview Workspace domain types and interfaces
 *
 * Defines all types related to workspace management in Fetch v2.
 * Workspaces are project directories mounted into the Kennel container.
 *
 * @module workspace/types
 * @see {@link WorkspaceManager} - Workspace operations
 */

// ============================================================================
// ID Types
// ============================================================================

/**
 * Workspace identifier
 *
 * This is the directory name of the workspace, not a generated ID.
 *
 * @example
 * ```typescript
 * const workspaceId: WorkspaceId = 'my-react-app';
 * ```
 */
export type WorkspaceId = string;

// ============================================================================
// Enums (as union types)
// ============================================================================

/**
 * Detected project type
 *
 * | Type | Detection Method |
 * |------|------------------|
 * | node | package.json exists |
 * | python | requirements.txt, pyproject.toml, or setup.py |
 * | rust | Cargo.toml exists |
 * | go | go.mod exists |
 * | unknown | None of the above |
 */
export type ProjectType = 'node' | 'python' | 'rust' | 'go' | 'unknown';

// ============================================================================
// Git Types
// ============================================================================

/**
 * Git repository status
 *
 * Provides information about the current state of a git repository.
 */
export interface GitStatus {
  /** Current branch name */
  branch: string;

  /** Whether there are uncommitted changes */
  dirty: boolean;

  /** Number of commits ahead of remote */
  ahead: number;

  /** Number of commits behind remote */
  behind: number;

  /** List of modified (not staged) files */
  modifiedFiles: string[];

  /** List of staged files */
  stagedFiles: string[];

  /** List of untracked files */
  untrackedFiles: string[];

  /** Remote URL (if configured) */
  remoteUrl?: string;

  /** Last commit hash (short) */
  lastCommit?: string;

  /** Last commit message */
  lastCommitMessage?: string;
}

/**
 * Default git status (for non-git directories)
 */
export const DEFAULT_GIT_STATUS: GitStatus = {
  branch: '',
  dirty: false,
  ahead: 0,
  behind: 0,
  modifiedFiles: [],
  stagedFiles: [],
  untrackedFiles: [],
};

// ============================================================================
// Main Workspace Entity
// ============================================================================

/**
 * Workspace entity
 *
 * Represents a project directory available for task execution.
 *
 * @example
 * ```typescript
 * const workspace: Workspace = {
 *   id: 'my-react-app',
 *   name: 'My React App',
 *   path: '/workspace/my-react-app',
 *   projectType: 'node',
 *   git: {
 *     branch: 'main',
 *     dirty: true,
 *     ahead: 2,
 *     behind: 0,
 *     modifiedFiles: ['src/App.tsx'],
 *     stagedFiles: [],
 *     untrackedFiles: ['TODO.md']
 *   },
 *   isActive: true,
 *   lastAccessedAt: '2026-02-02T10:00:00.000Z'
 * };
 * ```
 */
export interface Workspace {
  /** Workspace identifier (directory name) */
  id: WorkspaceId;

  /** Display name (defaults to id) */
  name: string;

  /** Full path on filesystem (inside container) */
  path: string;

  /** Detected project type */
  projectType: ProjectType;

  /** Git repository status (if git repo) */
  git?: GitStatus;

  /** Whether this is the currently active workspace */
  isActive: boolean;

  /** ISO timestamp of last access */
  lastAccessedAt?: string;

  /** Description from package.json, README, etc. */
  description?: string;

  /** Primary language (from project detection) */
  language?: string;
}

// ============================================================================
// Workspace List Types
// ============================================================================

/**
 * Workspace summary (for list display)
 *
 * Lighter-weight version of Workspace for listing.
 */
export interface WorkspaceSummary {
  /** Workspace identifier */
  id: WorkspaceId;

  /** Display name */
  name: string;

  /** Project type */
  projectType: ProjectType;

  /** Whether currently active */
  isActive: boolean;

  /** Git branch (if git repo) */
  branch?: string;

  /** Whether git repo is dirty */
  dirty?: boolean;
}

/**
 * Workspace list result
 */
export interface WorkspaceListResult {
  /** List of workspaces */
  workspaces: WorkspaceSummary[];

  /** Currently active workspace ID (if any) */
  activeWorkspace?: WorkspaceId;

  /** Total count */
  count: number;
}

// ============================================================================
// Workspace Events
// ============================================================================

/**
 * Workspace event types
 */
export type WorkspaceEventType =
  | 'workspace:selected'
  | 'workspace:created'
  | 'workspace:deleted'
  | 'workspace:updated'
  | 'workspace:scaffolding';

/**
 * Workspace event payload
 */
export interface WorkspaceEvent {
  type: WorkspaceEventType;
  workspaceId: WorkspaceId;
  timestamp: string;
  data?: unknown;
}
