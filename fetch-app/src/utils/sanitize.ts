/**
 * @fileoverview Output Sanitization Utilities
 * 
 * Cleans CLI output for safe display in WhatsApp. Removes ANSI codes,
 * progress bars, spinners, and other terminal artifacts.
 * 
 * @module utils/sanitize
 * @see {@link sanitizeOutput} - Main sanitization function
 * @see {@link escapeWhatsAppMarkdown} - Escape markdown characters
 * 
 * ## Sanitization Steps
 * 
 * 1. Remove ANSI escape codes (colors, cursor)
 * 2. Remove carriage returns (progress artifacts)
 * 3. Remove spinner characters
 * 4. Remove progress bar patterns
 * 5. Collapse multiple blank lines
 * 6. Trim whitespace from lines
 * 7. Truncate if too long
 * 
 * ## Limits
 * 
 * - Max output: 4,000 characters (WhatsApp limit is 65,536)
 * - Shorter limit ensures readability on mobile
 * 
 * @example
 * ```typescript
 * import { sanitizeOutput, escapeWhatsAppMarkdown } from './sanitize.js';
 * 
 * // Clean CLI output
 * const clean = sanitizeOutput(rawOutput);
 * 
 * // Escape markdown in user content
 * const safe = escapeWhatsAppMarkdown('*bold* text');
 * // → '\\*bold\\* text'
 * ```
 */

import stripAnsi from 'strip-ansi';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Maximum output length for WhatsApp messages.
 * WhatsApp has a 65536 character limit, but we keep it shorter for readability.
 * @constant {number}
 */
const MAX_OUTPUT_LENGTH = 4000;

// =============================================================================
// SANITIZATION
// =============================================================================

/**
 * Sanitizes CLI output for WhatsApp display.
 * 
 * Removes ANSI escape codes, progress bar artifacts, and other
 * terminal-specific formatting that doesn't render in WhatsApp.
 * 
 * @param {string} output - Raw CLI output
 * @returns {string} Cleaned output safe for WhatsApp
 * 
 * @example
 * ```typescript
 * const raw = '\x1b[32m✓\x1b[0m Done [====] 100%';
 * sanitizeOutput(raw);
 * // → '✓ Done'
 * ```
 */
export function sanitizeOutput(output: string): string {
  if (!output) {
    return 'No output';
  }

  let sanitized = output;

  // Remove ANSI escape codes
  sanitized = stripAnsi(sanitized);

  // Remove carriage returns (progress bar artifacts)
  sanitized = sanitized.replace(/\r/g, '');

  // Remove spinner characters
  sanitized = sanitized.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g, '');

  // Remove common progress bar patterns
  sanitized = sanitized.replace(/\[[-=>#\s]*\]\s*\d*%?/g, '');
  sanitized = sanitized.replace(/[█▓▒░]+/g, '');

  // Collapse multiple blank lines into one
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace from each line
  sanitized = sanitized
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();

  // Truncate if too long
  if (sanitized.length > MAX_OUTPUT_LENGTH) {
    sanitized = sanitized.slice(0, MAX_OUTPUT_LENGTH) + '\n\n... (output truncated)';
  }

  return sanitized;
}

/**
 * Escape special characters for WhatsApp markdown
 */
export function escapeWhatsAppMarkdown(text: string): string {
  // WhatsApp uses a subset of markdown
  // Escape characters that might break formatting
  return text
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`');
}
