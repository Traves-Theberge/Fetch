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
