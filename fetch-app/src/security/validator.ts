/**
 * Input Validator
 * 
 * Validates and sanitizes user input before processing.
 * Defense in depth - even with whitelist protection, we validate inputs.
 */

export interface ValidationResult {
  valid: boolean;
  sanitized: string;
  error?: string;
}

// Maximum message length we'll process
const MAX_MESSAGE_LENGTH = 10000;

// Minimum message length (to filter empty/whitespace only)
const MIN_MESSAGE_LENGTH = 1;

// Patterns that might indicate malicious input
const SUSPICIOUS_PATTERNS = [
  /\$\(.*\)/,           // Command substitution
  /`.*`/,               // Backtick command substitution
  /;\s*rm\s+-rf/i,      // Common destructive command
  />\s*\/dev\//,        // Device redirection
  /\|\s*sh\b/i,         // Pipe to shell
  /\|\s*bash\b/i,       // Pipe to bash
  /eval\s*\(/,          // JavaScript eval
  /__proto__/,          // Prototype pollution attempt
  /constructor\s*\[/,   // Prototype pollution attempt
];

/**
 * Validate and sanitize user input
 */
export function validateInput(input: string): ValidationResult {
  // Check for null/undefined
  if (input === null || input === undefined) {
    return { valid: false, sanitized: '', error: 'Empty input' };
  }

  // Trim whitespace
  const trimmed = input.trim();

  // Check minimum length
  if (trimmed.length < MIN_MESSAGE_LENGTH) {
    return { valid: false, sanitized: '', error: 'Message too short' };
  }

  // Check maximum length
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { 
      valid: false, 
      sanitized: '', 
      error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` 
    };
  }

  // Check for suspicious patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { 
        valid: false, 
        sanitized: '', 
        error: 'Input contains potentially unsafe content' 
      };
    }
  }

  // Sanitize: remove null bytes and control characters (except newlines)
  const sanitized = trimmed
    .replace(/\0/g, '')                    // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // Remove control chars

  return { valid: true, sanitized };
}

/**
 * Sanitize a file path to prevent directory traversal
 */
export function sanitizePath(path: string): string {
  return path
    .replace(/\.\./g, '')           // Remove parent directory references
    .replace(/\/+/g, '/')           // Collapse multiple slashes
    .replace(/^\//, '')             // Remove leading slash
    .replace(/[<>:"|?*]/g, '');     // Remove invalid characters
}
