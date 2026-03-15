/**
 * @fileoverview Shared tool execution contracts.
 * @module tools/types
 */

// ============================================================================
// Tool Context
// ============================================================================

/** Supported autonomy levels passed from session preferences. */
export type ToolAutonomyLevel = 'supervised' | 'cautious' | 'autonomous';

/** Per-call context passed from agent loop into tool handlers. */
export interface ToolContext {
  /** Session ID for session-aware tools */
  sessionId?: string;
  /** Current autonomy level for ask_user behavior and registry safety policy */
  autonomyLevel?: ToolAutonomyLevel;
}

// ============================================================================
// Tool Result
// ============================================================================

/** Standard return shape from all tool handlers. */
export interface ToolResult {
  /** Whether the tool executed successfully */
  success: boolean;
  /** Output content */
  output: string;
  /** Short human-readable summary for WhatsApp display (max ~200 chars) */
  summary?: string;
  /** Error message if failed */
  error?: string;
  /** Execution duration in ms */
  duration: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Danger Level
// ============================================================================

/** Risk classification used for orchestration/safety policy. */
export enum DangerLevel {
  /** No risk — read-only or informational */
  SAFE = 'safe',
  /** Some risk — may modify state */
  MODERATE = 'moderate',
  /** High risk — destructive or irreversible */
  DANGEROUS = 'dangerous',
}

// ============================================================================
// Tool Permission & Execution Mode
// ============================================================================

/** Permission level controlling what a tool can do locally. */
export enum ToolPermission {
  /** Can only read state (filesystem reads, listing, status queries) */
  READ = 'read',
  /** Can read and modify state (file writes, creates, deletes) */
  WRITE = 'write',
  /** Full access including process execution (shell, docker, browser) */
  EXECUTE = 'execute',
}

/** Execution environment the session is running in. */
export enum ExecutionMode {
  /** Running on the local host — all tools available */
  LOCAL = 'local',
  /** Running in a cloud/remote context — local-only tools blocked */
  CLOUD = 'cloud',
}

// ============================================================================
// Tool Usage Statistics
// ============================================================================

/** Per-tool usage and error tracking counters. */
export interface ToolUsageStats {
  /** Total number of successful executions */
  successCount: number;
  /** Total number of failed executions */
  errorCount: number;
  /** Cumulative execution time in ms */
  totalDuration: number;
  /** Timestamp of last execution (epoch ms) */
  lastUsed: number;
}
