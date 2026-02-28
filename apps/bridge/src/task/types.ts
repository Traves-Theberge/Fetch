/**
 * @fileoverview Type contracts for task lifecycle, progress, and result data.
 *
 * @module task/types
 */

// ============================================================================
// ID Types
// ============================================================================

/** Task id format used across task manager, tools, and harness integration. */
export type TaskId = `tsk_${string}`;

// ============================================================================
// Enums (as union types)
// ============================================================================

/** Supported harness agent identifiers for delegated execution. */
export type AgentType = 'claude' | 'gemini' | 'copilot' | 'opencode' | 'codex';

/** Explicit agent choice or `auto` for runtime selection. */
export type AgentSelection = AgentType | 'auto';

/** Task lifecycle states used by `TaskManager` transition rules. */
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'waiting_input'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

/** Priority field retained for compatibility/future scheduling support. */
export type TaskPriority = 'low' | 'normal' | 'high';

// ============================================================================
// Constraint & Configuration Types
// ============================================================================

/** Execution constraints persisted with each task. */
export interface TaskConstraints {
  /**
   * Maximum execution time in milliseconds
   * @default 300000 (5 minutes)
   */
  timeoutMs: number;

  /**
   * Whether to require user approval before file writes
   * @default false (autonomous mode)
   */
  requireApproval: boolean;

  /**
   * Limit scope to specific files/directories (optional)
   * If set, harness should only modify files within these paths.
   */
  scopePaths?: string[];

  /**
   * Maximum number of retries on failure
   * @default 1
   */
  maxRetries: number;
}

// ============================================================================
// Progress & Result Types
// ============================================================================

/** One task progress entry emitted during execution. */
export interface TaskProgress {
  /** Progress entry ID */
  id: string;

  /** ISO timestamp when this update was emitted */
  timestamp: string;

  /** Human-readable progress message */
  message: string;

  /** Files currently being modified (if applicable) */
  files?: string[];

  /** Percentage complete (0-100), if determinable */
  percent?: number;
}

/** Normalized final result payload for completed/failed tasks. */
export interface TaskResult {
  /** Whether the task completed successfully */
  success: boolean;

  /** Human-readable summary of what was accomplished */
  summary: string;

  /** List of files that were modified */
  filesModified: string[];

  /** List of files that were created */
  filesCreated: string[];

  /** List of files that were deleted */
  filesDeleted: string[];

  /** Error message if the task failed */
  error?: string;

  /** Raw output from the harness (for debugging) */
  rawOutput: string;

  /** Exit code from the harness process */
  exitCode: number;
}

// ============================================================================
// Main Task Entity
// ============================================================================

/** Persisted task record shared across manager, store, tools, and integration. */
export interface Task {
  /** Unique task identifier */
  id: TaskId;

  /** User's goal/request in natural language */
  goal: string;

  /** Target workspace name (directory name) */
  workspace: string;

  /** Assigned coding agent */
  agent: AgentType;

  /** How the agent was selected ('auto' or explicit) */
  agentSelection: AgentSelection;

  /** Current task status */
  status: TaskStatus;

  /** Task priority level */
  priority: TaskPriority;

  /** Execution constraints */
  constraints: TaskConstraints;

  /** Progress updates received from harness */
  progress: TaskProgress[];

  /** Final result (populated when completed/failed) */
  result?: TaskResult;

  /** Pending question from harness (when status is 'waiting_input') */
  pendingQuestion?: string;

  /** Number of retry attempts made */
  retryCount: number;

  /** ISO timestamp: task created */
  createdAt: string;

  /** ISO timestamp: task started executing */
  startedAt?: string;

  /** ISO timestamp: task completed or failed */
  completedAt?: string;

  /** Session ID that created this task */
  sessionId: string;
}

// ============================================================================
// Task Creation Input
// ============================================================================

/** Input payload accepted by task creation flows (tool + manager). */
export interface TaskCreateInput {
  /** What the task should accomplish */
  goal: string;

  /** Which agent to use (default: 'auto') */
  agent?: AgentSelection;

  /** Target workspace (uses active workspace if not specified) */
  workspace?: string;

  /** Task timeout in milliseconds (default: 300000) */
  timeout?: number;
}

// ============================================================================
// Task Events
// ============================================================================

/** Event names emitted by task manager/integration. */
export type TaskEventType =
  | 'task:created'
  | 'task:started'
  | 'task:progress'
  | 'task:question'
  | 'task:paused'
  | 'task:resumed'
  | 'task:completed'
  | 'task:failed'
  | 'task:cancelled';

/** Generic task event payload envelope. */
export interface TaskEvent {
  type: TaskEventType;
  taskId: TaskId;
  timestamp: string;
  data?: unknown;
}
