/**
 * @fileoverview Shared Zod primitives used across tool and model validation.
 *
 * Defines common constraints for ids, paths, timestamps, numeric limits, and
 * common text fields.
 *
 * @module validation/common
 */

import { z } from 'zod';

// ============================================================================
// Constants
// ============================================================================

/**
 * Minimum timeout: 1 second
 */
const MIN_TIMEOUT_MS = 1000;

/**
 * Maximum timeout: 30 minutes
 */
const MAX_TIMEOUT_MS = 1800000;

/**
 * Default timeout: 5 minutes
 */
export const DEFAULT_TIMEOUT_MS = 300000;

// ============================================================================
// ID Schemas
// ============================================================================

/**
 * Nanoid character pattern
 */
const NANOID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Task id schema: `tsk_<10 nanoid chars>`. */
export const TaskIdSchema = z
  .string()
  .refine((val) => val.startsWith('tsk_'), {
    message: 'Task ID must start with "tsk_"',
  })
  .refine((val) => val.length === 14, {
    message: 'Task ID must be exactly 14 characters (tsk_ + 10 chars)',
  })
  .refine((val) => NANOID_PATTERN.test(val.slice(4)), {
    message: 'Task ID contains invalid characters',
  });

/** Harness execution id schema: `hrn_<8 nanoid chars>`. */
export const HarnessIdSchema = z
  .string()
  .refine((val) => val.startsWith('hrn_'), {
    message: 'Harness ID must start with "hrn_"',
  })
  .refine((val) => val.length === 12, {
    message: 'Harness ID must be exactly 12 characters (hrn_ + 8 chars)',
  })
  .refine((val) => NANOID_PATTERN.test(val.slice(4)), {
    message: 'Harness ID contains invalid characters',
  });

/** Progress entry id schema: `prg_<8 nanoid chars>`. */
export const ProgressIdSchema = z
  .string()
  .refine((val) => val.startsWith('prg_'), {
    message: 'Progress ID must start with "prg_"',
  })
  .refine((val) => val.length === 12, {
    message: 'Progress ID must be exactly 12 characters (prg_ + 8 chars)',
  })
  .refine((val) => NANOID_PATTERN.test(val.slice(4)), {
    message: 'Progress ID contains invalid characters',
  });

// ============================================================================
// Path Schemas
// ============================================================================

/** Workspace name schema used for directory-safe workspace ids. */
export const WorkspaceNameSchema = z
  .string()
  .min(1, 'Workspace name is required')
  .max(100, 'Workspace name too long (max 100 characters)')
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    'Workspace name must start with alphanumeric and contain only alphanumeric, dot, underscore, or hyphen'
  )
  .refine((name) => !name.includes('..'), {
    message: 'Path traversal (..) not allowed in workspace name',
  })
  .transform((name) => name.toLowerCase());

/** File path schema constrained to workspace-safe relative/absolute paths. */
export const SafePathSchema = z
  .string()
  .min(1, 'Path is required')
  .refine((path) => !path.includes('..'), {
    message: 'Path traversal (..) not allowed',
  })
  .refine(
    (path) => !path.startsWith('/') || path.startsWith('/workspace'),
    {
      message: 'Absolute paths must be within /workspace',
    }
  );

// ============================================================================
// Numeric Schemas
// ============================================================================

/**
 * Positive integer schema
 */
export const PositiveIntSchema = z
  .number()
  .int('Must be an integer')
  .positive('Must be positive');

/**
 * Non-negative integer schema
 */
export const NonNegativeIntSchema = z
  .number()
  .int('Must be an integer')
  .min(0, 'Must be non-negative');

/**
 * Percentage schema (0-100)
 */
export const PercentageSchema = z
  .number()
  .min(0, 'Percentage must be >= 0')
  .max(100, 'Percentage must be <= 100');

/**
 * Timeout schema (milliseconds)
 *
 * Range: 1 second to 30 minutes
 */
export const TimeoutSchema = z
  .number()
  .int('Timeout must be an integer')
  .min(MIN_TIMEOUT_MS, `Minimum timeout is ${MIN_TIMEOUT_MS}ms (1 second)`)
  .max(MAX_TIMEOUT_MS, `Maximum timeout is ${MAX_TIMEOUT_MS}ms (30 minutes)`);

// ============================================================================
// Timestamp Schemas
// ============================================================================

/** ISO-8601 UTC timestamp schema. */
export const ISOTimestampSchema = z.string().datetime({
  message: 'Invalid ISO 8601 timestamp',
});

// ============================================================================
// String Schemas
// ============================================================================

/**
 * Non-empty string schema
 */
export const NonEmptyStringSchema = z
  .string()
  .min(1, 'Value is required');

/** Task goal text schema. */
export const GoalSchema = z
  .string()
  .min(1, 'Goal is required')
  .max(2000, 'Goal too long (max 2000 characters)');

/**
 * Question string schema (for asking user)
 */
export const QuestionSchema = z
  .string()
  .min(1, 'Question is required')
  .max(500, 'Question too long (max 500 characters)');

/**
 * Response string schema (for user responses)
 */
export const ResponseSchema = z
  .string()
  .min(1, 'Response is required')
  .max(1000, 'Response too long (max 1000 characters)');

/**
 * Progress message schema
 */
export const ProgressMessageSchema = z
  .string()
  .min(1, 'Message is required')
  .max(500, 'Message too long (max 500 characters)');
