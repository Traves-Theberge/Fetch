/**
 * @fileoverview Rate Limiter - Abuse Prevention
 * 
 * Prevents abuse by limiting requests per time window. Provides defense
 * in depth even with whitelist protection.
 * 
 * @module security/rateLimiter
 * @see {@link RateLimiter} - Main limiter class
 * 
 * ## Algorithm
 * 
 * Uses a sliding window counter approach:
 * - Each key (user) has a window start time and count
 * - Requests within the window increment the count
 * - Once window expires, count resets
 * 
 * ## Default Limits
 * 
 * - 30 requests per 60 seconds
 * - Configurable via constructor
 * 
 * @example
 * ```typescript
 * const limiter = new RateLimiter(30, 60000); // 30 req/min
 * 
 * if (limiter.isAllowed(userId)) {
 *   // Process request
 * } else {
 *   // Reject: rate limited
 * }
 * 
 * // Check remaining quota
 * const remaining = limiter.getRemaining(userId);
 * ```
 */

import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Rate limit tracking entry for a single key.
 * @interface
 */
interface RateLimitEntry {
  /** Number of requests in current window */
  count: number;
  /** Timestamp when window started */
  windowStart: number;
}

// =============================================================================
// RATE LIMITER CLASS
// =============================================================================

/**
 * Sliding window rate limiter.
 * 
 * Tracks request counts per key within configurable time windows.
 * 
 * @class
 */
export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 30, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request should be allowed
   * @param key - Unique identifier (e.g., phone number)
   * @returns true if allowed, false if rate limited
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry) {
      // First request
      this.limits.set(key, { count: 1, windowStart: now });
      return true;
    }

    // Check if window has expired
    if (now - entry.windowStart > this.windowMs) {
      // Reset window
      this.limits.set(key, { count: 1, windowStart: now });
      return true;
    }

    // Within window, check count
    if (entry.count >= this.maxRequests) {
      logger.warn(`Rate limit exceeded for ${key}`);
      return false;
    }

    // Increment count
    entry.count++;
    return true;
  }

  /**
   * Get remaining requests for a key
   */
  getRemaining(key: string): number {
    const entry = this.limits.get(key);
    if (!entry) return this.maxRequests;

    const now = Date.now();
    if (now - entry.windowStart > this.windowMs) {
      return this.maxRequests;
    }

    return Math.max(0, this.maxRequests - entry.count);
  }

  /**
   * Clear rate limit for a key (useful for testing)
   */
  clear(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Clear all rate limits
   */
  clearAll(): void {
    this.limits.clear();
  }
}
