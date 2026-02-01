/**
 * Output Sanitization Utilities
 * 
 * Cleans CLI output for safe display in WhatsApp.
 * Removes ANSI codes, progress bars, and other terminal artifacts.
 */

import stripAnsi from 'strip-ansi';

/**
 * Maximum output length for WhatsApp messages
 * WhatsApp has a 65536 character limit, but we keep it shorter for readability
 */
const MAX_OUTPUT_LENGTH = 4000;

/**
 * Sanitize CLI output for WhatsApp display
 * 
 * - Removes ANSI escape codes (colors, cursor movement)
 * - Removes progress bar artifacts
 * - Truncates to safe length
 * - Removes excessive whitespace
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
