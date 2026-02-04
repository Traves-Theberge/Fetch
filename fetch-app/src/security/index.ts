/**
 * @fileoverview Security Module Barrel Exports
 * 
 * Re-exports all security components: whitelist enforcement, rate limiting,
 * input validation, and Zero Trust Bonding.
 * 
 * @module security
 * @see {@link module:security/gate} For SecurityGate whitelist enforcement
 * @see {@link module:security/whitelist} For WhitelistStore trusted numbers
 * @see {@link module:security/rateLimiter} For RateLimiter abuse prevention
 * @see {@link module:security/validator} For input validation utilities
 * 
 * @example
 * ```typescript
 * import { SecurityGate, WhitelistStore, RateLimiter, validateInput } from './security/index.js';
 * 
 * const gate = await SecurityGate.create();
 * const limiter = new RateLimiter();
 * 
 * if (gate.isAuthorized(senderId, participantId, message) && limiter.checkLimit(phoneNumber)) {
 *   const result = validateInput(message);
 *   // Process message...
 * }
 * ```
 */

export { SecurityGate } from './gate.js';
export { WhitelistStore, getWhitelistStore, getWhitelistStoreSync } from './whitelist.js';
export { RateLimiter } from './rateLimiter.js';
export { validateInput, sanitizePath, type ValidationResult } from './validator.js';
