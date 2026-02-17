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
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getTaskManager, TaskManager } from './manager.js';
import { getHarnessExecutor } from '../harness/executor.js';
import { getAdapter } from '../harness/registry.js';
import { workspaceManager } from '../workspace/manager.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import type { Task, TaskId, AgentType } from './types.js';
import type { HarnessResult } from '../harness/types.js';
import { KENNEL_CONTAINER } from '../harness/types.js';

const execFileAsync = promisify(execFile);

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

const MAX_SUMMARY_LENGTH = 1200;
const STRUCTURED_EVENT_PREFIX = /^(thread|turn|item)\./;

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
      await this.prepareAgentRuntime(agent);

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
      return this.processResult(task.id, result, agent);
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

  /**
   * Cancel active harness execution for a task, if any.
   *
   * @returns true when a live harness process was signaled for termination.
   */
  cancelExecution(taskId: TaskId): boolean {
    const executor = getHarnessExecutor();
    const execution = executor.getExecutionForTask(taskId);
    if (!execution) return false;
    if (!['starting', 'running', 'waiting_input'].includes(execution.status)) {
      return false;
    }

    executor.kill(execution.id);
    this.activeExecutions.delete(taskId);
    return true;
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

  /**
   * Performs lightweight runtime checks/repairs before launching a harness.
   */
  private async prepareAgentRuntime(agent: AgentType): Promise<void> {
    if (agent !== 'codex') return;
    await this.cleanupBrokenCodexSkillSymlinks();
  }

  /**
   * Removes broken symlinks under `/root/.codex/skills` in the kennel container.
   *
   * Codex can fail fast when one dangling skill symlink is present. We prune
   * only links that do not resolve so valid custom skills remain untouched.
   */
  private async cleanupBrokenCodexSkillSymlinks(): Promise<void> {
    const script = [
      'set -e',
      'skills_dir="/root/.codex/skills"',
      'if [ ! -d "$skills_dir" ]; then echo "ok"; exit 0; fi',
      'cleaned=0',
      'while IFS= read -r -d "" link; do',
      '  if [ -L "$link" ] && [ ! -e "$link" ]; then',
      '    rm -f "$link"',
      '    cleaned=$((cleaned + 1))',
      '  fi',
      'done < <(find "$skills_dir" -mindepth 1 -maxdepth 1 -type l -print0 2>/dev/null)',
      'if [ "$cleaned" -gt 0 ]; then echo "cleaned:$cleaned"; else echo "ok"; fi',
    ].join('; ');

    try {
      const { stdout } = await execFileAsync(
        'docker',
        ['exec', KENNEL_CONTAINER, 'bash', '-lc', script],
        { timeout: 8000, maxBuffer: 1024 * 256 }
      );

      const output = String(stdout ?? '').trim();
      if (output.startsWith('cleaned:')) {
        logger.warn(`Pre-task Codex skill cleanup applied (${output})`);
      }
    } catch (error) {
      logger.warn('Pre-task Codex skill cleanup skipped', error);
    }
  }

  /** Maps a harness result into task-manager completion/failure updates. */
  private async processResult(
    taskId: TaskId,
    result: HarnessResult,
    agent: AgentType
  ): Promise<TaskExecutionResult> {
    if (result.success) {
      const summary = this.buildUserFacingSummary(agent, result.output ?? '');

      // Build TaskResult object
      // Note: filesModified would be parsed from output in real implementation
      const taskResult = {
        success: true,
        summary,
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
        output: summary,
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

  /**
   * Converts raw harness output into a concise, user-facing completion summary.
   */
  private buildUserFacingSummary(agent: AgentType, output: string): string {
    try {
      const adapter = getAdapter(agent);
      const extracted = adapter.extractSummary(output) ?? '';
      const cleaned = this.cleanSummaryText(extracted);
      if (cleaned) return cleaned;
    } catch (error) {
      logger.warn('Failed to extract adapter summary; using fallback summarizer', error);
    }

    const fallback = this.cleanSummaryText(output);
    return fallback || 'Task completed successfully.';
  }

  /**
   * Strips structured event noise and bounds message size for notifications.
   */
  private cleanSummaryText(text: string): string {
    if (!text) return '';

    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !this.isStructuredHarnessEventLine(line))
      .filter((line) => !line.startsWith('```'))
      .filter((line) => !line.startsWith('```json'));

    const compact = lines.join('\n').trim();
    if (!compact) return '';
    if (compact.length <= MAX_SUMMARY_LENGTH) return compact;
    return `${compact.slice(0, MAX_SUMMARY_LENGTH).trim()}...`;
  }

  /**
   * Detects Codex/structured JSONL lifecycle events that should not surface to users.
   */
  private isStructuredHarnessEventLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;
    try {
      const parsed = JSON.parse(trimmed) as {
        type?: unknown;
        item?: { type?: unknown };
      };
      const type = typeof parsed.type === 'string' ? parsed.type : '';
      if (STRUCTURED_EVENT_PREFIX.test(type)) return true;

      const itemType = typeof parsed.item?.type === 'string' ? parsed.item.type : '';
      return itemType === 'command_execution' || itemType === 'reasoning' || itemType === 'file_change';
    } catch {
      return false;
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
