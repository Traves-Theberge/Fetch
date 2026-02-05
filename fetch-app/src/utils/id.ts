/**
 * @fileoverview ID generation utilities
 *
 * Provides functions to generate unique identifiers for Fetch entities.
 * Uses nanoid for URL-safe, collision-resistant IDs.
 *
 * @module utils/id
 *
 * ## ID Formats
 *
 * | Entity | Format | Length | Example |
 * |--------|--------|--------|---------|
 * | Task | `tsk_{nanoid(10)}` | 14 | `tsk_V1StGXR8_Z` |
 * | Progress | `prg_{nanoid(8)}` | 12 | `prg_Mn3oP5qR` |
 *
 * ## Usage
 *
 * ```typescript
 * import { generateTaskId, generateProgressId } from './utils/id.js';
 *
 * const taskId = generateTaskId();         // 'tsk_V1StGXR8_Z'
 * const progressId = generateProgressId(); // 'prg_Mn3oP5qR'
 * ```
 */

import { nanoid } from 'nanoid';
import type { TaskId } from '../task/types.js';

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
export function generateProgressId(): string {
  return `prg_${nanoid(8)}`;
}
