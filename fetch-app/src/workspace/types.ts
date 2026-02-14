/**
 * @fileoverview Workspace domain model types.
 *
 * Shared contracts for workspace metadata, git status, events, and profiles.
 *
 * @module workspace/types
 */

// ============================================================================
// ID Types
// ============================================================================

/** Workspace identifier (directory name under `/workspace`). */
export type WorkspaceId = string;

// ============================================================================
// Enums (as union types)
// ============================================================================

/** Supported project-type classifications used across workspace services. */
export type ProjectType = 'node' | 'typescript' | 'python' | 'rust' | 'go' | 'java' | 'ruby' | 'php' | 'dotnet' | 'unknown';

// ============================================================================
// Git Types
// ============================================================================

/** Snapshot of git state for one workspace. */
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

// ============================================================================
// Main Workspace Entity
// ============================================================================

/** Full workspace record cached and returned by `WorkspaceManager`. */
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

  /** Rich project profile with framework, package manager, etc. */
  profile?: ProjectProfile;
}

// ============================================================================
// Project Profile
// ============================================================================

/** Enriched project metadata used for prompt/context quality. */
export interface ProjectProfile {
  /** Primary detected project type */
  type: ProjectType;
  /** Human-readable primary language */
  language: string;
  /** Detected framework (e.g., 'nextjs', 'express', 'fastapi', 'django', 'rails') */
  framework?: string;
  /** Detected package manager (e.g., 'npm', 'yarn', 'pnpm', 'pip', 'poetry', 'cargo') */
  packageManager?: string;
  /** Detected test runner (e.g., 'vitest', 'jest', 'pytest', 'go test', 'cargo test') */
  testRunner?: string;
  /** Detected entry points */
  entryPoints: string[];
  /** Project description from manifest file */
  description?: string;
  /** Build command if detected */
  buildCommand?: string;
  /** Test command if detected */
  testCommand?: string;
}

// ============================================================================
// Workspace List Types
// ============================================================================

/** Lightweight workspace summary for list responses. */
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

/** Result envelope for workspace list operations. */
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

/** Workspace event names emitted by `WorkspaceManager`. */
export type WorkspaceEventType =
  | 'workspace:selected'
  | 'workspace:created'
  | 'workspace:deleted'
  | 'workspace:updated'
  | 'workspace:scaffolding'
  | 'workspace:synced';

/** Event payload emitted from workspace lifecycle actions. */
export interface WorkspaceEvent {
  type: WorkspaceEventType;
  workspaceId: WorkspaceId;
  timestamp: string;
  data?: unknown;
}
