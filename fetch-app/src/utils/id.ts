/**
 * @fileoverview ID generation utilities
 *
 * Provides functions to generate unique identifiers for all Fetch v2 entities.
 * Uses nanoid for URL-safe, collision-resistant IDs.
 *
 * @module utils/id
 *
 * ## ID Formats
 *
 * | Entity | Format | Length | Example |
 * |--------|--------|--------|---------|
 * | Task | `tsk_{nanoid(10)}` | 14 | `tsk_V1StGXR8_Z` |
 * | Session | `ses_{nanoid(8)}` | 12 | `ses_Ab3dE7gH` |
 * | Harness | `hrn_{nanoid(8)}` | 12 | `hrn_Xy7zW9qP` |
 * | Message | `msg_{nanoid(8)}` | 12 | `msg_Pq2rS4tU` |
 * | Progress | `prg_{nanoid(8)}` | 12 | `prg_Mn3oP5qR` |
 *
 * ## Usage
 *
 * ```typescript
 * import { generateTaskId, generateSessionId } from './utils/id.js';
 *
 * const taskId = generateTaskId();     // 'tsk_V1StGXR8_Z'
 * const sessionId = generateSessionId(); // 'ses_Ab3dE7gH'
 * ```
 */

import { nanoid } from 'nanoid';
import type { TaskId } from '../task/types.js';
import type { HarnessId } from '../harness/types.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Session ID type
 * Format: `ses_{nanoid(8)}`
 */
export type SessionId = `ses_${string}`;

/**
 * Message ID type
 * Format: `msg_{nanoid(8)}`
 */
export type MessageId = `msg_${string}`;

/**
 * Progress ID type
 * Format: `prg_{nanoid(8)}`
 */
export type ProgressId = `prg_${string}`;

// ============================================================================
// ID Generators
// ============================================================================

/**
 * Generate a unique task ID
 *
 * @returns Task ID in format `tsk_{nanoid(10)}`
 *
 * @example
 * ```typescript
 * const id = generateTaskId();
 * // id = 'tsk_V1StGXR8_Z'
 * ```
 */
export function generateTaskId(): TaskId {
  return `tsk_${nanoid(10)}` as TaskId;
}

/**
 * Generate a unique session ID
 *
 * @returns Session ID in format `ses_{nanoid(8)}`
 *
 * @example
 * ```typescript
 * const id = generateSessionId();
 * // id = 'ses_Ab3dE7gH'
 * ```
 */
export function generateSessionId(): SessionId {
  return `ses_${nanoid(8)}` as SessionId;
}

/**
 * Generate a unique harness execution ID
 *
 * @returns Harness ID in format `hrn_{nanoid(8)}`
 *
 * @example
 * ```typescript
 * const id = generateHarnessId();
 * // id = 'hrn_Xy7zW9qP'
 * ```
 */
export function generateHarnessId(): HarnessId {
  return `hrn_${nanoid(8)}` as HarnessId;
}

/**
 * Generate a unique message ID
 *
 * @returns Message ID in format `msg_{nanoid(8)}`
 *
 * @example
 * ```typescript
 * const id = generateMessageId();
 * // id = 'msg_Pq2rS4tU'
 * ```
 */
export function generateMessageId(): MessageId {
  return `msg_${nanoid(8)}` as MessageId;
}

/**
 * Generate a unique progress entry ID
 *
 * @returns Progress ID in format `prg_{nanoid(8)}`
 *
 * @example
 * ```typescript
 * const id = generateProgressId();
 * // id = 'prg_Mn3oP5qR'
 * ```
 */
export function generateProgressId(): ProgressId {
  return `prg_${nanoid(8)}` as ProgressId;
}

// ============================================================================
// ID Validation Helpers
// ============================================================================

/**
 * Check if a string is a valid task ID format
 *
 * @param id - String to check
 * @returns True if valid task ID format
 */
export function isValidTaskId(id: string): id is TaskId {
  return /^tsk_[A-Za-z0-9_-]{10}$/.test(id);
}

/**
 * Check if a string is a valid session ID format
 *
 * @param id - String to check
 * @returns True if valid session ID format
 */
export function isValidSessionId(id: string): id is SessionId {
  return /^ses_[A-Za-z0-9_-]{8}$/.test(id);
}

/**
 * Check if a string is a valid harness ID format
 *
 * @param id - String to check
 * @returns True if valid harness ID format
 */
export function isValidHarnessId(id: string): id is HarnessId {
  return /^hrn_[A-Za-z0-9_-]{8}$/.test(id);
}

/**
 * Check if a string is a valid message ID format
 *
 * @param id - String to check
 * @returns True if valid message ID format
 */
export function isValidMessageId(id: string): id is MessageId {
  return /^msg_[A-Za-z0-9_-]{8}$/.test(id);
}

/**
 * Check if a string is a valid progress ID format
 *
 * @param id - String to check
 * @returns True if valid progress ID format
 */
export function isValidProgressId(id: string): id is ProgressId {
  return /^prg_[A-Za-z0-9_-]{8}$/.test(id);
}
