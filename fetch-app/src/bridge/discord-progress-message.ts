/**
 * @fileoverview Compose task progress updates into Discord-safe message chunks.
 *
 * @module bridge/discord-progress-message
 */

import { formatNotification } from '../agent/notifications.js';
import { composeDiscordResponse } from '../agent/composer.js';
import { formatAndChunkForDiscord } from '../agent/discord-format.js';
import type { ResponseEnvelope } from '../agent/envelope.js';

/**
 * Build user-facing Discord chunks for a task progress update.
 *
 * Falls back to the raw message if notification formatting fails.
 */
export async function composeDiscordTaskProgressMessages(message: string, scopeKey: string): Promise<string[]> {
  const trimmed = message.trim();
  if (!trimmed) return [];

  try {
    const notification = await formatNotification('task:progress', {
      message: trimmed,
      scopeKey,
    });
    const envelope: ResponseEnvelope = {
      kind: 'progress',
      severity: 'info',
      mode: 'conversational',
      emojiLevel: 'normal',
      title: 'Progress Update',
      summary: notification,
    };
    const composed = composeDiscordResponse(envelope);
    return formatAndChunkForDiscord(composed);
  } catch {
    const fallbackEnvelope: ResponseEnvelope = {
      kind: 'progress',
      severity: 'info',
      mode: 'conversational',
      emojiLevel: 'normal',
      title: 'Progress Update',
      summary: trimmed,
    };
    return formatAndChunkForDiscord(composeDiscordResponse(fallbackEnvelope));
  }
}

export function composeDiscordTaskFileOpMessages(operation: string, path: string): string[] {
  const action = operation === 'modify' ? 'Modified' : operation === 'create' ? 'Created' : 'Deleted';
  const envelope: ResponseEnvelope = {
    kind: 'progress',
    severity: 'info',
    mode: 'conversational',
    emojiLevel: 'normal',
    title: 'Workspace Update',
    summary: `${action} ${path}`,
  };
  return formatAndChunkForDiscord(composeDiscordResponse(envelope));
}

export function composeDiscordTaskQuestionMessages(question: string): string[] {
  const trimmed = question.trim();
  if (!trimmed) return [];
  const envelope: ResponseEnvelope = {
    kind: 'clarification',
    severity: 'warning',
    mode: 'conversational',
    emojiLevel: 'normal',
    title: 'Input Needed',
    summary: trimmed,
    ask: 'Reply to this message and I will continue.',
  };
  return formatAndChunkForDiscord(composeDiscordResponse(envelope));
}
