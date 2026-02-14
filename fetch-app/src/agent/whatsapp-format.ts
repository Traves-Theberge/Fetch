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
  // Replace markdown headers with emoji
  let formatted = text
    .replace(/^### (.+)$/gm, '📌 *$1*')
    .replace(/^## (.+)$/gm, '📋 *$1*')
    .replace(/^# (.+)$/gm, '🔷 *$1*');
  
  // Clean up excessive whitespace
  formatted = formatted
    .replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
    .replace(/[ \t]+$/gm, '');    // Trim trailing whitespace per line
  
  // Wrap long lines for mobile
  formatted = wrapLongLines(formatted, MAX_LINE_LENGTH);
  
  // Truncate if too long
  if (formatted.length > MAX_MESSAGE_LENGTH) {
    formatted = formatted.substring(0, MAX_MESSAGE_LENGTH - 50) + '\n\n_... message truncated_';
  }
  
  return formatted;
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
