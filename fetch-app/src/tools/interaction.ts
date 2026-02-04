/**
 * @fileoverview Interaction tools
 *
 * Tool handlers for user interaction during task execution.
 *
 * @module tools/interaction
 * @see {@link TaskManager} - Task progress updates
 *
 * ## Tools
 *
 * - `ask_user` - Ask user a question
 * - `report_progress` - Report task progress
 */

import { getTaskManager } from '../task/manager.js';
import { taskQueue } from '../task/queue.js';
import {
  AskUserInputSchema,
  ReportProgressInputSchema,
  type AskUserInput,
  type ReportProgressInput,
} from '../validation/tools.js';
import type { ToolResult } from './types.js';
import type { TaskId } from '../task/types.js';

// ============================================================================
// ask_user
// ============================================================================

/**
 * Ask user a question
 *
 * Pauses task execution and sends a question to the user via WhatsApp.
 * The task will wait until the user responds via task_respond.
 *
 * Note: This is typically called internally by the harness when
 * the coding agent asks a question.
 *
 * @param input - Tool input with question and optional choices
 * @returns Acknowledgment that question was sent
 *
 * @example
 * ```typescript
 * const result = await handleAskUser({
 *   question: 'Should I use TypeScript or JavaScript?',
 *   options: ['TypeScript', 'JavaScript']
 * });
 * ```
 */
export async function handleAskUser(
  input: unknown
): Promise<ToolResult> {
  const start = Date.now();

  // Validate input
  const parseResult = AskUserInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      output: '',
      error: `Invalid input: ${parseResult.error.message}`,
      duration: Date.now() - start,
    };
  }

  // Schema has 'question' and 'options' fields
  const { question, options } = parseResult.data as AskUserInput;

  // Get current task
  const currentTaskId = taskQueue.getCurrentTaskId();
  if (!currentTaskId) {
    return {
      success: false,
      output: '',
      error: 'No active task to ask question for',
      duration: Date.now() - start,
    };
  }

  try {
    const manager = await getTaskManager();
    const task = manager.getTask(currentTaskId);

    if (!task) {
      return {
        success: false,
        output: '',
        error: `Task not found: ${currentTaskId}`,
        duration: Date.now() - start,
      };
    }

    // Format the question with options if provided
    let formattedQuestion = question;
    if (options && options.length > 0) {
      formattedQuestion += '\n\nOptions:\n' + options.map((o, i) => `${i + 1}. ${o}`).join('\n');
    }

    // Set the pending question on the task (this transitions to waiting_input)
    const manager = await getTaskManager();
    await manager.setWaitingInput(currentTaskId, formattedQuestion);

    // The WhatsApp layer will pick up the question from task events
    // and send it to the user. The task is now in waiting_input status.

    return {
      success: true,
      output: JSON.stringify({
        taskId: currentTaskId,
        status: 'waiting_input',
        question: formattedQuestion,
        options: options ?? [],
      }, null, 2),
      duration: Date.now() - start,
      metadata: {
        taskId: currentTaskId,
        hasOptions: !!(options && options.length > 0),
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
// report_progress
// ============================================================================

/**
 * Report task progress
 *
 * Updates the task progress with a message and optional percentage.
 * Progress updates are sent to the user via WhatsApp.
 *
 * Note: This is typically called internally by the harness when
 * it detects progress in the coding agent's output.
 *
 * @param input - Tool input with progress message and optional percent
 * @returns Acknowledgment that progress was updated
 *
 * @example
 * ```typescript
 * const result = await handleReportProgress({
 *   message: 'Implementing API endpoints',
 *   percent: 50
 * });
 * ```
 */
export async function handleReportProgress(
  input: unknown
): Promise<ToolResult> {
  const start = Date.now();

  // Validate input
  const parseResult = ReportProgressInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      output: '',
      error: `Invalid input: ${parseResult.error.message}`,
      duration: Date.now() - start,
    };
  }

  // Schema has 'message' and 'percent' fields
  const { message, percent } = parseResult.data as ReportProgressInput;

  // Get current task
  const currentTaskId = taskQueue.getCurrentTaskId();
  if (!currentTaskId) {
    return {
      success: false,
      output: '',
      error: 'No active task to report progress for',
      duration: Date.now() - start,
    };
  }

  try {
    const manager = await getTaskManager();
    const task = manager.getTask(currentTaskId);

    if (!task) {
      return {
        success: false,
        output: '',
        error: `Task not found: ${currentTaskId}`,
        duration: Date.now() - start,
      };
    }

    // Check if task is in a valid state for progress updates
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return {
        success: false,
        output: '',
        error: `Cannot update progress for ${task.status} task`,
        duration: Date.now() - start,
      };
    }

    // Add progress update to task (message, files, percent)
    const manager = await getTaskManager();
    await manager.addProgress(currentTaskId as TaskId, message, undefined, percent);

    return {
      success: true,
      output: JSON.stringify({
        taskId: currentTaskId,
        progress: {
          message,
          percent,
        },
      }, null, 2),
      duration: Date.now() - start,
      metadata: {
        taskId: currentTaskId,
        percent,
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
 * Interaction tool definitions for registry
 */
export const interactionTools = {
  ask_user: {
    name: 'ask_user',
    description: 'Ask the user a question during task execution. The task will pause until the user responds. Optionally provide a list of options for the user to choose from.',
    handler: handleAskUser,
    schema: AskUserInputSchema,
  },
  report_progress: {
    name: 'report_progress',
    description: 'Report progress on a task. Use this to keep the user informed about what the coding agent is doing.',
    handler: handleReportProgress,
    schema: ReportProgressInputSchema,
  },
} as const;
