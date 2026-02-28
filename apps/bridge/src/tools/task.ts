/**
 * @fileoverview Task lifecycle tool handlers.
 *
 * Provides create/status/cancel/respond operations backed by task manager
 * and task integration services.
 *
 * @module tools/task
 */

import { getTaskManager } from '../task/manager.js';
import { workspaceManager } from '../workspace/manager.js';
import { getTaskIntegration } from '../task/integration.js';
import { getHarnessExecutor } from '../harness/executor.js';
import {
  AGENT_SELECTION_VALUES,
  TaskCreateInputSchema,
  TaskStatusInputSchema,
  TaskCancelInputSchema,
  TaskRespondInputSchema,
  type TaskCreateInput,
  type TaskStatusInput,
  type TaskCancelInput,
  type TaskRespondInput,
} from '../validation/tools.js';
import type { ToolResult, ToolContext } from './types.js';
import type { TaskId } from '../task/types.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

function isEnabled(flag: unknown): boolean {
  return String(flag).trim().toLowerCase() === 'true';
}

function isStructuredLifecycleNoise(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith('{') || !t.endsWith('}')) return false;
  return /"type"\s*:\s*"(thread|turn|item)\./.test(t);
}

function normalizeTaskSummary(summary: string): string {
  const withoutEmbeddedLifecycle = summary.replace(
    /\{[^\n{}]*"type"\s*:\s*"(?:thread|turn|item)\.[^{}]*?(?:\{[^{}]*\}[^{}]*?)*\}/g,
    ' ',
  );

  const stripped = withoutEmbeddedLifecycle
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isStructuredLifecycleNoise(line))
    .join(' ');
  const compact = stripped.replace(/\s+/g, ' ').trim();
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
}

function getEnabledAgentChoices(): string[] {
  const enabled: string[] = [];
  if (isEnabled(env.ENABLE_COPILOT)) enabled.push('copilot');
  if (isEnabled(env.ENABLE_GEMINI)) enabled.push('gemini');
  if (isEnabled(env.ENABLE_CLAUDE)) enabled.push('claude');
  if (isEnabled(env.ENABLE_OPENCODE)) enabled.push('opencode');
  if (isEnabled(env.ENABLE_CODEX)) enabled.push('codex');
  return enabled.length > 0 ? enabled : AGENT_SELECTION_VALUES.filter((agent) => agent !== 'auto');
}

// ============================================================================
// task_create
// ============================================================================

/**
 * Creates and starts a task execution flow for the selected workspace.
 *
 * Handles goal framing, task creation, and background execution kickoff.
 */
export async function handleTaskCreate(
  input: unknown,
  context?: ToolContext
): Promise<ToolResult> {
  const start = Date.now();
  logger.info('handleTaskCreate called', { input });

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
      const session = await sManager.getSessionById(sessionId);

      if (session) {
        framedGoal = await frameTaskGoal(goal, session);
        logger.info('Task goal framed for harness', { original: goal.substring(0, 50), framed: framedGoal.substring(0, 50) });
      } else {
        logger.warn('Session ID provided but session not found', { sessionId });
      }
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
    logger.debug('TaskManager instance retrieved');

    // Check if a task is already running (single-task constraint)
    if (manager.hasRunningTask()) {
      const currentTaskId = manager.getCurrentTaskId();
      logger.warn('Task creation rejected: another task is already running', { currentTaskId });
      return {
        success: false,
        output: '',
        error: `Cannot create task: another task (${currentTaskId}) is already running. Please cancel it first with task_cancel.`,
        duration: Date.now() - start,
      };
    }
    logger.info('Creating task in manager...', { framedGoal, agent, workspaceId });
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
      logger.debug(`Task ${taskId} progress: ${percent ?? 0}% — ${message}`);
    }).then(result => {
      logger.info(`Task ${task.id} completed`, { success: result.success });
    }).catch(err => {
      logger.error(`Task ${task.id} execution error`, err);
    });

    const output = `Created task ${task.id}: '${task.goal.length > 60 ? task.goal.slice(0, 57) + '...' : task.goal}' -> ${task.agent} in ${task.workspace}`;

    return {
      success: true,
      output,
      summary: `Created task ${task.id}`,
      duration: Date.now() - start,
      metadata: {
        taskId: task.id,
        status: task.status,
      },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Help the LLM/User if it's an agent selection issue
    if (errorMessage.includes('agent selection') || errorMessage.includes('agents are currently enabled')) {
      const outputObj = {
        error: 'AMBIGUOUS_AGENT_SELECTION',
        message: errorMessage,
        instruction: 'You MUST NOT auto-select an agent. Stop and ask the user for clarification using ask_user.',
        choices: getEnabledAgentChoices(),
      };
      const response = {
        success: true, // Return true so LLM processes the output naturally
        output: JSON.stringify(outputObj),
        error: undefined,
        duration: Date.now() - start,
      };
      logger.info('Returning ambiguity response to LLM:', response);
      return response;
    }

    logger.error('handleTaskCreate failed', { error: err, sessionId });
    return {
      success: false,
      output: '',
      error: errorMessage,
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// task_status
// ============================================================================

/** Returns status for the given task id or current active task. */
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

    // Build narrative output for LLM
    const parts: string[] = [`Task ${task.id} ${task.status}`];
    if (task.startedAt) {
      const elapsed = Math.round((Date.now() - new Date(task.startedAt).getTime()) / 1000);
      parts[0] += ` (${elapsed}s)`;
    }
    parts.push(`'${task.goal.length > 50 ? task.goal.slice(0, 47) + '...' : task.goal}'`);

    const latestProgress = task.progress.length > 0 ? task.progress[task.progress.length - 1] : undefined;
    if (latestProgress?.message) parts.push(`Last: ${latestProgress.message}`);
    if (task.pendingQuestion) parts.push(`Waiting for input: "${task.pendingQuestion}"`);
    if (task.result?.summary) {
      const cleanSummary = normalizeTaskSummary(task.result.summary);
      if (cleanSummary) {
        parts.push(`Result: ${cleanSummary}`);
      }
    }

    const output = parts.join(' - ');

    return {
      success: true,
      output,
      summary: `Task ${task.id}: ${task.status}`,
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

/** Cancels an active task and stops associated execution state. */
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

    const integration = getTaskIntegration();
    const processTerminated = integration.cancelExecution(taskId as TaskId);

    // Cancel the task state (TaskManager clears currentTaskId internally)
    await manager.cancelTask(taskId as TaskId);

    const elapsed = task.startedAt ? Math.round((Date.now() - new Date(task.startedAt).getTime()) / 1000) : undefined;
    const output = `Cancelled task ${taskId}${elapsed ? ` (was running ${elapsed}s)` : ''}${processTerminated ? '; terminated active process' : ''}`;

    return {
      success: true,
      output,
      summary: output,
      duration: Date.now() - start,
      metadata: {
        taskId,
        previousStatus: task.status,
        processTerminated,
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

/** Sends user input back to a task waiting in `waiting_input` state. */
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
      output: `Sent response to task ${targetTaskId}, resuming execution`,
      summary: `Response sent to ${targetTaskId}`,
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
// Tool Registry Integration
// ============================================================================

/** Task tool entries consumed by the central registry. */
export const taskTools = {
  task_create: {
    name: 'task_create',
    description: 'Create a new coding task. IMPORTANT: If multiple agents are enabled (Copilot, Gemini, Claude, OpenCode, Codex) and the user has not explicitly specified which one to use, you MUST call ask_user to clarify the agent choice BEFORE calling this tool. Requires an active workspace.',
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
