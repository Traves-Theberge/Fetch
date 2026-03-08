/**
 * @fileoverview Public exports for security controls.
 *
 * Includes authorization gate, whitelist store, rate limiter, and input validation helpers.
 *
 * @module security
 */

export { SecurityGate } from './gate.js';
export { DiscordSecurityGate, type DiscordGateConfig } from './discord-gate.js';
export { WhitelistStore, getWhitelistStore, getWhitelistStoreSync } from './whitelist.js';
export { RateLimiter } from './rateLimiter.js';
export { validateInput, sanitizePath, type ValidationResult } from './validator.js';
