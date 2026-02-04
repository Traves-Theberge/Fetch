/**
 * @fileoverview Task-Harness Integration
 *
 * Connects the task management layer to the harness execution layer.
 * Handles:
 * - Starting harness execution when tasks are created
 * - Routing harness events to task updates
 * - Managing the execution lifecycle
 *
 * @module task/integration
 * @see {@link TaskManager} - Task lifecycle
 * @see {@link HarnessExecutor} - Harness execution
 */

import { EventEmitter } from 'events';
import { taskManager } from './manager.js';
import { getHarnessExecutor } from '../harness/executor.js';
import { getClaudeAdapter } from '../harness/claude.js';
import { getGeminiAdapter } from '../harness/gemini.js';
import { getCopilotAdapter } from '../harness/copilot.js';
import { workspaceManager } from '../workspace/manager.js';
import { logger } from '../utils/logger.js';
import type { Task, TaskId, AgentType } from './types.js';
import type { HarnessResult } from '../harness/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Task execution result
 */
export interface TaskExecutionResult {
  taskId: TaskId;
  success: boolean;
  output?: string;
  error?: string;
  filesChanged?: string[];
}

/**
 * Progress callback for streaming updates
 */
export type ProgressCallback = (
  taskId: TaskId,
  message: string,
  percent?: number
) => void;

// ============================================================================
// TaskIntegration Class
// ============================================================================

/**
 * Task-Harness Integration Manager
 *
 * Coordinates task execution through harnesses and routes
 * events/progress between the layers.
 */
export class TaskIntegration extends EventEmitter {
  private initialized = false;
  private activeExecutions = new Map<TaskId, AbortController>();
  private progressCallbacks = new Map<TaskId, ProgressCallback>();

  /**
   * Initialize the integration layer
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing task-harness integration...');

    // Initialize harness executor
    const executor = getHarnessExecutor();

    // Register all harness adapters
    const claudeAdapter = getClaudeAdapter();
    const geminiAdapter = getGeminiAdapter();
    const copilotAdapter = getCopilotAdapter();
    
    executor.registerAdapter(claudeAdapter);
    executor.registerAdapter(geminiAdapter);
    executor.registerAdapter(copilotAdapter);
    
    logger.info('Registered harness adapters: claude, gemini, copilot');

    // Subscribe to harness events
    this.subscribeToHarnessEvents(executor);

    this.initialized = true;
    logger.success('Task-harness integration ready');
  }

  /**
   * Execute a task
   *
   * Starts harness execution for the given task and streams
   * progress updates.
   *
   * @param task - Task to execute
   * @param onProgress - Optional progress callback
   * @returns Execution result
   */
  async executeTask(
    task: Task,
    onProgress?: ProgressCallback
  ): Promise<TaskExecutionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const executor = getHarnessExecutor();
    const abort = new AbortController();
    this.activeExecutions.set(task.id, abort);

    if (onProgress) {
      this.progressCallbacks.set(task.id, onProgress);
    }

    logger.info(`Starting task execution: ${task.id}`, {
      goal: task.goal,
      agent: task.agent,
      workspace: task.workspace,
    });

    try {
      // Get workspace path
      const workspace = await workspaceManager.getWorkspace(task.workspace);
      if (!workspace) {
        throw new Error(`Workspace not found: ${task.workspace}`);
      }

      // Determine agent type
      const agent = this.selectAgent(task.agent);

      // Update task status
      await taskManager.startTask(task.id);
      onProgress?.(task.id, 'Starting execution...', 0);

      // Get timeout from constraints (default 10 min)
      const timeoutMs = task.constraints?.timeoutMs ?? 600000;

      // Execute via harness
      const result = await executor.execute(
        task.id,
        agent,
        task.goal,
        workspace.path,
        timeoutMs
      );

      // Process result
      return this.processResult(task.id, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Task execution failed: ${task.id}`, { error: errorMessage });

      await taskManager.failTask(task.id, errorMessage);

      return {
        taskId: task.id,
        success: false,
        error: errorMessage,
      };
    } finally {
      this.activeExecutions.delete(task.id);
      this.progressCallbacks.delete(task.id);
    }
  }

  /**
   * Cancel an executing task
   *
   * @param taskId - Task ID to cancel
   */
  async cancelExecution(taskId: TaskId): Promise<void> {
    const abort = this.activeExecutions.get(taskId);
    if (abort) {
      abort.abort();
      logger.info(`Cancelled task execution: ${taskId}`);
    }

    await taskManager.cancelTask(taskId);
  }

  /**
   * Send a response to a waiting task
   *
   * @param taskId - Task ID
   * @param response - User response
   */
  async respondToTask(taskId: TaskId, response: string): Promise<void> {
    const executor = getHarnessExecutor();

    // Find the harness for this task
    const execution = executor.getActiveExecution(taskId);
    if (!execution) {
      throw new Error(`No active execution for task: ${taskId}`);
    }

    await executor.sendInput(execution.id, response);
    logger.info(`Sent response to task: ${taskId}`, { response });
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Subscribe to harness events and route to tasks
   */
  private subscribeToHarnessEvents(executor: ReturnType<typeof getHarnessExecutor>): void {
    executor.on('harness:output', (event) => {
      const { taskId, data } = event;
      const callback = this.progressCallbacks.get(taskId);

      if (callback && data?.line) {
        callback(taskId, data.line as string);
      }

      this.emit('task:output', { taskId, line: data?.line });
    });

    executor.on('harness:question', (event) => {
      const { taskId, data } = event;

      // Pause task and wait for response
      taskManager.pauseTask(taskId, data?.question as string | undefined);

      this.emit('task:question', {
        taskId,
        question: data?.question,
      });
    });

    executor.on('harness:completed', (event) => {
      const { taskId } = event;

      this.emit('task:completed', { taskId });
    });

    executor.on('harness:failed', (event) => {
      const { taskId, data } = event;

      this.emit('task:failed', {
        taskId,
        error: data?.error,
      });
    });
  }

  /**
   * Select agent type (resolve 'auto')
   */
  private selectAgent(agent: string): AgentType {
    if (agent === 'auto') {
      // Default to claude for now
      // Future: intelligent routing based on task type
      return 'claude';
    }
    return agent as AgentType;
  }

  /**
   * Process harness result into task result
   */
  private async processResult(
    taskId: TaskId,
    result: HarnessResult
  ): Promise<TaskExecutionResult> {
    if (result.success) {
      // Build TaskResult object
      // Note: filesModified would be parsed from output in real implementation
      const taskResult = {
        success: true,
        summary: result.output ?? 'Task completed successfully',
        filesModified: [] as string[], // TODO: Parse from output
        filesCreated: [] as string[],
        filesDeleted: [] as string[],
        rawOutput: result.output ?? '',
        exitCode: result.exitCode ?? 0,
      };

      await taskManager.completeTask(taskId, taskResult);

      return {
        taskId,
        success: true,
        output: result.output,
      };
    } else {
      await taskManager.failTask(taskId, result.error ?? 'Unknown error');

      return {
        taskId,
        success: false,
        error: result.error,
      };
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let taskIntegration: TaskIntegration | null = null;

/**
 * Get the task integration singleton
 */
export function getTaskIntegration(): TaskIntegration {
  if (!taskIntegration) {
    taskIntegration = new TaskIntegration();
  }
  return taskIntegration;
}

/**
 * Initialize task integration
 */
export async function initializeTaskIntegration(): Promise<void> {
  const integration = getTaskIntegration();
  await integration.initialize();
}

export { taskIntegration };
