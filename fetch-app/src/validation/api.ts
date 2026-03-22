/**
 * @fileoverview Zod schemas for HTTP API request validation.
 *
 * Defines schemas for session IDs, query parameters, and request bodies
 * used by the status/control API endpoints.
 *
 * @module validation/api
 */

import { z } from 'zod';

// ============================================================================
// Constants
// ============================================================================

/** Maximum allowed request body size in bytes (64 KB). */
export const MAX_BODY_SIZE = 65_536;

// ============================================================================
// Session ID
// ============================================================================

/** URL-safe session identifier: alphanumeric, underscore, hyphen. */
export const SessionIdSchema = z
  .string()
  .min(1, 'Session ID is required')
  .max(128, 'Session ID too long (max 128 characters)')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Session ID must contain only alphanumeric characters, underscores, or hyphens',
  );

// ============================================================================
// Query Parameters
// ============================================================================

/** Query parameters for GET /api/sessions. */
export const SessionListQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? Number(val) : undefined))
    .pipe(
      z
        .number()
        .int('Limit must be an integer')
        .min(1, 'Limit must be at least 1')
        .max(1000, 'Limit must be at most 1000')
        .optional(),
    ),
});

// ============================================================================
// Request Bodies
// ============================================================================

/** Body for POST /api/config/reload — currently accepts no fields. */
export const ConfigReloadBodySchema = z
  .object({})
  .strict()
  .optional();

/** Body for POST /api/logout — currently accepts no fields. */
export const LogoutBodySchema = z
  .object({})
  .strict()
  .optional();

/** Body for POST /api/whatsapp/start — currently accepts no fields. */
export const WhatsAppStartBodySchema = z
  .object({})
  .strict()
  .optional();

/** Body for POST /api/whatsapp/restart — currently accepts no fields. */
export const WhatsAppRestartBodySchema = z
  .object({})
  .strict()
  .optional();

/** Body for POST /api/sessions/:id/clear — currently accepts no fields. */
export const SessionClearBodySchema = z
  .object({})
  .strict()
  .optional();

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format Zod validation errors into a human-readable string.
 */
export function formatZodErrors(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    })
    .join('; ');
}

/**
 * Parse a URL query string into a plain object.
 */
export function parseQueryString(url: string): Record<string, string> {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return {};

  const params: Record<string, string> = {};
  const queryString = url.slice(queryIndex + 1);
  for (const pair of queryString.split('&')) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) {
      params[decodeURIComponent(pair)] = '';
    } else {
      const key = decodeURIComponent(pair.slice(0, eqIndex));
      const value = decodeURIComponent(pair.slice(eqIndex + 1));
      params[key] = value;
    }
  }
  return params;
}
