/**
 * @fileoverview Tool Type Definitions
 * @module tools/types
 */

// ============================================================================
// Tool Result
// ============================================================================

/**
 * Result returned from a tool execution.
 */
export interface ToolResult {
  /** Whether the tool executed successfully */
  success: boolean;
  /** Output content */
  output: string;
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

/**
 * Danger level classification for tool operations.
 * Controls whether user approval is required before execution.
 */
export enum DangerLevel {
  /** No risk — read-only or informational */
  SAFE = 'safe',
  /** Some risk — may modify state */
  MODERATE = 'moderate',
  /** High risk — destructive or irreversible */
  DANGEROUS = 'dangerous',
}
