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
 * True sliding window: tracks individual request timestamps per key.
 * On each call, timestamps older than `windowMs` are pruned.
 * A periodic eviction sweep (every 2× windowMs) removes stale keys.
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
// RATE LIMITER CLASS
// =============================================================================

/**
 * Sliding-window rate limiter.
 * 
 * Tracks individual request timestamps per key within configurable
 * time windows for accurate rate enforcement.
 * 
 * @class
 */
export class RateLimiter {
  /** Per-key arrays of request timestamps (epoch ms) */
  private timestamps: Map<string, number[]> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private evictionTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxRequests: number = 30, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Periodic eviction: remove keys with no recent activity
    this.evictionTimer = setInterval(() => this.evictStale(), windowMs * 2);
    // Allow Node to exit even if the timer is still alive
    if (this.evictionTimer.unref) this.evictionTimer.unref();
  }

  /**
   * Check if a request should be allowed
   * @param key - Unique identifier (e.g., phone number)
   * @returns true if allowed, false if rate limited
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let ts = this.timestamps.get(key);
    if (!ts) {
      ts = [];
      this.timestamps.set(key, ts);
    }

    // Prune timestamps outside the window
    while (ts.length > 0 && ts[0] <= cutoff) {
      ts.shift();
    }

    if (ts.length >= this.maxRequests) {
      logger.warn(`Rate limit exceeded for ${key}`);
      return false;
    }

    ts.push(now);
    return true;
  }

  /**
   * Get remaining requests for a key
   */
  getRemaining(key: string): number {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const ts = this.timestamps.get(key);
    if (!ts) return this.maxRequests;

    const recent = ts.filter((t) => t > cutoff).length;
    return Math.max(0, this.maxRequests - recent);
  }

  /**
   * Clear rate limit for a key (useful for testing)
   */
  clear(key: string): void {
    this.timestamps.delete(key);
  }

  /**
   * Clear all rate limits
   */
  clearAll(): void {
    this.timestamps.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /** Remove keys whose newest timestamp is older than the window. */
  private evictStale(): void {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, ts] of this.timestamps) {
      if (ts.length === 0 || ts[ts.length - 1] <= cutoff) {
        this.timestamps.delete(key);
      }
    }
  }
}
