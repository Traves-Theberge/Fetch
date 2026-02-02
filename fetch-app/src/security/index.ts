/**
 * @fileoverview Security Module Barrel Exports
 * 
 * Re-exports all security components: whitelist enforcement, rate limiting,
 * and input validation.
 * 
 * @module security
 * @see {@link module:security/gate} For SecurityGate whitelist enforcement
 * @see {@link module:security/rateLimiter} For RateLimiter abuse prevention
 * @see {@link module:security/validator} For input validation utilities
 * 
 * @example
 * ```typescript
 * import { SecurityGate, RateLimiter, validateInput } from './security/index.js';
 * 
 * const gate = new SecurityGate();
 * const limiter = new RateLimiter();
 * 
 * if (gate.isAllowed(phoneNumber) && limiter.checkLimit(phoneNumber)) {
 *   const result = validateInput(message);
 *   // Process message...
 * }
 * ```
 */

export { SecurityGate } from './gate.js';
export { RateLimiter } from './rateLimiter.js';
export { validateInput, sanitizePath, type ValidationResult } from './validator.js';
