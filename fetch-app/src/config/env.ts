/**
 * @fileoverview Centralized environment configuration
 *
 * Single source of truth for all environment variables used by Fetch.
 * Validated at import time using Zod schemas.
 *
 * @module config/env
 *
 * ## Environment Variables
 *
 * | Variable              | Required | Default                      | Description                                    |
 * |-----------------------|----------|------------------------------|------------------------------------------------|
 * | OPENROUTER_API_KEY    | Yes      | —                            | API key for OpenRouter LLM access              |
 * | OWNER_PHONE_NUMBER    | Yes      | —                            | WhatsApp owner phone number (security gate)    |
 * | AGENT_MODEL           | No       | openai/gpt-4o-mini           | Model for the core agent loop                  |
 * | SUMMARY_MODEL         | No       | openai/gpt-4o-mini           | Model for conversation summarization           |
 * | VISION_MODEL          | No       | openai/gpt-4o-mini           | Model for image analysis                       |
 * | WHISPER_MODEL         | No       | /app/models/ggml-tiny.bin    | Path to whisper-cpp model binary               |
 * | WORKSPACE_ROOT        | No       | /workspace                   | Root directory for project operations          |
 * | DATA_DIR              | No       | (auto-resolved)              | Override for data directory path                |
 * | DATABASE_PATH         | No       | <DATA_DIR>/sessions.db       | Path to sessions SQLite database               |
 * | TASKS_DB_PATH         | No       | <DATA_DIR>/tasks.db          | Path to tasks SQLite database                  |
 * | LOG_LEVEL             | No       | debug                        | Minimum log level (debug/info/warn/error)      |
 * | ADMIN_TOKEN           | No       | (auto-generated)             | Bearer token for /api/logout endpoint          |
 * | TRUSTED_PHONE_NUMBERS | No       | (empty)                      | Comma-separated trusted phone numbers          |
 */

import { z } from 'zod';

// ============================================================================
// Schema
// ============================================================================

const EnvSchema = z.object({
  // Required
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  OWNER_PHONE_NUMBER: z.string().min(1, 'OWNER_PHONE_NUMBER is required'),

  // Models
  AGENT_MODEL: z.string().default('openai/gpt-4o-mini'),
  SUMMARY_MODEL: z.string().default('openai/gpt-4o-mini'),
  VISION_MODEL: z.string().default('openai/gpt-4o-mini'),
  WHISPER_MODEL: z.string().default('/app/models/ggml-tiny.bin'),

  // Paths
  WORKSPACE_ROOT: z.string().default('/workspace'),
  DATA_DIR: z.string().optional(),
  DATABASE_PATH: z.string().optional(),
  TASKS_DB_PATH: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('debug'),

  // Security
  ADMIN_TOKEN: z.string().optional(),
  TRUSTED_PHONE_NUMBERS: z.string().optional(),
});

// ============================================================================
// Defaults
// ============================================================================

const DEFAULTS: Partial<Record<string, string>> = {
  AGENT_MODEL: 'openai/gpt-4o-mini',
  SUMMARY_MODEL: 'openai/gpt-4o-mini',
  VISION_MODEL: 'openai/gpt-4o-mini',
  WHISPER_MODEL: '/app/models/ggml-tiny.bin',
  WORKSPACE_ROOT: '/workspace',
  LOG_LEVEL: 'debug',
};

// ============================================================================
// Exports
// ============================================================================

type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Live-reading environment proxy.
 *
 * Reads `process.env` on every access so runtime changes (e.g. test
 * `beforeEach` overrides) are reflected immediately. Applies defaults
 * for optional variables.
 *
 * Import this instead of reading `process.env` directly:
 * ```typescript
 * import { env } from '../config/env.js';
 * const key = env.OPENROUTER_API_KEY;
 * ```
 */
export const env = new Proxy({} as EnvConfig, {
  get(_target, prop: string) {
    const val = process.env[prop];
    if (val !== undefined && val !== '') return val;
    return DEFAULTS[prop];
  },
});

/**
 * Validate all required env vars are present (Zod).
 * Call once at startup — logs a structured error on failure.
 */
export function validateEnv(): { valid: boolean; missing: string[] } {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.'));
    return { valid: false, missing };
  }

  return { valid: true, missing: [] };
}
