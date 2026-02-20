/**
 * @fileoverview Sliding-window rate limiter for per-sender request control.
 *
 * Maintains per-key timestamp buckets and enforces max requests per time window.
 *
 * @module security/rateLimiter
 */

import { logger } from '../utils/logger.js';
import { getSessionStore } from '../session/store.js';
import crypto from 'crypto';

// =============================================================================
// RATE LIMITER CLASS
// =============================================================================

/**
 * Sliding-window limiter implementation.
 */
export class RateLimiter {
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
    const store = getSessionStore();
    return store.getRateLimits(key, cutoff);
  }

  /**
   * Returns true when current request is within limit for the key.
   * @param key - Unique identifier (e.g., phone number)
   * @returns true if allowed, false if rate limited
   */
  isAllowed(key: string): boolean {
    const ts = this.prune(key);

    if (ts.length >= this.maxRequests) {
      logger.warn(`Rate limit exceeded for ${key}`);
      return false;
    }

    const now = Date.now();
    const store = getSessionStore();
    store.insertRateLimit(key, now, crypto.randomUUID());

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
    const store = getSessionStore();
    store.clearRateLimits(key);
  }

  /**
   * Clears all limiter state.
   */
  clearAll(): void {
    const store = getSessionStore();
    store.clearAllRateLimits();
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
    const store = getSessionStore();
    store.pruneStaleRateLimits(cutoff);
  }
}
