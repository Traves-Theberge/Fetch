/**
 * @fileoverview Input Validator - Defense in Depth
 * 
 * Validates and sanitizes user input before processing. Provides additional
 * security layer beyond whitelist protection.
 * 
 * @module security/validator
 * @see {@link validateInput} - Main validation function
 * @see {@link sanitizePath} - Path traversal prevention
 * 
 * ## Validation Checks
 * 
 * 1. Null/undefined rejection
 * 2. Length limits (1 - 10,000 characters)
 * 3. Suspicious pattern detection
 * 4. Control character removal
 * 
 * ## Suspicious Patterns
 * 
 * | Pattern | Risk |
 * |---------|------|
 * | `$(...)` | Command substitution |
 * | Backticks | Backtick execution |
 * | `; rm -rf` | Command injection |
 * | Pipe to sh | Pipe to shell |
 * | `eval(` | Code injection |
 * | `__proto__` | Prototype pollution |
 * 
 * @example
 * ```typescript
 * import { validateInput, sanitizePath } from './validator.js';
 * 
 * const result = validateInput(userMessage);
 * if (result.valid) {
 *   processMessage(result.sanitized);
 * } else {
 *   console.log('Invalid:', result.error);
 * }
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of input validation.
 * @interface
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

/** Maximum message length to process */
const MAX_MESSAGE_LENGTH = 10000;

/** Minimum message length (filters empty/whitespace) */
const MIN_MESSAGE_LENGTH = 1;

/** Patterns indicating potential malicious input */
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

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validates and sanitizes user input.
 * 
 * @param {string} input - Raw user input
 * @returns {ValidationResult} Validation result with sanitized input
 * 
 * @example
 * ```typescript
 * validateInput('Hello world');
 * // → { valid: true, sanitized: 'Hello world' }
 * 
 * validateInput('$(rm -rf /)');
 * // → { valid: false, sanitized: '', error: 'Input contains...' }
 * ```
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
