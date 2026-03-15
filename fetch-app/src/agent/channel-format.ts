/**
 * @fileoverview Channel-specific message formatters.
 *
 * Each channel has different formatting constraints:
 * - WhatsApp: *bold*, _italic_, monospace with backticks, 40-char line width
 * - Slack: *bold*, _italic_, ```code blocks```, mrkdwn format
 * - Telegram: *bold*, _italic_, `code`, MarkdownV2
 * - Discord: **bold**, *italic*, ```code blocks```, full Markdown
 *
 * @module agent/channel-format
 */

import type { ResponseEnvelope } from './envelope.js';
import type { ChannelType } from '../bridge/interface.js';
import { composeWhatsAppResponse } from './composer.js';
import { formatAndChunkForWhatsApp, formatForWhatsApp } from './whatsapp-format.js';
import type { ResponseIntent } from './response-policy.js';

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Format a response envelope for a specific channel and split into send-ready chunks.
 */
export function formatForChannel(
  envelope: ResponseEnvelope,
  channel: ChannelType,
  intent?: ResponseIntent,
): string[] {
  switch (channel) {
    case 'whatsapp':
      return formatAndChunkForWhatsApp(composeWhatsAppResponse(envelope), intent);
    case 'slack':
      return [composeSlackResponse(envelope)];
    case 'telegram':
      return [composeTelegramResponse(envelope)];
    case 'discord':
      return [composeDiscordResponse(envelope)];
  }
}

/**
 * Format raw text for a specific channel.
 */
export function formatTextForChannel(text: string, channel: ChannelType): string {
  switch (channel) {
    case 'whatsapp':
      return formatForWhatsApp(text);
    case 'slack':
      return formatForSlack(text);
    case 'telegram':
      return formatForTelegram(text);
    case 'discord':
      return formatForDiscord(text);
  }
}

// =============================================================================
// SLACK FORMATTING
// =============================================================================

function severityEmoji(severity: ResponseEnvelope['severity']): string {
  switch (severity) {
    case 'success': return ':white_check_mark:';
    case 'warning': return ':warning:';
    case 'error': return ':x:';
    default: return ':memo:';
  }
}

function composeSlackResponse(envelope: ResponseEnvelope): string {
  const lines: string[] = [];
  const icon = envelope.emojiLevel === 'normal' ? severityEmoji(envelope.severity) : '';

  if (envelope.title?.trim()) {
    lines.push(`${icon} *${envelope.title.trim()}*`.trim());
  }

  lines.push(`${icon} ${envelope.summary}`.trim());

  for (const fact of envelope.facts ?? []) {
    lines.push(`> *${fact.label}*: ${fact.value}`);
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

function formatForSlack(text: string): string {
  let formatted = text.replace(/\r\n?/g, '\n');

  // Convert markdown headers to Slack bold
  formatted = formatted
    .replace(/^### (.+)$/gm, '*$1*')
    .replace(/^## (.+)$/gm, '*$1*')
    .replace(/^# (.+)$/gm, '*$1*');

  // Convert markdown bold to Slack bold
  formatted = formatted
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/__([^_\n]+)__/g, '*$1*');

  // Clean up excessive whitespace
  formatted = formatted
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '');

  // Slack has a 40,000 char limit per message
  if (formatted.length > 39000) {
    formatted = formatted.substring(0, 39000) + '\n\n_... message truncated_';
  }

  return formatted;
}

// =============================================================================
// TELEGRAM FORMATTING
// =============================================================================

function composeTelegramResponse(envelope: ResponseEnvelope): string {
  const lines: string[] = [];
  const icon = envelope.emojiLevel === 'normal' ? severityEmojiUnicode(envelope.severity) : '';

  if (envelope.title?.trim()) {
    lines.push(`${icon} <b>${escapeHtml(envelope.title.trim())}</b>`.trim());
  }

  lines.push(`${icon} ${escapeHtml(envelope.summary)}`.trim());

  for (const fact of envelope.facts ?? []) {
    lines.push(`- <b>${escapeHtml(fact.label)}</b>: ${escapeHtml(fact.value)}`);
  }

  for (const action of envelope.actions ?? []) {
    const target = action.target ? ` ${escapeHtml(action.target)}` : '';
    const detail = action.detail ? ` - ${escapeHtml(action.detail)}` : '';
    lines.push(`- ${escapeHtml(action.verb)}${target}: ${escapeHtml(action.outcome)}${detail}`);
  }

  if (envelope.options?.length) {
    lines.push(`- Next: ${envelope.options.map((o) => escapeHtml(o.label)).join(' | ')}`);
  }

  if (envelope.ask?.trim()) {
    lines.push(escapeHtml(envelope.ask.trim()));
  }

  return lines.filter(Boolean).join('\n');
}

function severityEmojiUnicode(severity: ResponseEnvelope['severity']): string {
  switch (severity) {
    case 'success': return '\u2705';
    case 'warning': return '\u26a0\ufe0f';
    case 'error': return '\u274c';
    default: return '\ud83d\udcdd';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatForTelegram(text: string): string {
  let formatted = text.replace(/\r\n?/g, '\n');

  // Convert markdown headers to bold HTML
  formatted = formatted
    .replace(/^### (.+)$/gm, '<b>$1</b>')
    .replace(/^## (.+)$/gm, '<b>$1</b>')
    .replace(/^# (.+)$/gm, '<b>$1</b>');

  // Convert markdown bold/italic to HTML
  formatted = formatted
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/__([^_\n]+)__/g, '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g, '<i>$1</i>')
    .replace(/_([^_\n]+)_/g, '<i>$1</i>');

  // Convert inline code
  formatted = formatted.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Clean up whitespace
  formatted = formatted
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '');

  // Telegram message limit is 4096 characters
  if (formatted.length > 4000) {
    formatted = formatted.substring(0, 4000) + '\n\n<i>... message truncated</i>';
  }

  return formatted;
}

// =============================================================================
// DISCORD FORMATTING
// =============================================================================

function composeDiscordResponse(envelope: ResponseEnvelope): string {
  const lines: string[] = [];
  const icon = envelope.emojiLevel === 'normal' ? severityEmojiUnicode(envelope.severity) : '';

  if (envelope.title?.trim()) {
    lines.push(`${icon} **${envelope.title.trim()}**`.trim());
  }

  lines.push(`${icon} ${envelope.summary}`.trim());

  for (const fact of envelope.facts ?? []) {
    lines.push(`> **${fact.label}**: ${fact.value}`);
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

function formatForDiscord(text: string): string {
  let formatted = text.replace(/\r\n?/g, '\n');

  // Discord supports full Markdown natively, minimal transformation needed
  // Just clean up whitespace
  formatted = formatted
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '');

  // Discord message limit is 2000 characters
  if (formatted.length > 1950) {
    formatted = formatted.substring(0, 1950) + '\n\n*... message truncated*';
  }

  return formatted;
}
