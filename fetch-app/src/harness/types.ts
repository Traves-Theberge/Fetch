/**
 * @fileoverview Shared types for harness adapters, process lifecycle, and events.
 *
 * @module harness/types
 */

import type { AgentType, TaskId } from '../task/types.js';

// ============================================================================
// ID Types
// ============================================================================

/**
 * Identifier for a single harness execution.
 */
export type HarnessId = `hrn_${string}`;

// ============================================================================
// Enums (as union types)
// ============================================================================

/**
 * Lifecycle states for one harness process.
 */
export type HarnessStatus =
  | 'starting'
  | 'running'
  | 'waiting_input'
  | 'completed'
  | 'failed'
  | 'killed';

/**
 * Parsed output event types emitted from harness execution.
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
 * One parsed output event from a harness process.
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
 * Process configuration used by the spawner.
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

  /**
   * Optional container name for `docker exec` wrapping.
   */
  container?: string;
}

/**
 * Spawner input config.
 */
export interface SpawnConfig extends HarnessConfig {
  /** Optional background execution mode */
  background?: boolean;
}

/**
 * Runtime state tracked for a spawned harness process.
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
 * Concurrency and timeout defaults for the harness pool.
 */
export interface PoolConfig {
  maxConcurrent: number;
  defaultTimeoutMs: number;
}

/**
 * Default harness timeout from pipeline configuration.
 */
import { pipeline } from '../config/pipeline.js';
export const DEFAULT_HARNESS_TIMEOUT_MS = pipeline.harnessTimeout;

/**
 * Default kennel container name used by adapters.
 */
export const KENNEL_CONTAINER = 'fetch-kennel';

// ============================================================================
// Harness Adapters
// ============================================================================

/**
 * File paths grouped by change type inferred from harness output.
 */
export interface FileOperations {
  created: string[];
  modified: string[];
  deleted: string[];
}

/**
 * Contract implemented by each CLI-specific harness adapter.
 */
export interface HarnessAdapter {
  /** Agent type this adapter handles */
  readonly agent: AgentType;

  /**
   * Builds process config for a goal in a workspace.
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
   * Parses one output line into a structured event type when possible.
   *
   * @param line - Raw output line
   * @returns Parsed event type, or null if regular output
   */
  parseOutputLine(line: string): HarnessOutputEventType | null;

  /**
   * Detects whether current output requires user input.
   *
   * @param output - Recent output buffer
   * @returns The question text if detected, null otherwise
   */
  detectQuestion(output: string): string | null;

  /**
   * Formats user input before writing to harness stdin.
   *
   * @param response - User's response
   * @returns Formatted response for stdin
   */
  formatResponse(response: string): string;

  /**
   * Produces a short textual summary from full output.
   *
   * @param output - Full stdout buffer
   * @returns Summary string or null if none found
   */
  extractSummary(output: string): string | null;

  /**
   * Extracts created/modified/deleted paths from full output.
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
 * Stored execution record for one harness run.
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
 * Event topics emitted by the harness executor.
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
 * Event payload shared across harness event topics.
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
 * Normalized failure category for retry and reporting decisions.
 */
export type ErrorCategory = 'timeout' | 'network' | 'permission' | 'syntax' | 'process' | 'unknown';

/**
 * Final result returned by a harness execution.
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

  /** Classified error category for downstream handling */
  errorCategory?: ErrorCategory;

  /** Execution duration in milliseconds */
  durationMs: number;
}
