/**
 * @fileoverview Pipeline Configuration — Single Source of Truth
 *
 * Centralizes every tunable parameter for the Fetch context pipeline.
 * Every value has a sane default. Override any value via env vars
 * (`FETCH_<CATEGORY>_<PARAM>`) for quick tuning without code changes.
 *
 * All consumers import `pipeline` from here — no magic numbers anywhere else.
 *
 * ## Data Flow
 *
 * ```
 * TUI Config Editor → .env file → Docker Compose → process.env → pipeline.* → all consumers
 * ```
 *
 * ## Quick Tuning (docker-compose.yml)
 *
 * ```yaml
 * environment:
 *   - FETCH_HISTORY_WINDOW=30        # Longer conversations
 *   - FETCH_CHAT_MAX_TOKENS=200      # Cheaper models
 *   - FETCH_RATE_LIMIT_MAX=60        # High-traffic
 * ```
 *
 * @module config/pipeline
 * @see {@link env} — Core env vars (API keys, models, paths)
 */

import { env } from './env.js';

// =============================================================================
// Pipeline Configuration
// =============================================================================

/**
 * Centralized pipeline configuration.
 *
 * Every parameter reads from `process.env` with a fallback default.
 * Restart required to apply changes (read once at import time).
 */
export const pipeline = {
  // ─── Context Window ────────────────────────────────────────
  /** Messages in the sliding window sent to the LLM */
  historyWindow: int('FETCH_HISTORY_WINDOW', 20),
  /** Compact when total messages exceed this */
  compactionThreshold: int('FETCH_COMPACTION_THRESHOLD', 40),
  /** Max tokens for LLM-generated compaction summary */
  compactionMaxTokens: int('FETCH_COMPACTION_MAX_TOKENS', 500),
  /** Model for compaction summaries (cheap + fast) */
  compactionModel: str('FETCH_COMPACTION_MODEL', env.SUMMARY_MODEL ?? 'openai/gpt-4o-mini'),

  // ─── Agent LLM ────────────────────────────────────────────
  /** Max tool call rounds per single user message */
  maxToolCalls: int('FETCH_MAX_TOOL_CALLS', 5),
  /** Token budget for conversation (no tools) responses */
  chatMaxTokens: int('FETCH_CHAT_MAX_TOKENS', 512),
  /** Temperature for conversation responses */
  chatTemperature: float('FETCH_CHAT_TEMPERATURE', 0.7),
  /** Token budget for tool-calling responses */
  toolMaxTokens: int('FETCH_TOOL_MAX_TOKENS', 2048),
  /** Temperature for tool-calling responses */
  toolTemperature: float('FETCH_TOOL_TEMPERATURE', 0.3),
  /** Token budget for task framing prompt */
  frameMaxTokens: int('FETCH_FRAME_MAX_TOKENS', 200),

  // ─── Circuit Breaker ──────────────────────────────────────
  /** Errors before circuit opens */
  circuitBreakerThreshold: int('FETCH_CB_THRESHOLD', 3),
  /** Backoff schedule (ms) for circuit breaker */
  circuitBreakerBackoff: ints('FETCH_CB_BACKOFF', [1000, 5000, 30000]),
  /** Max retries for retriable errors */
  maxRetries: int('FETCH_MAX_RETRIES', 3),
  /** Retry backoff schedule (ms) */
  retryBackoff: ints('FETCH_RETRY_BACKOFF', [0, 1000, 3000, 10000]),
  /** Circuit breaker reset window (ms) — resets error count after this period of no errors */
  circuitBreakerResetMs: int('FETCH_CB_RESET_MS', 300_000),

  // ─── Task Execution ───────────────────────────────────────
  /** Default task timeout (ms) */
  taskTimeout: int('FETCH_TASK_TIMEOUT', 300_000),
  /** Default harness timeout (ms) */
  harnessTimeout: int('FETCH_HARNESS_TIMEOUT', 300_000),
  /** Max task retries */
  taskMaxRetries: int('FETCH_TASK_MAX_RETRIES', 1),

  // ─── WhatsApp Formatting ──────────────────────────────────
  /** Max characters per WhatsApp message */
  whatsappMaxLength: int('FETCH_WA_MAX_LENGTH', 4000),
  /** Max chars per line for mobile readability */
  whatsappLineWidth: int('FETCH_WA_LINE_WIDTH', 40),

  // ─── Rate Limiting ────────────────────────────────────────
  /** Requests per rate limit window */
  rateLimitMax: int('FETCH_RATE_LIMIT_MAX', 30),
  /** Rate limit window (ms) */
  rateLimitWindow: int('FETCH_RATE_LIMIT_WINDOW', 60_000),

  // ─── Bridge / Reconnection ────────────────────────────────
  /** Max reconnect attempts before giving up */
  maxReconnectAttempts: int('FETCH_MAX_RECONNECT', 10),
  /** Base delay for exponential backoff reconnect (ms) */
  reconnectBaseDelay: int('FETCH_RECONNECT_BASE_DELAY', 5_000),
  /** Max delay cap for reconnect (ms) */
  reconnectMaxDelay: int('FETCH_RECONNECT_MAX_DELAY', 300_000),
  /** Max jitter added to reconnect delay (ms) */
  reconnectJitter: int('FETCH_RECONNECT_JITTER', 2_000),
  /** Deduplication TTL for message dedup cache (ms) */
  deduplicationTtl: int('FETCH_DEDUP_TTL', 30_000),
  /** Throttle interval for progress updates (ms) */
  progressThrottle: int('FETCH_PROGRESS_THROTTLE', 3_000),

  // ─── Session / Memory ─────────────────────────────────────
  /** Default recent messages limit for getRecentMessages() */
  recentMessageLimit: int('FETCH_RECENT_MSG_LIMIT', 50),
  /** Truncation limit — max messages before hard truncation */
  truncationLimit: int('FETCH_TRUNCATION_LIMIT', 100),
  /** Repo map staleness check (ms) */
  repoMapTtl: int('FETCH_REPO_MAP_TTL', 300_000),

  // ─── Workspace ────────────────────────────────────────────
  /** Workspace info cache TTL (ms) */
  workspaceCacheTtl: int('FETCH_WORKSPACE_CACHE_TTL', 30_000),
  /** Git command execution timeout (ms) */
  gitCommandTimeout: int('FETCH_GIT_TIMEOUT', 5_000),

  // ─── BM25 Memory (Phase 2) ────────────────────────────────
  /** Max recalled results injected into context */
  recallLimit: int('FETCH_RECALL_LIMIT', 5),
  /** Max tokens per recalled result snippet */
  recallSnippetTokens: int('FETCH_RECALL_SNIPPET_TOKENS', 300),
  /** Recency decay factor (higher = faster decay) */
  recallDecayFactor: float('FETCH_RECALL_DECAY', 0.1),
} as const;

// =============================================================================
// Helpers
// =============================================================================

function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const parsed = parseInt(v, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function float(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const parsed = parseFloat(v);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v !== undefined && v !== '' ? v : fallback;
}

function ints(key: string, fallback: number[]): number[] {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const parsed = v.split(',').map(Number);
  return parsed.some(Number.isNaN) ? fallback : parsed;
}

// =============================================================================
// Type Export
// =============================================================================

export type PipelineConfig = typeof pipeline;
