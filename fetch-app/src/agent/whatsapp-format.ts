/**
 * @fileoverview WhatsApp output text normalizer.
 *
 * Applies lightweight transformations for mobile readability:
 * - markdown header conversion
 * - whitespace cleanup
 * - line wrapping
 * - length truncation
 * 
 * @module agent/whatsapp-format
 * @see {@link formatForWhatsApp} Main formatting entry point
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

import { pipeline } from '../config/pipeline.js';
import type { ResponseIntent } from './response-policy.js';

export interface WhatsAppFormatMetrics {
  normalizedCount: number;
  chunkedCount: number;
  fallbackSplitCount: number;
}

const formatMetrics: WhatsAppFormatMetrics = {
  normalizedCount: 0,
  chunkedCount: 0,
  fallbackSplitCount: 0,
};

/**
 * Maximum characters per line for comfortable mobile reading.
 * WhatsApp displays ~35-40 chars per line on most phones.
 */
const MAX_LINE_LENGTH = pipeline.whatsappLineWidth;

/**
 * Maximum total message length (WhatsApp supports up to 65536).
 * Keep much shorter for readability.
 */
const MAX_MESSAGE_LENGTH = pipeline.whatsappMaxLength;

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Format text for WhatsApp transport/display constraints.
 * 
 * @param text - Raw text to format
 * @returns Normalized text ready for WhatsApp send
 */
export function formatForWhatsApp(text: string): string {
  const original = text;
  // Normalize line endings first for predictable transforms.
  let formatted = text.replace(/\r\n?/g, '\n');

  // Split collapsed markdown bullets that often arrive as one wrapped paragraph.
  formatted = formatted
    .replace(/\s*-\s+\*\*([^*]+)\*\*:/g, '\n• *$1*:')
    .replace(/\s*-\s+`([^`]+)`\s*[—-]/g, '\n• `$1` -');

  // Replace markdown headers with emoji
  formatted = formatted
    .replace(/^### (.+)$/gm, '📌 *$1*')
    .replace(/^## (.+)$/gm, '📋 *$1*')
    .replace(/^# (.+)$/gm, '🔷 *$1*');

  // Convert markdown emphasis to WhatsApp-friendly formatting.
  formatted = formatted
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/__([^_\n]+)__/g, '*$1*');

  // Normalize markdown list prefixes into clean bullets.
  formatted = formatted
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ')
    .replace(/\n[ \t]*\d+\.[ \t]+/g, '\n• ');
  
  // Clean up excessive whitespace
  formatted = formatted
    .replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
    .replace(/[ \t]+$/gm, '')     // Trim trailing whitespace per line
    .replace(/[ \t]{2,}/g, ' ');  // Collapse repeated spaces
  
  // Wrap long lines for mobile
  formatted = wrapLongLines(formatted, MAX_LINE_LENGTH);
  
  // Truncate if too long
  if (formatted.length > MAX_MESSAGE_LENGTH) {
    formatted = formatted.substring(0, MAX_MESSAGE_LENGTH - 50) + '\n\n_... message truncated_';
  }

  if (formatted !== original) {
    formatMetrics.normalizedCount += 1;
  }
  
  return formatted;
}

/**
 * Format text with intent-aware behavior and chunk into send-ready WhatsApp messages.
 */
export function formatAndChunkForWhatsApp(text: string, intent?: ResponseIntent): string[] {
  const formatted = formatForWhatsApp(text);
  const limit = resolveChunkLimit(intent);
  if (formatted.length <= limit) return [formatted];

  const blocks = formatted.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const block of blocks) {
    if (!current) {
      current = block;
      continue;
    }
    const next = `${current}\n\n${block}`;
    if (next.length > limit) {
      chunks.push(current);
      current = block;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  // Fallback split for oversized single blocks.
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= limit) {
      finalChunks.push(chunk);
      continue;
    }
    const lines = chunk.split('\n');
    let part = '';
    let usedFallback = false;
    for (const line of lines) {
      const candidate = part ? `${part}\n${line}` : line;
      if (candidate.length > limit && part) {
        finalChunks.push(part);
        part = line;
        usedFallback = true;
      } else {
        part = candidate;
      }
    }
    if (part) finalChunks.push(part);
    if (usedFallback) formatMetrics.fallbackSplitCount += 1;
  }

  if (finalChunks.length > 1) {
    formatMetrics.chunkedCount += 1;
  }

  return finalChunks.filter(Boolean);
}

export function getWhatsAppFormatMetrics(): WhatsAppFormatMetrics {
  return { ...formatMetrics };
}

export function resetWhatsAppFormatMetrics(): void {
  formatMetrics.normalizedCount = 0;
  formatMetrics.chunkedCount = 0;
  formatMetrics.fallbackSplitCount = 0;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Wrap long lines at word boundaries while avoiding code-like lines.
 */
function wrapLongLines(text: string, maxLength: number): string {
  return text.split('\n').map(line => {
    if (line.length <= maxLength || line.startsWith('```')) {
      return line;
    }
    
    // Don't wrap code-like lines
    if (line.includes('`') || line.startsWith(' ') || line.startsWith('\t')) {
      return line;
    }
    
    // Word wrap
    const words = line.split(' ');
    const lines: string[] = [];
    let current = '';
    
    for (const word of words) {
      if ((current + ' ' + word).trim().length > maxLength) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (current) lines.push(current);
    
    return lines.join('\n');
  }).join('\n');
}

function resolveChunkLimit(intent?: ResponseIntent): number {
  if (intent === 'tool_inventory') {
    return Math.min(MAX_MESSAGE_LENGTH, 1200);
  }
  return Math.min(MAX_MESSAGE_LENGTH, 2200);
}
