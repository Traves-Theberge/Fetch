/**
 * @fileoverview Shared message deduplicator for bridge transports.
 *
 * TTL-based eviction prevents unbounded memory growth while ensuring
 * duplicate events within the window are suppressed.
 *
 * @module bridge/deduplicator
 */

import { pipeline } from '../config/pipeline.js';

/**
 * Deduplicate inbound message events by id with TTL eviction.
 */
export class MessageDeduplicator {
  private processedMessages = new Map<string, number>();
  private readonly TTL_MS = pipeline.deduplicationTtl;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Sweep every TTL interval instead of per-message
    this.cleanupTimer = setInterval(() => this.evict(), this.TTL_MS);
    this.cleanupTimer.unref();
  }

  /**
   * Mark and check message id.
   *
   * @returns `true` if message id was not seen in the current TTL window
   */
  isNew(messageId: string): boolean {
    if (this.processedMessages.has(messageId)) {
      return false;
    }
    this.processedMessages.set(messageId, Date.now());
    return true;
  }

  /** Remove cached ids older than TTL. */
  private evict(): void {
    const cutoff = Date.now() - this.TTL_MS;
    for (const [id, ts] of this.processedMessages) {
      if (ts <= cutoff) this.processedMessages.delete(id);
    }
  }
}
