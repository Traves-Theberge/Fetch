/**
 * @fileoverview Compose task progress updates into WhatsApp-safe message chunks.
 *
 * @module bridge/progress-message
 */

import { formatNotification } from '../agent/notifications.js';
import { composeWhatsAppResponse } from '../agent/composer.js';
import { formatAndChunkForWhatsApp } from '../agent/whatsapp-format.js';
import type { ResponseEnvelope } from '../agent/envelope.js';

/**
 * Build user-facing WhatsApp chunks for a task progress update.
 *
 * Falls back to the raw message if notification formatting fails.
 */
export async function composeTaskProgressMessages(message: string, scopeKey: string): Promise<string[]> {
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
    const composed = composeWhatsAppResponse(envelope);
    return formatAndChunkForWhatsApp(composed);
  } catch {
    const fallbackEnvelope: ResponseEnvelope = {
      kind: 'progress',
      severity: 'info',
      mode: 'conversational',
      emojiLevel: 'normal',
      title: 'Progress Update',
      summary: trimmed,
    };
    return formatAndChunkForWhatsApp(composeWhatsAppResponse(fallbackEnvelope));
  }
}

export function composeTaskFileOpMessages(operation: string, path: string): string[] {
  const action = operation === 'modify' ? 'Modified' : operation === 'create' ? 'Created' : 'Deleted';
  const envelope: ResponseEnvelope = {
    kind: 'progress',
    severity: 'info',
    mode: 'conversational',
    emojiLevel: 'normal',
    title: 'Workspace Update',
    summary: `${action} ${path}`,
  };
  return formatAndChunkForWhatsApp(composeWhatsAppResponse(envelope));
}

export function composeTaskQuestionMessages(question: string): string[] {
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
  return formatAndChunkForWhatsApp(composeWhatsAppResponse(envelope));
}
