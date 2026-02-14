/**
 * @fileoverview Environment variable access and startup validation.
 *
 * This module provides:
 * - Zod schema validation for required/optional env vars
 * - runtime `env` proxy for live `process.env` reads with defaults
 * - exported `VERSION` value resolved from the project version source
 *
 * @module config/env
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

  // Harness Feature Flags
  ENABLE_COPILOT: z.string().transform(val => val === 'true').optional().default(true),
  ENABLE_CLAUDE: z.string().transform(val => val === 'true').optional().default(false),
  ENABLE_GEMINI: z.string().transform(val => val === 'true').optional().default(false),
  ENABLE_OPENCODE: z.string().transform(val => val === 'true').optional().default(false),
  ENABLE_CODEX: z.string().transform(val => val === 'true').optional().default(false),

  // Web / Browser Feature Flags
  ENABLE_WEB_FETCH: z.string().transform(val => val === 'true').optional().default(true),
  ENABLE_WEB_SEARCH: z.string().transform(val => val === 'true').optional().default(true),
  ENABLE_BROWSER: z.string().transform(val => val === 'true').optional().default(false),

  // Agent Models (Optional overrides)
  COPILOT_MODEL: z.string().optional(),
  CLAUDE_MODEL: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  OPENCODE_MODEL: z.string().optional(),
  CODEX_MODEL: z.string().optional(),

  // Harness Auth
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENCODE_API_KEY: z.string().optional(),
  CODEX_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GH_TOKEN: z.string().optional(),
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
// Version
// ============================================================================

import { getVersion } from '../utils/version.js';

/** Application version string used by user-facing command/format output. */
export const VERSION = getVersion();

// ============================================================================
// Exports
// ============================================================================

type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Environment accessor proxy.
 *
 * Reads `process.env` on each property access and applies defaults from
 * `DEFAULTS` when a value is unset. This keeps runtime config reloads and
 * test-time overrides visible without re-importing the module.
 */
export const env = new Proxy({} as EnvConfig, {
  get(_target, prop: string) {
    const val = process.env[prop];
    if (val !== undefined && val !== '') return val;
    return DEFAULTS[prop];
  },
});

// Load .env file if present
import dotenv from 'dotenv';
dotenv.config();

/**
 * Validate environment values against `EnvSchema`.
 *
 * @returns Validation status and missing/invalid keys
 */
export function validateEnv(): { valid: boolean; missing: string[] } {
  // Construct an object with all values (process.env + DEFAULTS)
  const envVars = Object.keys(EnvSchema.shape).reduce((acc, key) => {
    const val = process.env[key];
    if (val !== undefined && val !== '') {
      acc[key] = val;
    } else if (key in DEFAULTS) {
      acc[key] = DEFAULTS[key];
    }
    return acc;
  }, {} as Record<string, any>);

  const result = EnvSchema.safeParse(envVars);

  if (!result.success) {
    // Collect missing paths from Zod issues
    const missing = result.error.issues.map((i) => i.path.join('.'));
    return { valid: false, missing };
  }

  return { valid: true, missing: [] };
}
