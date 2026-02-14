/**
 * @fileoverview ID generators for task and progress records.
 *
 * Uses `nanoid` with stable prefixes consumed by validation schemas.
 *
 * @module utils/id
 */

import { nanoid } from 'nanoid';
import type { TaskId } from '../task/types.js';

// ============================================================================
// ID Generators
// ============================================================================

/** Returns a task id in `tsk_<10 chars>` format. */
export function generateTaskId(): TaskId {
  return `tsk_${nanoid(10)}` as TaskId;
}

/** Returns a progress id in `prg_<8 chars>` format. */
export function generateProgressId(): string {
  return `prg_${nanoid(8)}`;
}
