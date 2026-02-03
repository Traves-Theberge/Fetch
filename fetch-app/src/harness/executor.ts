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

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { generateHarnessId } from '../utils/id.js';
import type { TaskId, AgentType } from '../task/types.js';
import type {
  HarnessId,
  HarnessStatus,
  HarnessConfig,
  HarnessExecution,
  HarnessResult,
  HarnessOutputEventType,
  HarnessEvent,
  HarnessEventType,
  HarnessAdapter,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum output buffer size (1MB)
 */
const MAX_OUTPUT_BUFFER = 1024 * 1024;

/**
 * Output line patterns that indicate a question
 */
const QUESTION_PATTERNS = [
  /\?\s*$/,                    // Ends with ?
  /\[y\/n\]/i,                 // Yes/no prompt
  /\(yes\/no\)/i,              // Yes/no prompt
  /press enter/i,              // Press enter prompt
  /continue\?/i,               // Continue prompt
  /proceed\?/i,                // Proceed prompt
  /confirm/i,                  // Confirmation prompt
];

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

  /** Active processes */
  private processes: Map<HarnessId, ChildProcess> = new Map();

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
    const harnessId = generateHarnessId();

    // Create execution record
    const execution: HarnessExecution = {
      id: harnessId,
      taskId,
      agent,
      status: 'starting',
      config,
      events: [],
      startedAt: new Date().toISOString(),
    };

    this.executions.set(harnessId, execution);
    this.emitHarnessEvent('harness:started', harnessId, taskId);

    logger.info(`Harness starting: ${harnessId}`, {
      agent,
      command: config.command,
      cwd: config.cwd,
    });

    try {
      const result = await this.spawnAndWait(harnessId, execution, config);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateStatus(harnessId, 'failed');
      this.emitHarnessEvent('harness:failed', harnessId, taskId, { error: errorMessage });

      return {
        success: false,
        output: this.getOutputBuffer(harnessId),
        exitCode: 1,
        error: errorMessage,
        durationMs: Date.now() - new Date(execution.startedAt).getTime(),
      };
    }
  }

  /**
   * Send input to a waiting harness
   *
   * @param harnessId - Harness ID
   * @param input - Input to send
   */
  sendInput(harnessId: HarnessId, input: string): void {
    const process = this.processes.get(harnessId);
    const execution = this.executions.get(harnessId);

    if (!process || !execution) {
      throw new Error(`Harness not found: ${harnessId}`);
    }

    if (execution.status !== 'waiting_input') {
      throw new Error(`Harness is not waiting for input: ${execution.status}`);
    }

    // Get adapter to format response
    const adapter = this.adapters.get(execution.agent);
    const formattedInput = adapter?.formatResponse(input) ?? input + '\n';

    process.stdin?.write(formattedInput);
    this.updateStatus(harnessId, 'running');

    logger.debug(`Sent input to harness: ${harnessId}`, { input });
  }

  /**
   * Kill a running harness
   *
   * @param harnessId - Harness ID
   * @param signal - Signal to send (default: SIGTERM)
   */
  kill(harnessId: HarnessId, signal: NodeJS.Signals = 'SIGTERM'): void {
    const process = this.processes.get(harnessId);
    const execution = this.executions.get(harnessId);

    if (process && execution) {
      process.kill(signal);
      this.updateStatus(harnessId, 'killed');
      this.emitHarnessEvent('harness:killed', harnessId, execution.taskId);

      logger.warn(`Harness killed: ${harnessId}`, { signal });
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
   * Spawn process and wait for completion
   */
  private async spawnAndWait(
    harnessId: HarnessId,
    execution: HarnessExecution,
    config: HarnessConfig
  ): Promise<HarnessResult> {
    return new Promise((resolve, reject) => {
      let outputBuffer = '';
      let timeoutHandle: NodeJS.Timeout | null = null;

      // Spawn process
      const childProcess = spawn(config.command, config.args, {
        cwd: config.cwd,
        env: { ...globalThis.process.env, ...config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      execution.pid = childProcess.pid;
      this.processes.set(harnessId, childProcess);
      this.updateStatus(harnessId, 'running');

      // Set timeout
      timeoutHandle = setTimeout(() => {
        logger.warn(`Harness timeout: ${harnessId}`);
        childProcess.kill('SIGTERM');
        this.updateStatus(harnessId, 'killed');
      }, config.timeoutMs);

      // Handle stdout
      childProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        outputBuffer += text;

        // Trim buffer if too large
        if (outputBuffer.length > MAX_OUTPUT_BUFFER) {
          outputBuffer = outputBuffer.slice(-MAX_OUTPUT_BUFFER);
        }

        // Add event
        this.addOutputEvent(harnessId, 'stdout', text);

        // Check for questions
        if (this.isQuestion(text)) {
          this.updateStatus(harnessId, 'waiting_input');
          const question = this.extractQuestion(text);
          this.emitHarnessEvent('harness:question', harnessId, execution.taskId, { question });
        }

        // Emit output event
        this.emitHarnessEvent('harness:output', harnessId, execution.taskId, {
          type: 'stdout',
          data: text,
        });
      });

      // Handle stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        outputBuffer += text;

        this.addOutputEvent(harnessId, 'stderr', text);
        this.emitHarnessEvent('harness:output', harnessId, execution.taskId, {
          type: 'stderr',
          data: text,
        });
      });

      // Handle error
      childProcess.on('error', (error: Error) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.processes.delete(harnessId);
        reject(error);
      });

      // Handle exit
      childProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.processes.delete(harnessId);

        const exitCode = code ?? (signal ? 128 : 1);
        execution.exitCode = exitCode;
        execution.completedAt = new Date().toISOString();

        const success = exitCode === 0;
        this.updateStatus(harnessId, success ? 'completed' : 'failed');

        if (success) {
          this.emitHarnessEvent('harness:completed', harnessId, execution.taskId);
        } else {
          this.emitHarnessEvent('harness:failed', harnessId, execution.taskId, {
            exitCode,
            signal,
          });
        }

        const durationMs = Date.now() - new Date(execution.startedAt).getTime();

        logger.info(`Harness finished: ${harnessId}`, {
          exitCode,
          durationMs,
          success,
        });

        resolve({
          success,
          output: outputBuffer,
          exitCode,
          error: success ? undefined : `Process exited with code ${exitCode}`,
          durationMs,
        });
      });
    });
  }

  /**
   * Check if output contains a question
   */
  private isQuestion(text: string): boolean {
    return QUESTION_PATTERNS.some((pattern) => pattern.test(text));
  }

  /**
   * Extract question from output
   */
  private extractQuestion(text: string): string {
    // Get last non-empty line as the question
    const lines = text.trim().split('\n');
    return lines[lines.length - 1].trim();
  }

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
   * Get accumulated output buffer for a harness
   */
  private getOutputBuffer(harnessId: HarnessId): string {
    const execution = this.executions.get(harnessId);
    if (!execution) return '';

    return execution.events
      .filter((e) => e.type === 'stdout' || e.type === 'stderr')
      .map((e) => e.data)
      .join('');
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
