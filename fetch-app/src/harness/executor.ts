/**
 * @fileoverview Harness execution engine
 *
 * The HarnessExecutor manages the spawning and lifecycle of external
 * coding agent processes (Claude CLI, Gemini CLI, Copilot CLI).
 *
 * @module harness/executor
 * @see {@link HarnessAdapter} - Agent-specific adapters
 * @see {@link TaskManager} - Task lifecycle
 *
 * ## Overview
 *
 * The HarnessExecutor:
 * - Spawns harness processes with proper configuration
 * - Streams output in real-time
 * - Detects questions and completion
 * - Handles timeouts and errors
 * - Provides stdin for user responses
 *
 * ## Execution Flow
 *
 * ```
 * 1. Build config (from adapter)
 * 2. Spawn process
 * 3. Stream stdout/stderr
 * 4. Parse output for events
 * 5. Handle questions (pause, wait for input)
 * 6. Detect completion
 * 7. Return result
 * ```
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import type { TaskId, AgentType } from '../task/types.js';
import { getHarnessPool } from './pool.js'; // V3 Pool Integration
import type {
  HarnessId,
  HarnessStatus,
  HarnessConfig,
  HarnessExecution,
  HarnessResult,
  HarnessOutputEventType,
  HarnessOutputEvent,
  HarnessEvent,
  HarnessEventType,
  HarnessAdapter,
} from './types.js';

// ============================================================================
// HarnessExecutor Class
// ============================================================================

/**
 * Harness process executor
 *
 * Manages the lifecycle of external coding agent processes.
 * Emits events for output, questions, and completion.
 *
 * @example
 * ```typescript
 * const executor = new HarnessExecutor();
 *
 * executor.on('harness:output', (event) => {
 *   console.log(event.data);
 * });
 *
 * const result = await executor.execute(taskId, adapter, {
 *   command: 'claude',
 *   args: ['--print', '-p', 'Add tests'],
 *   env: {},
 *   cwd: '/workspace/my-project',
 *   timeoutMs: 300000
 * });
 * ```
 */
export class HarnessExecutor extends EventEmitter {
  /** Active executions */
  private executions: Map<HarnessId, HarnessExecution> = new Map();

  /** Registered adapters */
  private adapters: Map<AgentType, HarnessAdapter> = new Map();

  // ==========================================================================
  // Adapter Registration
  // ==========================================================================

  /**
   * Register a harness adapter
   *
   * @param adapter - Adapter to register
   */
  registerAdapter(adapter: HarnessAdapter): void {
    this.adapters.set(adapter.agent, adapter);
    logger.debug(`Registered harness adapter: ${adapter.agent}`);
  }

  /**
   * Get a registered adapter
   *
   * @param agent - Agent type
   * @returns Adapter or undefined
   */
  getAdapter(agent: AgentType): HarnessAdapter | undefined {
    return this.adapters.get(agent);
  }

  // ==========================================================================
  // Execution
  // ==========================================================================

  /**
   * Execute a harness for a task
   *
   * @param taskId - Parent task ID
   * @param agent - Agent type to execute
   * @param goal - Task goal
   * @param workspacePath - Absolute path to workspace
   * @param timeoutMs - Execution timeout
   * @returns Harness execution result
   */
  async execute(
    taskId: TaskId,
    agent: AgentType,
    goal: string,
    workspacePath: string,
    timeoutMs: number
  ): Promise<HarnessResult> {
    const adapter = this.adapters.get(agent);
    if (!adapter) {
      throw new Error(`No adapter registered for agent: ${agent}`);
    }

    const config = adapter.buildConfig(goal, workspacePath, timeoutMs);
    return this.executeWithConfig(taskId, agent, config);
  }

  /**
   * Execute a harness with explicit configuration
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
    const pool = getHarnessPool();
    
    // 1. Acquire instance (manages concurrency)
    let instance;
    try {
      instance = await pool.acquire({
        command: config.command,
        args: config.args,
        env: config.env,
        cwd: config.cwd,
        timeoutMs: config.timeoutMs
      });
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
    this.emitHarnessEvent('harness:started', harnessId, taskId);

    logger.info(`Harness started via pool: ${harnessId}`, {
      agent,
      command: config.command,
      cwd: config.cwd,
    });

    // 3. Setup event listeners
    const spawner = pool.getSpawner();
    
    const outputHandler = (event: { id: HarnessId, type: string, data: string }) => {
      if (event.id === harnessId) {
        const timestamp = new Date().toISOString();
        const outputEvent: HarnessOutputEvent = {
          type: event.type as HarnessOutputEventType,
          data: event.data,
          timestamp
        };
        execution.events.push(outputEvent);
        this.emitHarnessEvent('harness:output', harnessId, taskId, outputEvent);
      }
    };
    
    const statusHandler = (event: { id: HarnessId, status: HarnessStatus }) => {
      if (event.id === harnessId) {
        this.updateStatus(harnessId, event.status);
      }
    };

    spawner.on('output', outputHandler);
    spawner.on('status', statusHandler);

    try {
      const finalInstance = await pool.waitFor(harnessId);
      
      const success = finalInstance.status === 'completed';
      const output = finalInstance.stdout.join('') + finalInstance.stderr.join(''); // Note: simplistic concatenation
      
      if (success) {
          this.updateStatus(harnessId, 'completed');
          this.emitHarnessEvent('harness:completed', harnessId, taskId);
      } else {
          this.updateStatus(harnessId, 'failed');
          this.emitHarnessEvent('harness:failed', harnessId, taskId, { 
              error: `Process failed with status: ${finalInstance.status}` 
          });
      }

      return {
        success,
        output,
        exitCode: success ? 0 : 1,
        error: success ? undefined : `Process execution status: ${finalInstance.status}`,
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
   * Send input to a waiting harness
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
    const adapter = this.adapters.get(execution.agent);
    const formattedInput = adapter?.formatResponse(input) ?? input + '\n';

    const pool = getHarnessPool();
    const sent = pool.sendInput(harnessId, formattedInput);
    if (!sent) {
      throw new Error(`Failed to send input to harness: ${harnessId} (process not writable)`);
    }

    this.updateStatus(harnessId, 'running');
    logger.debug(`Sent input to harness: ${harnessId}`, { input });
  }

  /**
   * Kill a running harness
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
   * Get a harness execution by ID
   *
   * @param harnessId - Harness ID
   * @returns Execution or undefined
   */
  getExecution(harnessId: HarnessId): HarnessExecution | undefined {
    return this.executions.get(harnessId);
  }

  /**
   * Get harness execution for a task
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
   * Check if a harness is running
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
   * Update execution status
   */
  private updateStatus(harnessId: HarnessId, status: HarnessStatus): void {
    const execution = this.executions.get(harnessId);
    if (execution) {
      execution.status = status;
    }
  }

  /**
   * Add output event to execution
   */
  private addOutputEvent(
    harnessId: HarnessId,
    type: HarnessOutputEventType,
    data: string
  ): void {
    const execution = this.executions.get(harnessId);
    if (execution) {
      execution.events.push({
        type,
        data,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Emit harness event
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
   * Get an active execution by task ID
   */
  getActiveExecution(taskId: TaskId): HarnessExecution | undefined {
    for (const execution of this.executions.values()) {
      if (execution.taskId === taskId && execution.status === 'running') {
        return execution;
      }
    }
    return undefined;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global harness executor instance
 */
export const harnessExecutor = new HarnessExecutor();

/**
 * Get the harness executor singleton
 */
export function getHarnessExecutor(): HarnessExecutor {
  return harnessExecutor;
}
