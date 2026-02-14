/**
 * @fileoverview Runtime bridge between tasks and harness execution.
 *
 * Responsibilities:
 * - start harness execution for created tasks
 * - map harness lifecycle/events to task updates
 * - emit task-scoped events used by transport layers (e.g., WhatsApp notifications)
 *
 * @module task/integration
 */

import { EventEmitter } from 'events';
import { getTaskManager, TaskManager } from './manager.js';
import { getHarnessExecutor } from '../harness/executor.js';
import { workspaceManager } from '../workspace/manager.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import type { Task, TaskId, AgentType } from './types.js';
import type { HarnessResult } from '../harness/types.js';

// ============================================================================
// Types
// ============================================================================

/** Internal execution result returned by the integration layer. */
interface TaskExecutionResult {
  taskId: TaskId;
  success: boolean;
  output?: string;
  error?: string;
  filesChanged?: string[];
}

/** Internal callback shape for streaming task progress updates. */
type ProgressCallback = (
  taskId: TaskId,
  message: string,
  percent?: number
) => void;

// ============================================================================
// TaskIntegration Class
// ============================================================================

/** Coordinates task execution through harnesses and task manager state updates. */
export class TaskIntegration extends EventEmitter {
  private initialized = false;
  private manager: TaskManager | null = null;
  private activeExecutions = new Set<TaskId>();
  private progressCallbacks = new Map<TaskId, ProgressCallback>();
  private taskSessions = new Map<TaskId, string>();

  /** Initializes manager/executor references and subscribes to harness events. */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing task-harness integration...');

    // Get task manager
    this.manager = await getTaskManager();

    // Initialize harness executor (adapters come from harness/registry.ts)
    const executor = getHarnessExecutor();

    // Subscribe to harness events
    this.subscribeToHarnessEvents(executor);

    this.initialized = true;
    logger.success('Task-harness integration ready');
  }

  /**
   * Executes one task through the harness executor.
   *
   * @param task - Task to execute
   * @param onProgress - Optional streaming callback
   * @returns Final execution outcome
   */
  async executeTask(
    task: Task,
    onProgress?: ProgressCallback
  ): Promise<TaskExecutionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const executor = getHarnessExecutor();
    this.activeExecutions.add(task.id);
    this.taskSessions.set(task.id, task.sessionId);

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
      await this.manager!.startTask(task.id);

      // Notify listeners (like WhatsApp handler) that task is actually moving
      this.emit('task:started', {
        taskId: task.id,
        sessionId: task.sessionId,
        goal: task.goal
      });

      onProgress?.(task.id, 'Starting execution...', 0);

      // Get timeout from constraints (default 10 min)
      const timeoutMs = task.constraints?.timeoutMs ?? 600000;

      // Execute via harness (pass profile for goal enrichment)
      const result = await executor.execute(
        task.id,
        agent,
        task.goal,
        workspace.path,
        timeoutMs,
        workspace.profile
      );

      // Process result
      return this.processResult(task.id, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Task execution failed: ${task.id}`, { error: errorMessage });

      try {
        await this.manager!.failTask(task.id, errorMessage);
      } catch (transitionError) {
        logger.error(`Failed to transition task ${task.id} to failed`, transitionError);
      }

      return {
        taskId: task.id,
        success: false,
        error: errorMessage,
      };
    } finally {
      try { this.activeExecutions.delete(task.id); } catch (e) { logger.error('Cleanup: activeExecutions', e); }
      try { this.progressCallbacks.delete(task.id); } catch (e) { logger.error('Cleanup: progressCallbacks', e); }
      try { this.taskSessions.delete(task.id); } catch (e) { logger.error('Cleanup: taskSessions', e); }
    }
  }

  /** Clears integration state and removes event listeners. */
  public shutdown(): void {
    this.activeExecutions.clear();
    this.progressCallbacks.clear();
    this.taskSessions.clear();
    this.removeAllListeners();
    this.initialized = false;
    this.manager = null;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /** Subscribes to harness events and re-emits normalized task events. */
  private subscribeToHarnessEvents(executor: ReturnType<typeof getHarnessExecutor>): void {
    executor.on('harness:output', (event) => {
      const { taskId, data } = event;
      const callback = this.progressCallbacks.get(taskId);
      const sessionId = this.taskSessions.get(taskId);
      const payload = data as { line?: unknown; data?: unknown } | undefined;
      const line = typeof payload?.line === 'string'
        ? payload.line
        : (typeof payload?.data === 'string' ? payload.data : undefined);

      if (callback && line) {
        callback(taskId, line);
      }

      this.emit('task:output', { taskId, sessionId, line });
    });

    executor.on('harness:progress', (event) => {
      const { taskId, data } = event;
      const sessionId = this.taskSessions.get(taskId);
      this.emit('task:progress', { taskId, sessionId, ...(data as object) });
    });

    executor.on('harness:file_op', (event) => {
      const { taskId, data } = event;
      const sessionId = this.taskSessions.get(taskId);
      this.emit('task:file_op', { taskId, sessionId, ...(data as object) });
    });

    executor.on('harness:question', (event) => {
      const { taskId, data } = event;
      const sessionId = this.taskSessions.get(taskId);

      // Pause task and wait for response
      this.manager!.pauseTask(taskId, data?.question as string | undefined)
        .catch(err => logger.error(`Failed to pause task ${taskId} on question`, err));

      this.emit('task:question', {
        taskId,
        sessionId,
        question: data?.question,
      });
    });

    executor.on('harness:completed', (event) => {
      const { taskId } = event;
      const sessionId = this.taskSessions.get(taskId);

      this.emit('task:completed', { taskId, sessionId });
    });

    executor.on('harness:failed', (event) => {
      const { taskId, data } = event;
      const sessionId = this.taskSessions.get(taskId);

      this.emit('task:failed', {
        taskId,
        sessionId,
        error: data?.error,
      });
    });
  }

  /** Resolves `auto` to a concrete agent using enabled harness flags. */
  private selectAgent(agent: string): AgentType {
    if (agent === 'auto') {
      const enabled: AgentType[] = [];
      if (String(env.ENABLE_COPILOT).trim().toLowerCase() === 'true') enabled.push('copilot');
      if (String(env.ENABLE_GEMINI).trim().toLowerCase() === 'true') enabled.push('gemini');
      if (String(env.ENABLE_CLAUDE).trim().toLowerCase() === 'true') enabled.push('claude');
      if (String(env.ENABLE_OPENCODE).trim().toLowerCase() === 'true') enabled.push('opencode');
      if (String(env.ENABLE_CODEX).trim().toLowerCase() === 'true') enabled.push('codex');

      if (enabled.length === 1) return enabled[0];
      if (enabled.length > 1) {
        throw new Error(
          `Ambiguous agent selection: Multiple agents are enabled (${enabled.join(', ')}). ` +
          'Please specify which agent to use.'
        );
      }
      throw new Error('No harnesses are currently enabled.');
    }
    return agent as AgentType;
  }

  /** Maps a harness result into task-manager completion/failure updates. */
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
        filesModified: [] as string[], // Not yet parsed from harness output — adapters have extractFileOperations() but executor doesn't expose it
        filesCreated: [] as string[],
        filesDeleted: [] as string[],
        rawOutput: result.output ?? '',
        exitCode: result.exitCode ?? 0,
      };

      await this.manager!.completeTask(taskId, taskResult);

      return {
        taskId,
        success: true,
        output: result.output,
      };
    } else {
      await this.manager!.failTask(taskId, result.error ?? 'Unknown error');

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

/** Returns process-wide `TaskIntegration` singleton. */
export function getTaskIntegration(): TaskIntegration {
  if (!taskIntegration) {
    taskIntegration = new TaskIntegration();
  }
  return taskIntegration;
}

/** Initializes the singleton integration instance. */
export async function initializeTaskIntegration(): Promise<void> {
  const integration = getTaskIntegration();
  await integration.initialize();
}
