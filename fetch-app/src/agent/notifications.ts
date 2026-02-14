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
}

interface CompletedData {
  summary: string;
  filesCreated?: string[];
  filesModified?: string[];
  filesDeleted?: string[];
  durationSec?: number;
}

interface FailedData {
  error: string;
  goal?: string;
}

interface ProgressData {
  message: string;
  action?: string;
}

type NotificationData = StartedData | CompletedData | FailedData | ProgressData;

const NOTIFICATION_TIMEOUT_MS = 2000;
const MAX_NOTIFICATION_CHARS = 500;
const MAX_NOTIFICATION_LINES = 4;
const lastTemplateIndexByEvent = new Map<NotificationEvent, number>();

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
async function llmNotification(event: NotificationEvent, data: NotificationData): Promise<string | null> {
  if (process.env.FETCH_NOTIFICATION_REWRITE === 'false') {
    return null;
  }

  try {
    const voiceTone = getIdentityManager().getVoiceTone();

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
      setTimeout(() => reject(new Error('Notification LLM timeout')), NOTIFICATION_TIMEOUT_MS)
    );

    const response = await Promise.race([request, timeout]);
    const candidate = response.choices[0]?.message?.content?.trim() ?? '';
    return sanitizeNotification(candidate);
  } catch (err) {
    logger.debug('LLM notification generation failed, falling back to template', { error: err });
    return null;
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

function pickRandomForEvent<T>(event: NotificationEvent, arr: T[]): T {
  if (arr.length === 1) return arr[0];

  const prev = lastTemplateIndexByEvent.get(event);
  let idx = Math.floor(Math.random() * arr.length);
  if (prev !== undefined && idx === prev) {
    idx = (idx + 1 + Math.floor(Math.random() * (arr.length - 1))) % arr.length;
  }

  lastTemplateIndexByEvent.set(event, idx);
  return arr[idx];
}

function templateNotification(event: NotificationEvent, data: NotificationData): string {
  switch (event) {
    case 'task:started':
      return pickRandomForEvent(event, STARTED_TEMPLATES)(data as StartedData);
    case 'task:progress':
      return pickRandomForEvent(event, PROGRESS_TEMPLATES)(data as ProgressData);
    case 'task:failed':
      return pickRandomForEvent(event, ERROR_TEMPLATES)(data as FailedData);
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
  // LLM path for important messages
  if (event === 'task:completed' || event === 'task:failed') {
    const llmResult = await llmNotification(event, data);
    if (llmResult) return llmResult;
    // Fall through to template on LLM failure
  }

  // Template path for ephemeral messages and LLM fallback
  return templateNotification(event, data);
}
