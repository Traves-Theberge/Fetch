/**
 * @fileoverview Task domain types and interfaces
 *
 * Defines all types related to task management in Fetch v2.
 * Tasks represent coding work delegated to harnesses (Claude, Gemini, Copilot).
 *
 * @module task/types
 * @see {@link TaskManager} - Task lifecycle management
 * @see {@link HarnessExecution} - Task execution details
 */

// ============================================================================
// ID Types
// ============================================================================

/**
 * Unique identifier for tasks
 *
 * Format: `tsk_{nanoid(10)}`
 *
 * @example
 * ```typescript
 * const taskId: TaskId = 'tsk_V1StGXR8_Z';
 * ```
 */
export type TaskId = `tsk_${string}`;

// ============================================================================
// Enums (as union types)
// ============================================================================

/**
 * Supported coding agent types
 *
 * | Agent | CLI Command | Best For |
 * |-------|-------------|----------|
 * | claude | `claude --print` | Complex multi-file changes |
 * | gemini | `gemini` | Quick edits, explanations |
 * | copilot | `gh copilot suggest` | GitHub-integrated workflows |
 */
export type AgentType = 'claude' | 'gemini' | 'copilot';

/**
 * Agent selection strategy
 *
 * - Specific agent: Use that agent directly
 * - `auto`: Let the router choose based on task complexity
 */
export type AgentSelection = AgentType | 'auto';

// ===================================
// Scheduling Types
// ===================================

export interface CronJob {
  id: string;
  schedule: string; // Cron expression
  command: string;  // Command to run or internal handler name
  description: string;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  /** If true, job is automatically removed after the first execution. */
  oneShot?: boolean;
}

/**
 * Task lifecycle states
 *
 * State Machine:
 * ```
 * pending ──────► running ──────► completed
 *                    │                ▲
 *                    ▼                │
 *              waiting_input ─────────┘
 *                    │
 *                    ▼
 *                 failed
 *                    │
 *                    ▼
 *               cancelled
 * ```
 *
 * | State | Description |
 * |-------|-------------|
 * | pending | Task created, waiting to start |
 * | running | Harness is executing |
 * | waiting_input | Harness asked a question, awaiting user response |
 * | completed | Task finished successfully |
 * | failed | Task encountered an error |
 * | cancelled | User cancelled the task |
 */
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'waiting_input'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

/**
 * Task priority levels
 *
 * Currently unused (single-task queue), but reserved for future multi-task support.
 */
export type TaskPriority = 'low' | 'normal' | 'high';

// ============================================================================
// Constraint & Configuration Types
// ============================================================================

/**
 * Task execution constraints
 *
 * Controls how the task is executed and what limits apply.
 */
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

/**
 * Default task constraints
 */
export const DEFAULT_TASK_CONSTRAINTS: TaskConstraints = {
  timeoutMs: 300000, // 5 minutes
  requireApproval: false,
  maxRetries: 1,
};

// ============================================================================
// Progress & Result Types
// ============================================================================

/**
 * Progress update from harness
 *
 * Emitted periodically during task execution to show what's happening.
 */
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

/**
 * Task completion result
 *
 * Captures the outcome of a task, whether successful or failed.
 */
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

/**
 * Complete task entity
 *
 * Represents a single coding task from creation to completion.
 *
 * @example
 * ```typescript
 * const task: Task = {
 *   id: 'tsk_V1StGXR8_Z',
 *   goal: 'Add dark mode toggle to settings page',
 *   workspace: 'my-react-app',
 *   agent: 'claude',
 *   agentSelection: 'auto',
 *   status: 'running',
 *   priority: 'normal',
 *   constraints: DEFAULT_TASK_CONSTRAINTS,
 *   progress: [],
 *   retryCount: 0,
 *   createdAt: '2026-02-02T10:00:00.000Z',
 *   startedAt: '2026-02-02T10:00:01.000Z',
 *   sessionId: 'ses_Ab3dE7gH'
 * };
 * ```
 */
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

/**
 * Input for creating a new task
 *
 * Used by the task_create tool.
 */
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

/**
 * Task event types for pub/sub
 */
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

/**
 * Task event payload
 */
export interface TaskEvent {
  type: TaskEventType;
  taskId: TaskId;
  timestamp: string;
  data?: unknown;
}
