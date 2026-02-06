/**
 * @fileoverview Harness domain types and interfaces
 *
 * Defines all types related to harness execution in Fetch v2.
 * Harnesses are adapters that execute coding tasks via external CLI tools
 * (Claude Code, Gemini CLI, Copilot CLI).
 *
 * @module harness/types
 * @see {@link HarnessExecutor} - Process management
 * @see {@link Task} - Parent task entity
 */

import type { AgentType, TaskId } from '../task/types.js';

// ============================================================================
// ID Types
// ============================================================================

/**
 * Unique identifier for harness executions
 *
 * Format: `hrn_{nanoid(8)}`
 *
 * @example
 * ```typescript
 * const harnessId: HarnessId = 'hrn_Xy7zW9qP';
 * ```
 */
export type HarnessId = `hrn_${string}`;

// ============================================================================
// Enums (as union types)
// ============================================================================

/**
 * Harness execution status
 *
 * | Status | Description |
 * |--------|-------------|
 * | starting | Process is being spawned |
 * | running | Process is actively executing |
 * | waiting_input | Process is waiting for stdin input |
 * | completed | Process exited successfully (code 0) |
 * | failed | Process exited with error (code != 0) |
 * | killed | Process was terminated by timeout or user |
 */
export type HarnessStatus =
  | 'starting'
  | 'running'
  | 'waiting_input'
  | 'completed'
  | 'failed'
  | 'killed';

/**
 * Output event types from harness process
 *
 * | Type | Description |
 * |------|-------------|
 * | stdout | Standard output line |
 * | stderr | Standard error line |
 * | question | Harness is asking a question |
 * | progress | Progress indicator detected |
 * | complete | Task completion detected |
 * | error | Error detected in output |
 */
export type HarnessOutputEventType =
  | 'stdout'
  | 'stderr'
  | 'question'
  | 'progress'
  | 'complete'
  | 'error';

// ============================================================================
// Event Types
// ============================================================================

/**
 * Output event from harness process
 *
 * Emitted when the harness produces output or changes state.
 */
export interface HarnessOutputEvent {
  /** Event type */
  type: HarnessOutputEventType;

  /** Event data (output text or parsed content) */
  data: string;

  /** ISO timestamp when event occurred */
  timestamp: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Harness execution configuration
 *
 * Defines how to spawn and manage the harness process.
 */
export interface HarnessConfig {
  /** Executable command (e.g., 'claude', 'gemini') */
  command: string;

  /** Command arguments */
  args: string[];

  /** Environment variables to set */
  env: Record<string, string>;

  /** Working directory for the process */
  cwd: string;

  /** Execution timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Harness Spawn Configuration
 */
export interface SpawnConfig extends HarnessConfig {
  /** Optional background execution mode */
  background?: boolean;
}

/**
 * Running Harness Instance
 */
export interface HarnessInstance {
  id: HarnessId;
  status: HarnessStatus;
  startTime: number;
  pid?: number;
  stdout: string[];
  stderr: string[];
  config: SpawnConfig;
}

/**
 * Pool Configuration
 */
export interface PoolConfig {
  maxConcurrent: number;
  defaultTimeoutMs: number;
}

/**
 * Default timeout for harness execution
 */
import { pipeline } from '../config/pipeline.js';
export const DEFAULT_HARNESS_TIMEOUT_MS = pipeline.harnessTimeout;

// ============================================================================
// Harness Adapters
// ============================================================================

/**
 * File operations performed by a harness
 */
export interface FileOperations {
  created: string[];
  modified: string[];
  deleted: string[];
}

/**
 * Harness adapter interface
 *
 * Each coding agent (Claude, Gemini, Copilot) implements this interface.
 */
export interface HarnessAdapter {
  /** Agent type this adapter handles */
  readonly agent: AgentType;

  /**
   * Build the execution configuration for a task
   *
   * @param goal - The task goal/request
   * @param workspacePath - Absolute path to the workspace
   * @param timeoutMs - Execution timeout
   * @returns Harness configuration
   */
  buildConfig(
    goal: string,
    workspacePath: string,
    timeoutMs: number
  ): HarnessConfig;

  /**
   * Parse a line of output to detect special events
   *
   * @param line - Raw output line
   * @returns Parsed event type, or null if regular output
   */
  parseOutputLine(line: string): HarnessOutputEventType | null;

  /**
   * Detect if the harness is asking a question
   *
   * @param output - Recent output buffer
   * @returns The question text if detected, null otherwise
   */
  detectQuestion(output: string): string | null;

  /**
   * Format a response to send to the harness stdin
   *
   * @param response - User's response
   * @returns Formatted response for stdin
   */
  formatResponse(response: string): string;

  /**
   * Extract a summary of changes from the harness output
   *
   * @param output - Full stdout buffer
   * @returns Summary string or null if none found
   */
  extractSummary(output: string): string | null;

  /**
   * Extract file operations from the harness output
   *
   * @param output - Full stdout buffer
   * @returns List of created, modified, and deleted files
   */
  extractFileOperations(output: string): FileOperations;
}

// ============================================================================
// Main Harness Execution Entity
// ============================================================================

/**
 * Harness execution instance
 *
 * Represents a single execution of a harness for a task.
 * One task may have multiple executions if retries occur.
 *
 * @example
 * ```typescript
 * const execution: HarnessExecution = {
 *   id: 'hrn_Xy7zW9qP',
 *   taskId: 'tsk_V1StGXR8_Z',
 *   agent: 'claude',
 *   status: 'running',
 *   pid: 12345,
 *   config: {
 *     command: 'claude',
 *     args: ['--print', '-p', 'Add dark mode...'],
 *     env: {},
 *     cwd: '/workspace/my-project',
 *     timeoutMs: 300000
 *   },
 *   events: [],
 *   startedAt: '2026-02-02T10:00:01.000Z'
 * };
 * ```
 */
export interface HarnessExecution {
  /** Unique execution identifier */
  id: HarnessId;

  /** Parent task ID */
  taskId: TaskId;

  /** Agent type being executed */
  agent: AgentType;

  /** Current execution status */
  status: HarnessStatus;

  /** Process ID (when running) */
  pid?: number;

  /** Execution configuration */
  config: HarnessConfig;

  /** Output events collected */
  events: HarnessOutputEvent[];

  /** Process exit code (when completed/failed) */
  exitCode?: number;

  /** ISO timestamp: execution started */
  startedAt: string;

  /** ISO timestamp: execution completed */
  completedAt?: string;
}

// ============================================================================
// Harness Events
// ============================================================================

/**
 * Harness event types for pub/sub
 */
export type HarnessEventType =
  | 'harness:started'
  | 'harness:output'
  | 'harness:progress'
  | 'harness:file_op'
  | 'harness:question'
  | 'harness:completed'
  | 'harness:failed'
  | 'harness:killed';

/**
 * Harness event payload
 */
export interface HarnessEvent {
  type: HarnessEventType;
  harnessId: HarnessId;
  taskId: TaskId;
  timestamp: string;
  data?: unknown;
}

// ============================================================================
// Harness Result
// ============================================================================

/**
 * Result of a harness execution
 *
 * Returned when the harness completes or fails.
 */
export interface HarnessResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Full output from the harness */
  output: string;

  /** Exit code from the process */
  exitCode: number;

  /** Error message if failed */
  error?: string;

  /** Execution duration in milliseconds */
  durationMs: number;
}
