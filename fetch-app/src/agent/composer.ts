/**
 * @fileoverview Final user-facing text composer for structured response envelopes.
 *
 * @module agent/composer
 */

import type { ResponseEnvelope } from './envelope.js';

function severityEmoji(severity: ResponseEnvelope['severity']): string {
  switch (severity) {
    case 'success':
      return '✅';
    case 'warning':
      return '⚠️';
    case 'error':
      return '❌';
    default:
      return '📝';
  }
}

/**
 * Compose WhatsApp-friendly text from a structured envelope.
 */
export function composeWhatsAppResponse(envelope: ResponseEnvelope): string {
  const lines: string[] = [];
  const icon = envelope.emojiLevel === 'normal' ? severityEmoji(envelope.severity) : '';

  if (envelope.title?.trim()) {
    lines.push(`${icon} *${envelope.title.trim()}*`.trim());
  }

  lines.push(`${icon} ${envelope.summary}`.trim());

  for (const fact of envelope.facts ?? []) {
    lines.push(`• *${fact.label}*: ${fact.value}`);
  }

  for (const action of envelope.actions ?? []) {
    const target = action.target ? ` ${action.target}` : '';
    const detail = action.detail ? ` - ${action.detail}` : '';
    lines.push(`• ${action.verb}${target}: ${action.outcome}${detail}`);
  }

  if (envelope.options?.length) {
    lines.push(`• Next: ${envelope.options.map((o) => o.label).join(' | ')}`);
  }

  if (envelope.ask?.trim()) {
    lines.push(envelope.ask.trim());
  }

  return lines.filter(Boolean).join('\n');
}

/**
 * Compose Discord-friendly text from a structured envelope.
 *
 * Uses standard markdown (**bold**) and `- ` bullets since Discord renders
 * markdown natively.
 */
export function composeDiscordResponse(envelope: ResponseEnvelope): string {
  const lines: string[] = [];
  const icon = envelope.emojiLevel === 'normal' ? severityEmoji(envelope.severity) : '';

  if (envelope.title?.trim()) {
    lines.push(`${icon} **${envelope.title.trim()}**`.trim());
  }

  lines.push(`${icon} ${envelope.summary}`.trim());

  for (const fact of envelope.facts ?? []) {
    lines.push(`- **${fact.label}**: ${fact.value}`);
  }

  for (const action of envelope.actions ?? []) {
    const target = action.target ? ` ${action.target}` : '';
    const detail = action.detail ? ` - ${action.detail}` : '';
    lines.push(`- ${action.verb}${target}: ${action.outcome}${detail}`);
  }

  if (envelope.options?.length) {
    lines.push(`- Next: ${envelope.options.map((o) => o.label).join(' | ')}`);
  }

  if (envelope.ask?.trim()) {
    lines.push(envelope.ask.trim());
  }

  return lines.filter(Boolean).join('\n');
}

