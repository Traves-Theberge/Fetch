/**
 * @fileoverview Runtime pipeline configuration resolver.
 *
 * Defines all `FETCH_*` tunables and exposes a typed `pipeline` object that:
 * - reads current `process.env` values on access
 * - parses/coerces values by expected type
 * - falls back to defaults when unset/invalid
 *
 * @module config/pipeline
 * @see {@link env} Core non-`FETCH_*` env access
 */

import { env } from './env.js';

// =============================================================================
// Pipeline Definition Types
// =============================================================================

type PipelineDef =
  | { type: 'int'; key: string; fallback: number }
  | { type: 'float'; key: string; fallback: number }
  | { type: 'bool'; key: string; fallback: boolean }
  | { type: 'str'; key: string; fallback: string }
  | { type: 'ints'; key: string; fallback: number[] }
  | { type: 'envStr'; key: string; envFallbackKey: string; fallback: string };

// =============================================================================
// Pipeline Definitions — env key, type, and default for each parameter
// =============================================================================

const PIPELINE_DEFS: Record<string, PipelineDef> = {
  // ─── Context Window ────────────────────────────────────────
  historyWindow: { type: 'int', key: 'FETCH_HISTORY_WINDOW', fallback: 20 },
  compactionThreshold: { type: 'int', key: 'FETCH_COMPACTION_THRESHOLD', fallback: 40 },
  compactionMaxTokens: { type: 'int', key: 'FETCH_COMPACTION_MAX_TOKENS', fallback: 500 },
  compactionModel: { type: 'envStr', key: 'FETCH_COMPACTION_MODEL', envFallbackKey: 'SUMMARY_MODEL', fallback: 'openai/gpt-4o-mini' },
  compactionTokenThreshold: { type: 'int', key: 'FETCH_COMPACTION_TOKEN_THRESHOLD', fallback: 4000 },
  embeddingModel: { type: 'str', key: 'FETCH_EMBEDDING_MODEL', fallback: 'text-embedding-3-small' },

  // ─── Notification LLM ────────────────────────────────────────
  notificationModel: { type: 'envStr', key: 'FETCH_NOTIFICATION_MODEL', envFallbackKey: 'SUMMARY_MODEL', fallback: 'openai/gpt-4o-mini' },
  notificationMaxTokens: { type: 'int', key: 'FETCH_NOTIFICATION_MAX_TOKENS', fallback: 150 },
  notificationTemperature: { type: 'float', key: 'FETCH_NOTIFICATION_TEMPERATURE', fallback: 0.7 },
  notificationRewriteEnabled: { type: 'bool', key: 'FETCH_NOTIFICATION_REWRITE', fallback: true },
  notificationRewriteTimeoutMs: { type: 'int', key: 'FETCH_NOTIFICATION_REWRITE_TIMEOUT_MS', fallback: 2000 },
  progressRewriteEnabled: { type: 'bool', key: 'FETCH_PROGRESS_REWRITE', fallback: true },
  progressRewriteTimeoutMs: { type: 'int', key: 'FETCH_PROGRESS_REWRITE_TIMEOUT_MS', fallback: 1500 },

  // ─── Agent LLM ────────────────────────────────────────────
  maxToolCalls: { type: 'int', key: 'FETCH_MAX_TOOL_CALLS', fallback: 5 },
  toolMaxTokens: { type: 'int', key: 'FETCH_TOOL_MAX_TOKENS', fallback: 2048 },
  toolTemperature: { type: 'float', key: 'FETCH_TOOL_TEMPERATURE', fallback: 0.3 },
  frameMaxTokens: { type: 'int', key: 'FETCH_FRAME_MAX_TOKENS', fallback: 200 },

  // ─── Circuit Breaker ──────────────────────────────────────
  circuitBreakerThreshold: { type: 'int', key: 'FETCH_CB_THRESHOLD', fallback: 3 },
  circuitBreakerBackoff: { type: 'ints', key: 'FETCH_CB_BACKOFF', fallback: [1000, 5000, 30000] },
  maxRetries: { type: 'int', key: 'FETCH_MAX_RETRIES', fallback: 3 },
  retryBackoff: { type: 'ints', key: 'FETCH_RETRY_BACKOFF', fallback: [0, 1000, 3000, 10000] },
  circuitBreakerResetMs: { type: 'int', key: 'FETCH_CB_RESET_MS', fallback: 300_000 },

  // ─── Task Execution ───────────────────────────────────────
  taskTimeout: { type: 'int', key: 'FETCH_TASK_TIMEOUT', fallback: 300_000 },
  harnessTimeout: { type: 'int', key: 'FETCH_HARNESS_TIMEOUT', fallback: 300_000 },
  taskMaxRetries: { type: 'int', key: 'FETCH_TASK_MAX_RETRIES', fallback: 1 },

  // ─── WhatsApp Formatting ──────────────────────────────────
  whatsappMaxLength: { type: 'int', key: 'FETCH_WA_MAX_LENGTH', fallback: 4000 },
  whatsappLineWidth: { type: 'int', key: 'FETCH_WA_LINE_WIDTH', fallback: 40 },

  // ─── Discord Formatting ───────────────────────────────────
  discordMaxLength: { type: 'int', key: 'FETCH_DISCORD_MAX_LENGTH', fallback: 2000 },
  discordLineWidth: { type: 'int', key: 'FETCH_DISCORD_LINE_WIDTH', fallback: 80 },

  // ─── Rate Limiting ────────────────────────────────────────
  rateLimitMax: { type: 'int', key: 'FETCH_RATE_LIMIT_MAX', fallback: 30 },
  rateLimitWindow: { type: 'int', key: 'FETCH_RATE_LIMIT_WINDOW', fallback: 60_000 },

  // ─── Bridge / Reconnection ────────────────────────────────
  maxReconnectAttempts: { type: 'int', key: 'FETCH_MAX_RECONNECT', fallback: 10 },
  reconnectBaseDelay: { type: 'int', key: 'FETCH_RECONNECT_BASE_DELAY', fallback: 5_000 },
  reconnectMaxDelay: { type: 'int', key: 'FETCH_RECONNECT_MAX_DELAY', fallback: 300_000 },
  reconnectJitter: { type: 'int', key: 'FETCH_RECONNECT_JITTER', fallback: 2_000 },
  deduplicationTtl: { type: 'int', key: 'FETCH_DEDUP_TTL', fallback: 30_000 },
  progressThrottle: { type: 'int', key: 'FETCH_PROGRESS_THROTTLE', fallback: 3_000 },

  // ─── Session / Memory ─────────────────────────────────────
  recentMessageLimit: { type: 'int', key: 'FETCH_RECENT_MSG_LIMIT', fallback: 50 },
  truncationLimit: { type: 'int', key: 'FETCH_TRUNCATION_LIMIT', fallback: 100 },
  repoMapTtl: { type: 'int', key: 'FETCH_REPO_MAP_TTL', fallback: 300_000 },
  contextBudget: { type: 'int', key: 'FETCH_CONTEXT_BUDGET', fallback: 6000 },

  // ─── Workspace ────────────────────────────────────────────
  workspaceCacheTtl: { type: 'int', key: 'FETCH_WORKSPACE_CACHE_TTL', fallback: 30_000 },
  gitCommandTimeout: { type: 'int', key: 'FETCH_GIT_TIMEOUT', fallback: 5_000 },

  // ─── Memory / Recall ─────────────────────────────────────────
  recallLimit: { type: 'int', key: 'FETCH_RECALL_LIMIT', fallback: 5 },
  recallSnippetTokens: { type: 'int', key: 'FETCH_RECALL_SNIPPET_TOKENS', fallback: 300 },
  recallDecay: { type: 'float', key: 'FETCH_RECALL_DECAY', fallback: 0.1 },
  toolResultMaxPersist: { type: 'int', key: 'FETCH_TOOL_RESULT_MAX_PERSIST', fallback: 2000 },
  runHistoryLimit: { type: 'int', key: 'FETCH_RUN_HISTORY_LIMIT', fallback: 25 },
  durableNotesLimit: { type: 'int', key: 'FETCH_DURABLE_NOTES_LIMIT', fallback: 20 },

  // ─── Web / Browser ─────────────────────────────────────────
  searxngUrl: { type: 'str', key: 'FETCH_SEARXNG_URL', fallback: 'http://searxng:8080' },
  webFetchMaxLength: { type: 'int', key: 'FETCH_WEB_FETCH_MAX_LENGTH', fallback: 50_000 },
  browserTimeout: { type: 'int', key: 'FETCH_BROWSER_TIMEOUT', fallback: 60_000 },
};

// =============================================================================
// Dynamic Pipeline Proxy
// =============================================================================

/**
 * Resolve one pipeline setting from current environment state.
 */
function resolve(def: PipelineDef): unknown {
  const v = process.env[def.key];

  switch (def.type) {
    case 'int': {
      if (v === undefined || v === '') return def.fallback;
      const parsed = parseInt(v, 10);
      return Number.isNaN(parsed) ? def.fallback : parsed;
    }
    case 'float': {
      if (v === undefined || v === '') return def.fallback;
      const parsed = parseFloat(v);
      return Number.isNaN(parsed) ? def.fallback : parsed;
    }
    case 'bool': {
      if (v === undefined || v === '') return def.fallback;
      const normalized = v.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
      return def.fallback;
    }
    case 'str': {
      return v !== undefined && v !== '' ? v : def.fallback;
    }
    case 'ints': {
      if (v === undefined || v === '') return def.fallback;
      const parsed = v.split(',').map(Number);
      return parsed.some(Number.isNaN) ? def.fallback : parsed;
    }
    case 'envStr': {
      // First check the specific env var, then the env fallback, then hardcoded default
      if (v !== undefined && v !== '') return v;
      const envFallback = env[def.envFallbackKey as keyof typeof env];
      return envFallback ?? def.fallback;
    }
  }
}

// =============================================================================
// Pipeline Configuration Interface (for type safety)
// =============================================================================

interface PipelineConfig {
  historyWindow: number;
  compactionThreshold: number;
  compactionMaxTokens: number;
  compactionModel: string;
  compactionTokenThreshold: number;
  embeddingModel: string;
  notificationModel: string;
  notificationMaxTokens: number;
  notificationTemperature: number;
  notificationRewriteEnabled: boolean;
  notificationRewriteTimeoutMs: number;
  progressRewriteEnabled: boolean;
  progressRewriteTimeoutMs: number;
  maxToolCalls: number;
  toolMaxTokens: number;
  toolTemperature: number;
  frameMaxTokens: number;
  circuitBreakerThreshold: number;
  circuitBreakerBackoff: number[];
  maxRetries: number;
  retryBackoff: number[];
  circuitBreakerResetMs: number;
  taskTimeout: number;
  harnessTimeout: number;
  taskMaxRetries: number;
  whatsappMaxLength: number;
  whatsappLineWidth: number;
  discordMaxLength: number;
  discordLineWidth: number;
  rateLimitMax: number;
  rateLimitWindow: number;
  maxReconnectAttempts: number;
  reconnectBaseDelay: number;
  reconnectMaxDelay: number;
  reconnectJitter: number;
  deduplicationTtl: number;
  progressThrottle: number;
  recentMessageLimit: number;
  truncationLimit: number;
  repoMapTtl: number;
  contextBudget: number;
  workspaceCacheTtl: number;
  gitCommandTimeout: number;
  recallLimit: number;
  recallSnippetTokens: number;
  recallDecay: number;
  toolResultMaxPersist: number;
  runHistoryLimit: number;
  durableNotesLimit: number;
  searxngUrl: string;
  webFetchMaxLength: number;
  browserTimeout: number;
}

/**
 * Typed pipeline config proxy used by runtime modules.
 *
 * Each property access resolves from `process.env` + defaults in real time.
 */
export const pipeline: PipelineConfig = new Proxy({} as PipelineConfig, {
  get(_target, prop: string) {
    const def = PIPELINE_DEFS[prop];
    if (!def) return undefined;
    return resolve(def);
  },
});

export type { PipelineConfig };
