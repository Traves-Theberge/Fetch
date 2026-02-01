/**
 * Rate Limiter
 * 
 * Prevents abuse by limiting the number of requests per time window.
 * Even though we have whitelist protection, rate limiting adds defense in depth.
 */

import { logger } from '../utils/logger.js';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

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
