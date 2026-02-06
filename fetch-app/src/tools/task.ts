/**
 * @fileoverview Task tools
 *
 * Tool handlers for task lifecycle operations.
 *
 * @module tools/task
 * @see {@link TaskManager} - Task lifecycle management
 *
 * ## Tools
 *
 * - `task_create` - Create a new task
 * - `task_status` - Get task status
 * - `task_cancel` - Cancel a running task
 * - `task_respond` - Respond to task question
 */

import { getTaskManager } from '../task/manager.js';
import { workspaceManager } from '../workspace/manager.js';
import { getTaskIntegration } from '../task/integration.js';
import { getHarnessExecutor } from '../harness/executor.js';
import {
  TaskCreateInputSchema,
  TaskStatusInputSchema,
  TaskCancelInputSchema,
  TaskRespondInputSchema,
  type TaskCreateInput,
  type TaskStatusInput,
  type TaskCancelInput,
  type TaskRespondInput,
} from '../validation/tools.js';
import type { ToolResult } from './types.js';
import type { ToolContext } from './registry.js';
import type { Task, TaskId } from '../task/types.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// task_create
// ============================================================================

/**
 * Create a new task
 *
 * Creates a task for a coding agent to execute. The task is queued
 * and starts execution when resources are available.
 *
 * @param input - Tool input with goal and optional constraints
 * @param sessionId - Session ID for the task (required)
 * @returns Created task details
 *
 * @example
 * ```typescript
 * const result = await handleTaskCreate({
 *   goal: 'Add error handling to the API endpoints',
 *   agent: 'claude',
 *   workspace: 'my-project'
 * }, 'ses_abc123');
 * ```
 */
export async function handleTaskCreate(
  input: unknown,
  context?: ToolContext
): Promise<ToolResult> {
  const start = Date.now();

  // Resolve sessionId from context (passed by registry) or fallback
  const sessionId = context?.sessionId;

  // Validate input
  const parseResult = TaskCreateInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      output: '',
      error: `Invalid input: ${parseResult.error.message}`,
      duration: Date.now() - start,
    };
  }

  const { goal, agent, workspace, timeout } = parseResult.data as TaskCreateInput;

  // Frame the goal for the harness — self-contained, no chat references
  let framedGoal = goal;
  if (sessionId) {
    try {
      const { frameTaskGoal } = await import('../agent/core.js');
      const { getSessionManager } = await import('../session/manager.js');
      const sManager = await getSessionManager();
      const session = await sManager.getOrCreateSession(sessionId);
      framedGoal = await frameTaskGoal(goal, session);
      logger.info('Task goal framed for harness', { original: goal.substring(0, 50), framed: framedGoal.substring(0, 50) });
    } catch (err) {
      // Framing failure is non-fatal — fall back to raw goal
      logger.warn('Task goal framing failed, using raw goal', err);
    }
  }

  // Determine workspace
  const workspaceId = workspace ?? workspaceManager.getActiveWorkspaceId();
  if (!workspaceId) {
    return {
      success: false,
      output: '',
      error: 'No workspace specified and no active workspace selected. Use workspace_select first.',
      duration: Date.now() - start,
    };
  }

  // Verify workspace exists
  const workspaceData = await workspaceManager.getWorkspace(workspaceId);
  if (!workspaceData) {
    return {
      success: false,
      output: '',
      error: `Workspace not found: ${workspaceId}`,
      duration: Date.now() - start,
    };
  }

  try {
    // Create the task via TaskManager
    const manager = await getTaskManager();

    // Check if a task is already running (single-task constraint)
    if (manager.hasRunningTask()) {
      const currentTaskId = manager.getCurrentTaskId();
      return {
        success: false,
        output: '',
        error: `Cannot create task: another task (${currentTaskId}) is already running`,
        duration: Date.now() - start,
      };
    }
    const task = await manager.createTask(
      {
        goal: framedGoal,
        agent: agent ?? 'auto',
        workspace: workspaceId,
        timeout,
      },
      sessionId ?? 'unknown'
    );

    // Start task execution in the background via harness
    const integration = getTaskIntegration();
    
    // Execute asynchronously - don't await, let it run in background
    integration.executeTask(task, (taskId, message, percent) => {
      // Progress callback - could emit events here for real-time updates
      console.log(`[Task ${taskId}] ${percent ?? 0}% - ${message}`);
    }).then(result => {
      console.log(`[Task ${task.id}] Completed:`, result.success ? 'SUCCESS' : 'FAILED');
    }).catch(err => {
      console.error(`[Task ${task.id}] Error:`, err);
    });

    const taskData = formatTaskOutput(task);

    return {
      success: true,
      output: JSON.stringify(taskData, null, 2),
      duration: Date.now() - start,
      metadata: {
        taskId: task.id,
        status: task.status,
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
// task_status
// ============================================================================

/**
 * Get task status
 *
 * Returns the current status of a task including progress,
 * any pending questions, and execution details.
 *
 * @param input - Tool input with optional task ID
 * @returns Task status details
 *
 * @example
 * ```typescript
 * const result = await handleTaskStatus({ taskId: 'tsk_abc123' });
 * ```
 */
export async function handleTaskStatus(
  input: unknown
): Promise<ToolResult> {
  const start = Date.now();

  // Validate input
  const parseResult = TaskStatusInputSchema.safeParse(input ?? {});
  if (!parseResult.success) {
    return {
      success: false,
      output: '',
      error: `Invalid input: ${parseResult.error.message}`,
      duration: Date.now() - start,
    };
  }

  const { taskId } = parseResult.data as TaskStatusInput;

  try {
    const manager = await getTaskManager();

    // Use provided taskId or current task
    const targetTaskId = taskId ?? manager.getCurrentTaskId();

    if (!targetTaskId) {
      return {
        success: false,
        output: '',
        error: 'No task ID specified and no current task',
        duration: Date.now() - start,
      };
    }

    const task = manager.getTask(targetTaskId as TaskId);

    if (!task) {
      return {
        success: false,
        output: '',
        error: `Task not found: ${targetTaskId}`,
        duration: Date.now() - start,
      };
    }

    const taskData = formatTaskOutput(task);

    return {
      success: true,
      output: JSON.stringify(taskData, null, 2),
      duration: Date.now() - start,
      metadata: {
        taskId: task.id,
        status: task.status,
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
// task_cancel
// ============================================================================

/**
 * Cancel a task
 *
 * Cancels a running or queued task. If the task is actively
 * executing, the harness process will be terminated.
 *
 * @param input - Tool input with task ID
 * @returns Cancellation result
 *
 * @example
 * ```typescript
 * const result = await handleTaskCancel({
 *   taskId: 'tsk_abc123'
 * });
 * ```
 */
export async function handleTaskCancel(
  input: unknown
): Promise<ToolResult> {
  const start = Date.now();

  // Validate input
  const parseResult = TaskCancelInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      output: '',
      error: `Invalid input: ${parseResult.error.message}`,
      duration: Date.now() - start,
    };
  }

  const { taskId } = parseResult.data as TaskCancelInput;

  try {
    const manager = await getTaskManager();
    const task = manager.getTask(taskId as TaskId);

    if (!task) {
      return {
        success: false,
        output: '',
        error: `Task not found: ${taskId}`,
        duration: Date.now() - start,
      };
    }

    // Check if task can be cancelled
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return {
        success: false,
        output: '',
        error: `Task cannot be cancelled: already ${task.status}`,
        duration: Date.now() - start,
      };
    }

    // Cancel the task (TaskManager clears currentTaskId internally)
    await manager.cancelTask(taskId as TaskId);

    return {
      success: true,
      output: JSON.stringify({
        taskId,
        status: 'cancelled',
        reason: 'Cancelled by user',
      }, null, 2),
      duration: Date.now() - start,
      metadata: {
        taskId,
        previousStatus: task.status,
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
// task_respond
// ============================================================================

/**
 * Respond to a task question
 *
 * Provides an answer to a question asked by the coding agent
 * during task execution. This unblocks the agent to continue.
 *
 * @param input - Tool input with response and optional task ID
 * @returns Response acknowledgment
 *
 * @example
 * ```typescript
 * const result = await handleTaskRespond({
 *   response: 'Yes, please use TypeScript'
 * });
 * ```
 */
export async function handleTaskRespond(
  input: unknown
): Promise<ToolResult> {
  const start = Date.now();

  // Validate input
  const parseResult = TaskRespondInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      output: '',
      error: `Invalid input: ${parseResult.error.message}`,
      duration: Date.now() - start,
    };
  }

  const { response, taskId } = parseResult.data as TaskRespondInput;

  try {
    const manager = await getTaskManager();

    // Use provided taskId or current task
    const targetTaskId = taskId ?? manager.getCurrentTaskId();

    if (!targetTaskId) {
      return {
        success: false,
        output: '',
        error: 'No task ID specified and no current task',
        duration: Date.now() - start,
      };
    }

    const task = manager.getTask(targetTaskId as TaskId);

    if (!task) {
      return {
        success: false,
        output: '',
        error: `Task not found: ${targetTaskId}`,
        duration: Date.now() - start,
      };
    }

    // Check if task is waiting for input
    if (task.status !== 'waiting_input') {
      return {
        success: false,
        output: '',
        error: `Task is not waiting for input: status is ${task.status}`,
        duration: Date.now() - start,
      };
    }

    // Resume the task
    await manager.resumeTask(targetTaskId as TaskId);

    // Send response to harness via stdin
    const executor = getHarnessExecutor();
    const execution = executor.getExecutionForTask(targetTaskId as TaskId);
    if (execution && execution.status === 'waiting_input') {
      try {
        executor.sendInput(execution.id, response);
      } catch {
        // Harness may have already moved on — not fatal
      }
    }

    return {
      success: true,
      output: JSON.stringify({
        taskId: targetTaskId,
        status: 'running',
        responseSent: true,
      }, null, 2),
      duration: Date.now() - start,
      metadata: {
        taskId: targetTaskId,
        responseLength: response.length,
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
// Helper Functions
// ============================================================================

/**
 * Format task for output
 */
function formatTaskOutput(task: Task): Record<string, unknown> {
  // Get latest progress entry
  const latestProgress = task.progress.length > 0
    ? task.progress[task.progress.length - 1]
    : undefined;

  return {
    id: task.id,
    goal: task.goal,
    status: task.status,
    workspace: task.workspace,
    agent: task.agent,
    agentSelection: task.agentSelection,
    progress: latestProgress ? {
      message: latestProgress.message,
      percent: latestProgress.percent,
      files: latestProgress.files,
    } : undefined,
    pendingQuestion: task.pendingQuestion,
    result: task.result ? {
      success: task.result.success,
      summary: task.result.summary,
      filesModified: task.result.filesModified,
      filesCreated: task.result.filesCreated,
      error: task.result.error,
    } : undefined,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };
}

// ============================================================================
// Tool Registry Integration
// ============================================================================

/**
 * Task tool definitions for registry
 */
export const taskTools = {
  task_create: {
    name: 'task_create',
    description: 'Create a new coding task. The task is queued and executed by a coding agent (Claude Code, Gemini CLI, etc.). Requires an active workspace.',
    handler: handleTaskCreate,
    schema: TaskCreateInputSchema,
  },
  task_status: {
    name: 'task_status',
    description: 'Get the status of a task including progress, any pending questions, and execution details.',
    handler: handleTaskStatus,
    schema: TaskStatusInputSchema,
  },
  task_cancel: {
    name: 'task_cancel',
    description: 'Cancel a running or queued task. If the task is actively executing, the agent process will be terminated.',
    handler: handleTaskCancel,
    schema: TaskCancelInputSchema,
  },
  task_respond: {
    name: 'task_respond',
    description: 'Respond to a question from the coding agent. Use this when a task is waiting for input.',
    handler: handleTaskRespond,
    schema: TaskRespondInputSchema,
  },
} as const;
