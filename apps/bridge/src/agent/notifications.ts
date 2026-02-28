/**
 * @fileoverview Notification formatter for task lifecycle events.
 *
 * Strategy:
 * - `task:completed` / `task:failed`: template base + optional bounded LLM rewrite
 * - `task:started` / `task:progress`: template pools with anti-repeat selection
 * - all rewrite failures/timeouts fall back to deterministic templates
 *
 * @module agent/notifications
 * @see {@link formatNotification} Main entry point
 */

import OpenAI from 'openai';
import { env } from '../config/env.js';
import { pipeline } from '../config/pipeline.js';
import { logger } from '../utils/logger.js';
import { getIdentityManager } from '../identity/manager.js';

// ============================================================================
// Types
// ============================================================================

type NotificationEvent = 'task:started' | 'task:completed' | 'task:failed' | 'task:progress';

interface StartedData {
  goal: string;
  scopeKey?: string;
}

interface CompletedData {
  summary: string;
  filesCreated?: string[];
  filesModified?: string[];
  filesDeleted?: string[];
  durationSec?: number;
  scopeKey?: string;
}

interface FailedData {
  error: string;
  goal?: string;
  scopeKey?: string;
}

interface ProgressData {
  message: string;
  action?: string;
  scopeKey?: string;
}

type NotificationData = StartedData | CompletedData | FailedData | ProgressData;
type RewriteOutcomeReason = 'success' | 'disabled' | 'timeout' | 'error' | 'sanitize_reject';

export interface NotificationMetrics {
  total: number;
  templateEphemeral: number;
  llmRewriteSuccess: number;
  templateFallback: number;
  rewriteAttempts: number;
  rewriteDisabled: number;
  rewriteTimeouts: number;
  rewriteErrors: number;
  sanitizeRejects: number;
  duplicateSuppressions: number;
}

const MAX_NOTIFICATION_CHARS = 500;
const MAX_NOTIFICATION_LINES = 4;
const TEMPLATE_REPEAT_TTL_MS = 5 * 60 * 1000;
const MAX_TEMPLATE_CACHE_ENTRIES = 500;
const lastTemplateIndexByScopeAndEvent = new Map<string, { index: number; updatedAt: number }>();
const metrics: NotificationMetrics = {
  total: 0,
  templateEphemeral: 0,
  llmRewriteSuccess: 0,
  templateFallback: 0,
  rewriteAttempts: 0,
  rewriteDisabled: 0,
  rewriteTimeouts: 0,
  rewriteErrors: 0,
  sanitizeRejects: 0,
  duplicateSuppressions: 0,
};

// ============================================================================
// Template Pools
// ============================================================================

const STARTED_TEMPLATES: Array<(data: StartedData) => string> = [
  (d) => `I'm diving into this now:\n\n_"${d.goal}"_\n\nI'll keep you posted!`,
  (d) => `On it! Working on:\n\n_"${d.goal}"_`,
  (d) => `Challenge accepted! Tackling:\n\n_"${d.goal}"_\n\nBark when it's done!`,
  (d) => `Rolling up my sleeves for:\n\n_"${d.goal}"_`,
  (d) => `Got it! Starting work on:\n\n_"${d.goal}"_\n\nSit tight!`,
  (d) => `Fetching that for you now!\n\n_"${d.goal}"_`,
  (d) => `Sniffing out the solution for:\n\n_"${d.goal}"_`,
  (d) => `Let me dig into this:\n\n_"${d.goal}"_\n\nI'll report back soon!`,
];

const PROGRESS_TEMPLATES: Array<(data: ProgressData) => string> = [
  (d) => `Still at it - ${d.message}`,
  (d) => `Making progress: ${d.message}`,
  (d) => `Update: ${d.message}`,
  (d) => `Working away - ${d.message}`,
  (d) => `Heads up: ${d.message}`,
  (d) => `Quick update - ${d.message}`,
  (d) => `Moving along: ${d.message}`,
  (d) => `FYI: ${d.message}`,
];

const ERROR_TEMPLATES: Array<(data: FailedData) => string> = [
  (d) => `Hit a snag on this one.\n\nError: ${d.error}\n\nLet me know if you want me to try again!`,
  (d) => `Ran into trouble.\n\nError: ${d.error}`,
  (d) => `Something went sideways.\n\nError: ${d.error}\n\nI'm still here if you need me!`,
  (d) => `Couldn't quite crack it.\n\nError: ${d.error}\n\nWant me to take another run at it?`,
  (d) => `Got tripped up on this one.\n\nError: ${d.error}`,
  (d) => `The task didn't make it across the finish line.\n\nError: ${d.error}\n\nReady to retry whenever you are!`,
  (d) => `Woof, that didn't go as planned.\n\nError: ${d.error}`,
  (d) => `Hit a wall.\n\nError: ${d.error}\n\nHappy to dig deeper if you want!`,
];

// ============================================================================
// LLM Path
// ============================================================================

let notificationClient: OpenAI | null = null;

function getNotificationClient(): OpenAI {
  if (!notificationClient) {
    notificationClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: env.OPENROUTER_API_KEY,
    });
  }
  return notificationClient;
}

/**
 * Attempt bounded LLM rewrite for completion/failure notifications.
 * Returns `null` when rewrite is disabled, fails, times out, or is invalid.
 */
async function llmNotification(
  event: NotificationEvent,
  data: NotificationData
): Promise<{ text: string | null; reason: RewriteOutcomeReason }> {
  if (!pipeline.notificationRewriteEnabled) {
    return { text: null, reason: 'disabled' };
  }

  try {
    const identityManager = getIdentityManager();
    await identityManager.whenReady();
    const voiceTone = identityManager.getVoiceTone();

    let userPrompt: string;
    if (event === 'task:completed') {
      const d = data as CompletedData;
      const fileInfo: string[] = [];
      if (d.filesCreated?.length) fileInfo.push(`${d.filesCreated.length} files created`);
      if (d.filesModified?.length) fileInfo.push(`${d.filesModified.length} files modified`);
      if (d.filesDeleted?.length) fileInfo.push(`${d.filesDeleted.length} files deleted`);
      const duration = d.durationSec ? `Duration: ${d.durationSec}s` : '';

      userPrompt = `Task completed successfully.\nSummary: ${d.summary}\n${fileInfo.length ? 'Files: ' + fileInfo.join(', ') : ''}\n${duration}`.trim();
    } else {
      const d = data as FailedData;
      userPrompt = `Task failed.\nError: ${d.error}\n${d.goal ? 'Goal was: ' + d.goal : ''}`.trim();
    }

    const request = getNotificationClient().chat.completions.create({
      model: pipeline.notificationModel,
      max_tokens: pipeline.notificationMaxTokens,
      temperature: pipeline.notificationTemperature,
      messages: [
        {
          role: 'system',
          content: `You are writing a short WhatsApp notification (2-4 lines max) for a coding task result. Voice: ${voiceTone}. Be concise, informative, and natural. Use only facts from the user message and do not invent details. Include key facts (what changed, duration). If the task failed, state the specific technical reason (e.g., "Network timeout", "Syntax error"). Do NOT use generic phrases like "unexpected process error" or "something went wrong". No markdown headers. Use bold (*text*) sparingly for key items. Do NOT start with an emoji.`,
        },
        { role: 'user', content: userPrompt },
      ],
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Notification LLM timeout')), pipeline.notificationRewriteTimeoutMs)
    );

    const response = await Promise.race([request, timeout]);
    const candidate = response.choices[0]?.message?.content?.trim() ?? '';
    const sanitized = sanitizeNotification(candidate);
    if (!sanitized) {
      return { text: null, reason: 'sanitize_reject' };
    }
    return { text: sanitized, reason: 'success' };
  } catch (err) {
    logger.debug('LLM notification generation failed, falling back to template', { error: err });
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Notification LLM timeout')) {
      return { text: null, reason: 'timeout' };
    }
    return { text: null, reason: 'error' };
  }
}

// ============================================================================
// Template Path
// ============================================================================

function sanitizeNotification(candidate: string): string | null {
  if (!candidate) return null;

  let text = candidate.replace(/\r\n/g, '\n');
  text = text.replace(/[ \t]+/g, ' ').trim();
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^\s*[-*]\s+/gm, '');
  text = text.replace(/^["'`]+|["'`]+$/g, '');
  text = text.replace(/\n{3,}/g, '\n\n');

  if (!text) return null;
  const lines = text.split('\n').slice(0, MAX_NOTIFICATION_LINES);
  text = lines.join('\n').trim();

  if (!text || text.length > MAX_NOTIFICATION_CHARS) return null;

  return text;
}

function pruneTemplateCache(nowMs: number): void {
  for (const [key, entry] of lastTemplateIndexByScopeAndEvent.entries()) {
    if (nowMs - entry.updatedAt > TEMPLATE_REPEAT_TTL_MS) {
      lastTemplateIndexByScopeAndEvent.delete(key);
    }
  }

  if (lastTemplateIndexByScopeAndEvent.size <= MAX_TEMPLATE_CACHE_ENTRIES) {
    return;
  }

  const overflow = lastTemplateIndexByScopeAndEvent.size - MAX_TEMPLATE_CACHE_ENTRIES;
  const oldest = Array.from(lastTemplateIndexByScopeAndEvent.entries())
    .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
    .slice(0, overflow);
  for (const [key] of oldest) {
    lastTemplateIndexByScopeAndEvent.delete(key);
  }
}

function pickRandomForEvent<T>(event: NotificationEvent, arr: T[], scopeKey?: string): T {
  if (arr.length === 1) return arr[0];

  const scope = scopeKey?.trim() || 'global';
  const cacheKey = `${scope}|${event}`;
  const nowMs = Date.now();
  pruneTemplateCache(nowMs);

  const prev = lastTemplateIndexByScopeAndEvent.get(cacheKey)?.index;
  let idx = Math.floor(Math.random() * arr.length);
  if (prev !== undefined && idx === prev) {
    metrics.duplicateSuppressions++;
    idx = (idx + 1 + Math.floor(Math.random() * (arr.length - 1))) % arr.length;
  }

  lastTemplateIndexByScopeAndEvent.set(cacheKey, { index: idx, updatedAt: nowMs });
  return arr[idx];
}

function templateNotification(event: NotificationEvent, data: NotificationData): string {
  const scopeKey = (
    ('scopeKey' in data && typeof data.scopeKey === 'string')
      ? data.scopeKey
      : undefined
  );

  switch (event) {
    case 'task:started':
      return pickRandomForEvent(event, STARTED_TEMPLATES, scopeKey)(data as StartedData);
    case 'task:progress':
      return pickRandomForEvent(event, PROGRESS_TEMPLATES, scopeKey)(data as ProgressData);
    case 'task:failed':
      return pickRandomForEvent(event, ERROR_TEMPLATES, scopeKey)(data as FailedData);
    case 'task:completed': {
      // Fallback template for completed (used when LLM fails)
      const d = data as CompletedData;
      const parts = [d.summary];
      const fileChanges: string[] = [];
      if (d.filesCreated?.length) fileChanges.push(`${d.filesCreated.length} created`);
      if (d.filesModified?.length) fileChanges.push(`${d.filesModified.length} modified`);
      if (d.filesDeleted?.length) fileChanges.push(`${d.filesDeleted.length} deleted`);
      if (fileChanges.length) parts.push(`Files: ${fileChanges.join(', ')}`);
      if (d.durationSec) parts.push(`Done in ${d.durationSec}s`);
      return parts.join('\n');
    }
    default:
      return 'Task update.';
  }
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Format a notification for a task event.
 *
 * This function always returns a usable message. If LLM rewriting is
 * unavailable, it falls back to template output.
 *
 * @param event - The task event type
 * @param data - Event-specific data
 * @returns Notification text without transport-specific prefixing
 */
export async function formatNotification(event: NotificationEvent, data: NotificationData): Promise<string> {
  metrics.total++;

  // LLM path for important messages
  if (event === 'task:completed' || event === 'task:failed') {
    metrics.rewriteAttempts++;
    const llmResult = await llmNotification(event, data);
    if (llmResult.reason === 'disabled') metrics.rewriteDisabled++;
    if (llmResult.reason === 'timeout') metrics.rewriteTimeouts++;
    if (llmResult.reason === 'error') metrics.rewriteErrors++;
    if (llmResult.reason === 'sanitize_reject') metrics.sanitizeRejects++;
    if (llmResult.text) {
      metrics.llmRewriteSuccess++;
      return llmResult.text;
    }
    metrics.templateFallback++;
    // Fall through to template on LLM failure
    return templateNotification(event, data);
  }

  // Template path for ephemeral messages and LLM fallback
  metrics.templateEphemeral++;
  return templateNotification(event, data);
}

/**
 * Returns a snapshot of notification formatter runtime metrics.
 */
export function getNotificationMetrics(): NotificationMetrics {
  return { ...metrics };
}

/**
 * Resets runtime metrics and template anti-repeat cache. Test helper.
 */
export function resetNotificationMetricsForTests(): void {
  metrics.total = 0;
  metrics.templateEphemeral = 0;
  metrics.llmRewriteSuccess = 0;
  metrics.templateFallback = 0;
  metrics.rewriteAttempts = 0;
  metrics.rewriteDisabled = 0;
  metrics.rewriteTimeouts = 0;
  metrics.rewriteErrors = 0;
  metrics.sanitizeRejects = 0;
  metrics.duplicateSuppressions = 0;
  lastTemplateIndexByScopeAndEvent.clear();
}
