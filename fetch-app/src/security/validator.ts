/**
 * @fileoverview Input validation and sanitization helpers.
 *
 * Validates message length/content and sanitizes file paths before downstream handling.
 *
 * @module security/validator
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result object returned by `validateInput`.
 */
export interface ValidationResult {
  /** Whether input passed validation */
  valid: boolean;
  /** Sanitized input (if valid) */
  sanitized: string;
  /** Error message (if invalid) */
  error?: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Maximum message length accepted for processing. */
const MAX_MESSAGE_LENGTH = 10000;

/** Minimum non-whitespace message length. */
const MIN_MESSAGE_LENGTH = 1;

/** Patterns treated as unsafe input. */
const SUSPICIOUS_PATTERNS = [
  /\$\(.*\)/,           // Command substitution
  /;\s*rm\s+-rf/i,      // Common destructive command
  />\s*\/dev\//,        // Device redirection
  /\|\s*sh\b/i,         // Pipe to shell
  /\|\s*bash\b/i,       // Pipe to bash
  /eval\s*\(/,          // JavaScript eval
  /__proto__/,          // Prototype pollution attempt
  /constructor\s*\[/,   // Prototype pollution attempt
];

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validates and sanitizes a user message before processing.
 *
 * @param input - Raw user input
 * @returns Validation result with sanitized text or rejection reason
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
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // Remove control chars

  return { valid: true, sanitized };
}

/**
 * Sanitizes relative file paths to reduce traversal and invalid-character risks.
 */
export function sanitizePath(path: string): string {
  let normalized = path
    .replace(/\\/g, '/')            // Normalize Windows separators
    .replace(/^[a-zA-Z]:/, '')      // Strip drive letter prefixes (C:, D:, ...)
    .replace(/^\/\/[^/]+\/[^/]+/, ''); // Strip UNC host/share prefixes

  const parts = normalized
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .map((segment) => segment.replace(/[<>:"|?*]/g, ''))
    .filter((segment) => segment.length > 0);

  normalized = parts.join('/').replace(/\/+/g, '/');
  return normalized.replace(/^\/+/, '');
}
