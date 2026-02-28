/**
 * @fileoverview Executes harness processes and emits lifecycle/output events.
 *
 * @module harness/executor
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import type { TaskId, AgentType } from '../task/types.js';
import type { ProjectProfile } from '../workspace/types.js';
import { getHarnessPool } from './pool.js';
import { getAdapter as getRegistryAdapter } from './registry.js';
import type {
  HarnessId,
  HarnessStatus,
  HarnessConfig,
  HarnessExecution,
  HarnessResult,
  HarnessOutputEvent,
  HarnessEvent,
  HarnessEventType,
  ErrorCategory,
} from './types.js';

// ============================================================================
// HarnessExecutor Class
// ============================================================================

/**
 * Runtime coordinator for harness execution.
 *
 * Tracks active executions in memory and proxies pool/spawner events
 * into typed harness events.
 */
export class HarnessExecutor extends EventEmitter {
  private static readonly TERMINAL_RETENTION_TTL_MS = 15 * 60 * 1000;
  private static readonly MAX_TERMINAL_EXECUTIONS = 200;

  /** Active executions */
  private executions: Map<HarnessId, HarnessExecution> = new Map();

  // ==========================================================================
  // Execution
  // ==========================================================================

  /**
   * Executes an agent task by resolving adapter config and running it.
   *
   * @param taskId - Parent task ID
   * @param agent - Agent type to execute
   * @param goal - Task goal
   * @param workspacePath - Absolute path to workspace
   * @param timeoutMs - Execution timeout
   * @param profile - Optional project profile for context enrichment
   * @returns Harness execution result
   */
  async execute(
    taskId: TaskId,
    agent: AgentType,
    goal: string,
    workspacePath: string,
    timeoutMs: number,
    profile?: ProjectProfile
  ): Promise<HarnessResult> {
    if (!workspacePath) {
      return { success: false, output: '', exitCode: 1, error: 'Workspace path is required', durationMs: 0 };
    }

    // Enrich goal with project context when profile is available
    const enrichedGoal = profile ? enrichGoalWithProfile(goal, profile) : goal;

    const adapter = getRegistryAdapter(agent);
    const config = adapter.buildConfig(enrichedGoal, workspacePath, timeoutMs);
    return this.executeWithConfig(taskId, agent, config);
  }

  /**
   * Executes a harness with an already-built process configuration.
   *
   * @param taskId - Parent task ID
   * @param agent - Agent type
   * @param config - Harness configuration
   * @returns Harness execution result
   */
  async executeWithConfig(
    taskId: TaskId,
    agent: AgentType,
    config: HarnessConfig
  ): Promise<HarnessResult> {
    this.pruneTerminalExecutions();

    const adapter = getRegistryAdapter(agent);
    const pool = getHarnessPool();

    // 1. Acquire instance (manages concurrency)
    let instance;
    try {
      instance = await pool.acquire(config);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to acquire harness from pool: ${errorMsg}`);
      return {
        success: false,
        output: '',
        exitCode: 1,
        error: errorMsg,
        durationMs: 0
      };
    }

    const harnessId = instance.id;

    // 2. Create execution record
    const execution: HarnessExecution = {
      id: harnessId,
      taskId,
      agent,
      status: 'starting',
      config,
      events: [],
      startedAt: new Date(instance.startTime).toISOString(),
    };

    this.executions.set(harnessId, execution);

    if (instance.pid) {
      execution.pid = instance.pid;
    }

    this.emitHarnessEvent('harness:started', harnessId, taskId);

    logger.info(`Harness started via pool: ${harnessId}`, {
      agent,
      command: config.command,
      cwd: config.cwd,
    });

    // 3. Setup event listeners
    const spawner = pool.getSpawner();
    let recentOutput = '';
    const streamBuffers: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };

    const processOutputLine = (line: string, stream: 'stdout' | 'stderr'): void => {
      const timestamp = new Date().toISOString();
      const trimmedLine = line.trimEnd();
      const outputEvent: HarnessOutputEvent = {
        type: stream,
        data: trimmedLine,
        line: trimmedLine,
        timestamp,
      };
      execution.events.push(outputEvent);
      this.emitHarnessEvent('harness:output', harnessId, taskId, outputEvent);

      // Keep a bounded tail for adapter-level question detection.
      recentOutput = `${recentOutput}\n${trimmedLine}`;
      if (recentOutput.length > 12000) {
        recentOutput = recentOutput.slice(-12000);
      }

      const eventType = adapter.parseOutputLine(trimmedLine);
      if (eventType === 'question') {
        const question = adapter.detectQuestion(recentOutput) ?? trimmedLine;
        this.updateStatus(harnessId, 'waiting_input');
        this.emitHarnessEvent('harness:question', harnessId, taskId, { question, line: trimmedLine });
        return;
      }

      if (eventType === 'progress') {
        this.emitHarnessEvent('harness:progress', harnessId, taskId, { message: trimmedLine, line: trimmedLine });
      }

      const fileOps = adapter.extractFileOperations(trimmedLine);
      if (fileOps.created.length || fileOps.modified.length || fileOps.deleted.length) {
        this.emitHarnessEvent('harness:file_op', harnessId, taskId, fileOps);
      }
    };

    const outputHandler = (event: { id: HarnessId, type: string, data: string }) => {
      if (event.id === harnessId) {
        const stream = event.type === 'stderr' ? 'stderr' : 'stdout';

        // Log output for debugging (INFO level to force visibility)
        if (stream === 'stderr') {
          logger.info(`[${harnessId}] stderr: ${event.data.trim()}`);
        } else {
          logger.info(`[${harnessId}] stdout: ${event.data.trim()}`);
        }

        // Convert stream chunks into complete lines so adapters can parse reliably.
        const normalizedChunk = event.data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        streamBuffers[stream] += normalizedChunk;

        const lines = streamBuffers[stream].split('\n');
        streamBuffers[stream] = lines.pop() ?? '';
        for (const line of lines) {
          processOutputLine(line, stream);
        }
      }
    };

    const statusHandler = (event: { id: HarnessId, status: HarnessStatus }) => {
      if (event.id === harnessId) {
        if (['completed', 'failed', 'killed'].includes(event.status)) {
          // Flush any trailing partial line before terminal state.
          for (const stream of ['stdout', 'stderr'] as const) {
            const tail = streamBuffers[stream];
            if (tail.length > 0) {
              processOutputLine(tail, stream);
              streamBuffers[stream] = '';
            }
          }
        }
        this.updateStatus(harnessId, event.status);
      }
    };

    spawner.on('output', outputHandler);
    spawner.on('status', statusHandler);

    try {
      const finalInstance = await pool.waitFor(harnessId);

      const success = finalInstance.status === 'completed';
      execution.exitCode = success ? 0 : 1;
      execution.completedAt = new Date().toISOString();

      const output = finalInstance.stdout.join('') + finalInstance.stderr.join(''); // Note: simplistic concatenation

      const errorOutput = finalInstance.stderr.length > 0
        ? finalInstance.stderr.slice(-3).join('').trim()
        : finalInstance.stdout.slice(-3).join('').trim();

      const errorMsg = errorOutput
        ? `Process failed: ${errorOutput}`
        : `Process execution status: ${finalInstance.status}`;

      if (success) {
        this.updateStatus(harnessId, 'completed');
        this.emitHarnessEvent('harness:completed', harnessId, taskId);
      } else {
        this.updateStatus(harnessId, 'failed');
        this.emitHarnessEvent('harness:failed', harnessId, taskId, {
          error: errorMsg
        });
      }

      const errorCategory = success ? undefined : classifyError(finalInstance, errorMsg);
      if (errorCategory) {
        logger.warn(`Harness ${harnessId} error classified as: ${errorCategory}`);
      }

      return {
        success,
        output,
        exitCode: success ? 0 : 1,
        error: success ? undefined : errorMsg,
        errorCategory,
        durationMs: Date.now() - finalInstance.startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateStatus(harnessId, 'failed');
      this.emitHarnessEvent('harness:failed', harnessId, taskId, { error: errorMessage });

      return {
        success: false,
        output: '',
        exitCode: 1,
        error: errorMessage,
        durationMs: Date.now() - new Date(execution.startedAt).getTime(),
      };
    } finally {
      spawner.off('output', outputHandler);
      spawner.off('status', statusHandler);
    }
  }

  /**
   * Sends user input to a harness waiting on stdin.
   *
   * @param harnessId - Harness ID
   * @param input - Input to send
   */
  sendInput(harnessId: HarnessId, input: string): void {
    const execution = this.executions.get(harnessId);

    if (!execution) {
      throw new Error(`Harness not found: ${harnessId}`);
    }

    if (execution.status !== 'waiting_input') {
      throw new Error(`Harness is not waiting for input: ${execution.status}`);
    }

    // Get adapter to format response
    let formattedInput: string;
    try {
      const adapter = getRegistryAdapter(execution.agent);
      formattedInput = adapter.formatResponse(input);
    } catch {
      formattedInput = input + '\n';
    }

    const pool = getHarnessPool();
    const sent = pool.sendInput(harnessId, formattedInput);
    if (!sent) {
      throw new Error(`Failed to send input to harness: ${harnessId} (process not writable)`);
    }

    this.updateStatus(harnessId, 'running');
    logger.debug(`Sent input to harness: ${harnessId}`, { input });
  }

  /**
   * Clears in-memory execution state and removes executor listeners.
   */
  public shutdown(): void {
    this.executions.clear();
    this.removeAllListeners();
  }

  /**
   * Requests process termination for a running harness.
   *
   * @param harnessId - Harness ID
   * @param signal - Signal to send (default: SIGTERM)
   */
  kill(harnessId: HarnessId): void {
    const execution = this.executions.get(harnessId);
    if (!execution) return;

    const pool = getHarnessPool();
    const killed = pool.kill(harnessId);

    if (killed) {
      this.updateStatus(harnessId, 'killed');
      this.emitHarnessEvent('harness:killed', harnessId, execution.taskId);
      logger.warn(`Harness killed: ${harnessId}`);
    }
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Returns execution record for a harness id.
   *
   * @param harnessId - Harness ID
   * @returns Execution or undefined
   */
  getExecution(harnessId: HarnessId): HarnessExecution | undefined {
    return this.executions.get(harnessId);
  }

  /**
   * Returns the most recent execution for a task id.
   *
   * @param taskId - Task ID
   * @returns Most recent execution for task, or undefined
   */
  getExecutionForTask(taskId: TaskId): HarnessExecution | undefined {
    return Array.from(this.executions.values())
      .filter((e) => e.taskId === taskId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  }

  /**
   * Returns true when execution state is active.
   *
   * @param harnessId - Harness ID
   * @returns True if running
   */
  isRunning(harnessId: HarnessId): boolean {
    const execution = this.executions.get(harnessId);
    return execution !== undefined && ['starting', 'running', 'waiting_input'].includes(execution.status);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Updates execution status in local state.
   */
  private updateStatus(harnessId: HarnessId, status: HarnessStatus): void {
    const execution = this.executions.get(harnessId);
    if (execution) {
      execution.status = status;
      if (['completed', 'failed', 'killed'].includes(status) && !execution.completedAt) {
        execution.completedAt = new Date().toISOString();
        setImmediate(() => this.pruneTerminalExecutions());
      }
    }
  }

  /**
   * Emits a typed harness event and a wildcard mirror event.
   */
  private emitHarnessEvent(
    type: HarnessEventType,
    harnessId: HarnessId,
    taskId: TaskId,
    data?: unknown
  ): void {
    const event: HarnessEvent = {
      type,
      harnessId,
      taskId,
      timestamp: new Date().toISOString(),
      data,
    };
    this.emit(type, event);
    this.emit('harness:*', event); // Wildcard for all harness events
  }

  /**
   * Returns the active running execution for a task, if any.
   */
  getActiveExecution(taskId: TaskId): HarnessExecution | undefined {
    for (const execution of this.executions.values()) {
      if (execution.taskId === taskId && execution.status === 'running') {
        return execution;
      }
    }
    return undefined;
  }

  /**
   * Prunes old terminal executions to keep in-memory history bounded.
   */
  private pruneTerminalExecutions(): void {
    const now = Date.now();
    const terminalEntries = Array.from(this.executions.entries())
      .filter(([, execution]) => ['completed', 'failed', 'killed'].includes(execution.status));

    for (const [id, execution] of terminalEntries) {
      const endedAtMs = execution.completedAt
        ? new Date(execution.completedAt).getTime()
        : new Date(execution.startedAt).getTime();
      if (now - endedAtMs > HarnessExecutor.TERMINAL_RETENTION_TTL_MS) {
        this.executions.delete(id);
      }
    }

    const retainedTerminal = Array.from(this.executions.entries())
      .filter(([, execution]) => ['completed', 'failed', 'killed'].includes(execution.status))
      .sort((a, b) => {
        const aEnded = a[1].completedAt ? new Date(a[1].completedAt).getTime() : new Date(a[1].startedAt).getTime();
        const bEnded = b[1].completedAt ? new Date(b[1].completedAt).getTime() : new Date(b[1].startedAt).getTime();
        return aEnded - bEnded;
      });

    if (retainedTerminal.length <= HarnessExecutor.MAX_TERMINAL_EXECUTIONS) {
      return;
    }

    const overflow = retainedTerminal.length - HarnessExecutor.MAX_TERMINAL_EXECUTIONS;
    for (const [id] of retainedTerminal.slice(0, overflow)) {
      this.executions.delete(id);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton executor instance.
 */
export const harnessExecutor = new HarnessExecutor();

/**
 * Returns the singleton executor.
 */
export function getHarnessExecutor(): HarnessExecutor {
  return harnessExecutor;
}

// ============================================================================
// Goal Enrichment
// ============================================================================

/**
 * Appends project profile metadata to a goal before delegation.
 */
function enrichGoalWithProfile(goal: string, profile: ProjectProfile): string {
  const lines: string[] = [goal, '', '--- Project Context ---'];
  lines.push(`Language: ${profile.language}`);
  if (profile.framework) lines.push(`Framework: ${profile.framework}`);
  if (profile.packageManager) lines.push(`Package Manager: ${profile.packageManager}`);
  if (profile.testCommand) lines.push(`Test Command: ${profile.testCommand}`);
  if (profile.buildCommand) lines.push(`Build Command: ${profile.buildCommand}`);
  if (profile.entryPoints.length > 0) lines.push(`Entry Points: ${profile.entryPoints.join(', ')}`);
  return lines.join('\n');
}

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Classifies harness failures into normalized error categories.
 */
function classifyError(
  instance: { status: string; stderr: string[] },
  errorMsg: string
): ErrorCategory {
  const stderr = instance.stderr.join('').toLowerCase();
  const combined = (errorMsg + ' ' + stderr).toLowerCase();

  // Timeout: process was killed after exceeding time limit
  // Exit code 124 = GNU timeout, 137 = SIGKILL (128+9). On Windows, look for known timeout strings.
  if (instance.status === 'killed' || /exit code (124|137)/.test(combined) || /timed?\s*out/i.test(combined)) {
    return 'timeout';
  }

  // Network: connection failures
  if (/econnrefused|enotfound|enetunreach|etimedout|network/.test(combined)) {
    return 'network';
  }

  // Permission: access denied
  if (/permission denied|eacces|eperm|forbidden/.test(combined)) {
    return 'permission';
  }

  // Syntax: code-level errors
  if (/syntaxerror|typeerror|referenceerror|cannot find module|unexpected token/.test(combined)) {
    return 'syntax';
  }

  // Process: generic non-zero exit
  if (instance.status === 'failed') {
    return 'process';
  }

  return 'unknown';
}
