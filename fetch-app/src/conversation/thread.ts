/**
 * @fileoverview Thread Manager
 * 
 * Manages conversation threads (sessions) to maintain context over time.
 */

import { ConversationThread, ConversationMode } from './types.js';
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';

export class ThreadManager {
  private static instance: ThreadManager | undefined;
  private threads: Map<string, ConversationThread> = new Map();
  private activeThreadId: string | null = null;
  // Map project IDs to thread IDs? Or store in DB?
  // For MVP, simple in-memory map.

  public static getInstance(): ThreadManager {
    if (!ThreadManager.instance) {
      ThreadManager.instance = new ThreadManager();
    }
    return ThreadManager.instance as ThreadManager;
  }

  /**
   * Create a new conversation thread
   */
  public createThread(projectId?: string, initialMode: ConversationMode = 'CHAT'): ConversationThread {
    const thread: ConversationThread = {
      id: `thd_${nanoid(8)}`,
      projectId,
      mode: initialMode,
      startedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      messageCount: 0
    };

    this.threads.set(thread.id, thread);
    this.activeThreadId = thread.id;
    
    logger.debug(`Created new thread: ${thread.id} [${initialMode}]`);
    return thread;
  }

  /**
   * Get the currently active thread, or create a default one
   */
  public getActiveThread(): ConversationThread {
    if (this.activeThreadId && this.threads.has(this.activeThreadId)) {
      return this.threads.get(this.activeThreadId)!;
    }
    
    // Create default/fallback thread
    return this.createThread();
  }

  /**
   * Switch active thread
   */
  public switchThread(threadId: string): boolean {
    if (this.threads.has(threadId)) {
      this.activeThreadId = threadId;
      logger.debug(`Switched to thread: ${threadId}`);
      return true;
    }
    return false;
  }

  /**
   * Update thread activity
   */
  public updateActivity(threadId: string, updates: Partial<ConversationThread> = {}): void {
      const thread = this.threads.get(threadId);
      if (thread) {
          Object.assign(thread, {
              ...updates,
              lastActive: new Date().toISOString(),
              messageCount: thread.messageCount + 1
          });
      }
  }

  public listThreads(): ConversationThread[] {
      return Array.from(this.threads.values());
  }
}

export const threadManager = ThreadManager.getInstance();
