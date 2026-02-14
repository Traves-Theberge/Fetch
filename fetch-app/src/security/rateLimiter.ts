/**
 * @fileoverview Sliding-window rate limiter for per-sender request control.
 *
 * Maintains per-key timestamp buckets and enforces max requests per time window.
 *
 * @module security/rateLimiter
 */

import { logger } from '../utils/logger.js';

// =============================================================================
// RATE LIMITER CLASS
// =============================================================================

/**
 * Sliding-window limiter implementation.
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
    this.evictionTimer.unref();
  }

  /**
   * Prune timestamps outside the current window for a key.
   * Mutates the stored array in place and returns it.
   *
   * @param key - Unique identifier
   * @returns The pruned timestamp array (may be empty)
   */
  private prune(key: string): number[] {
    const cutoff = Date.now() - this.windowMs;
    const ts = this.timestamps.get(key);
    if (!ts) return [];

    while (ts.length > 0 && ts[0] <= cutoff) {
      ts.shift();
    }
    return ts;
  }

  /**
   * Returns true when current request is within limit for the key.
   * @param key - Unique identifier (e.g., phone number)
   * @returns true if allowed, false if rate limited
   */
  isAllowed(key: string): boolean {
    let ts = this.timestamps.get(key);
    if (!ts) {
      ts = [];
      this.timestamps.set(key, ts);
    }

    this.prune(key);

    if (ts.length >= this.maxRequests) {
      logger.warn(`Rate limit exceeded for ${key}`);
      return false;
    }

    ts.push(Date.now());
    return true;
  }

  /**
   * Returns remaining quota for the current window.
   */
  getRemaining(key: string): number {
    const ts = this.prune(key);
    return Math.max(0, this.maxRequests - ts.length);
  }

  /**
   * Clears stored timestamps for one key.
   */
  clear(key: string): void {
    this.timestamps.delete(key);
  }

  /**
   * Clears all limiter state.
   */
  clearAll(): void {
    this.timestamps.clear();
  }

  /**
   * Stops eviction timer and clears limiter state.
   */
  shutdown(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
    this.clearAll();
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
