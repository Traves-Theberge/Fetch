/**
 * @fileoverview Common Zod validation schemas
 *
 * Provides reusable validation schemas for IDs, paths, timestamps,
 * and other common data types used throughout Fetch v2.
 *
 * @module validation/common
 * @see {@link ToolInputSchemas} - Tool-specific schemas
 * @see {@link ModelSchemas} - Data model schemas
 */

import { z } from 'zod';

// ============================================================================
// Constants
// ============================================================================

/**
 * Minimum timeout: 1 second
 */
export const MIN_TIMEOUT_MS = 1000;

/**
 * Maximum timeout: 30 minutes
 */
export const MAX_TIMEOUT_MS = 1800000;

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

/**
 * Task ID schema
 *
 * Format: `tsk_{nanoid(10)}`
 *
 * @example
 * ```typescript
 * TaskIdSchema.parse('tsk_V1StGXR8_Z'); // OK
 * TaskIdSchema.parse('invalid'); // throws
 * ```
 */
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

/**
 * Session ID schema
 *
 * Format: `ses_{nanoid(8)}`
 */
export const SessionIdSchema = z
  .string()
  .refine((val) => val.startsWith('ses_'), {
    message: 'Session ID must start with "ses_"',
  })
  .refine((val) => val.length === 12, {
    message: 'Session ID must be exactly 12 characters (ses_ + 8 chars)',
  })
  .refine((val) => NANOID_PATTERN.test(val.slice(4)), {
    message: 'Session ID contains invalid characters',
  });

/**
 * Harness ID schema
 *
 * Format: `hrn_{nanoid(8)}`
 */
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

/**
 * Message ID schema
 *
 * Format: `msg_{nanoid(8)}`
 */
export const MessageIdSchema = z
  .string()
  .refine((val) => val.startsWith('msg_'), {
    message: 'Message ID must start with "msg_"',
  })
  .refine((val) => val.length === 12, {
    message: 'Message ID must be exactly 12 characters (msg_ + 8 chars)',
  })
  .refine((val) => NANOID_PATTERN.test(val.slice(4)), {
    message: 'Message ID contains invalid characters',
  });

/**
 * Progress ID schema
 *
 * Format: `prg_{nanoid(8)}`
 */
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

/**
 * Workspace name schema (safe directory name)
 *
 * Rules:
 * - 1-100 characters
 * - Starts with alphanumeric
 * - Contains only alphanumeric, dot, underscore, hyphen
 * - No path traversal (..)
 *
 * @example
 * ```typescript
 * WorkspaceNameSchema.parse('my-project'); // OK
 * WorkspaceNameSchema.parse('../secret'); // throws
 * ```
 */
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
  });

/**
 * Safe file path schema (within workspace)
 *
 * Rules:
 * - Non-empty
 * - No path traversal (..)
 * - Absolute paths must start with /workspace
 *
 * @example
 * ```typescript
 * SafePathSchema.parse('src/index.ts'); // OK
 * SafePathSchema.parse('../../../etc/passwd'); // throws
 * ```
 */
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

/**
 * ISO 8601 timestamp schema
 *
 * @example
 * ```typescript
 * ISOTimestampSchema.parse('2026-02-02T10:00:00.000Z'); // OK
 * ISOTimestampSchema.parse('invalid'); // throws
 * ```
 */
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

/**
 * Goal string schema (for task goals)
 *
 * Rules:
 * - 1-2000 characters
 */
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

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Inferred types from schemas
 */
export type TaskIdType = z.infer<typeof TaskIdSchema>;
export type SessionIdType = z.infer<typeof SessionIdSchema>;
export type HarnessIdType = z.infer<typeof HarnessIdSchema>;
export type WorkspaceNameType = z.infer<typeof WorkspaceNameSchema>;
export type SafePathType = z.infer<typeof SafePathSchema>;
export type ISOTimestampType = z.infer<typeof ISOTimestampSchema>;
