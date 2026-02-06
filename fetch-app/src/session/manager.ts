/**
 * @fileoverview Session Manager - High-Level Session API
 * 
 * Provides the primary interface for managing user sessions, messages,
 * tasks, approvals, and preferences. Acts as facade over SessionStore.
 * 
 * @module session/manager
 * @see {@link SessionManager} - Main manager class
 * @see {@link SessionStore} - Underlying persistence
 * 
 * ## Responsibilities
 * 
 * - Session lifecycle (create, get, update)
 * - Message management (add, truncate, get recent)
 * - Task lifecycle (start, pause, resume, complete, abort)
 * - Approval workflow (set pending, clear)
 * - Project management (set current, refresh)
 * - Preferences management (set autonomy, toggle options)
 * 
 * ## Usage Pattern
 * 
 * ```typescript
 * const manager = new SessionManager();
 * await manager.init();
 * 
 * const session = await manager.getSession('user123');
 * await manager.addUserMessage(session, 'Hello!');
 * await manager.startTask(session, 'Build login form');
 * ```
 * 
 * ## Message Flow
 * 
 * ```
 * User Input → addUserMessage()
 *      ↓
 * Agent Processing
 *      ↓
 * addAssistantMessage() or addToolMessage()
 * ```
 */

import { 
  Session, 
  Message, 
  UserPreferences,
  AutonomyLevel,
  createMessage,
  ToolCall
} from './types.js';
import { SessionStore, getSessionStore } from './store.js';
import { ThreadManager, Thread } from './thread-manager.js';
import { summarizer } from '../conversation/summarizer.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// SESSION MANAGER CLASS
// =============================================================================

/**
 * High-level manager for user sessions and conversation state.
 * 
 * Provides methods for all session operations including messages,
 * tasks, approvals, projects, and preferences.
 * 
 * @class
 * @example
 * ```typescript
 * const manager = new SessionManager();
 * await manager.init();
 * 
 * const session = await manager.getSession('user123');
 * await manager.addUserMessage(session, 'Fix the bug');
 * await manager.startTask(session, 'Fix the bug in login.ts');
 * ```
 */
export class SessionManager {
  private store: SessionStore;
  private threadManager: ThreadManager;

  constructor(store?: SessionStore) {
    this.store = store || getSessionStore();
    this.threadManager = ThreadManager.getInstance();
  }

  /**
   * Initialize the session manager
   */
  async init(): Promise<void> {
    await this.store.init();
  }

  // ============================================================================
  // Thread Management (V3.1)
  // ============================================================================

  public listThreads(session: Session): Thread[] {
      return this.threadManager.listThreads(session.id);
  }

  public async createThread(session: Session, title?: string): Promise<Thread> {
      return this.threadManager.createThread(session.id, title);
  }

  public async switchThread(session: Session, threadId: string): Promise<boolean> {
      const targetThread = this.threadManager.getThread(threadId);
      if (!targetThread) return false;

      // 1. Save current state to current thread (if exists)
      if (session.currentThreadId) {
          const currentThread = this.threadManager.getThread(session.currentThreadId);
          if (currentThread) {
              currentThread.contextSnapshot = {
                  messages: session.messages,
                  activeFiles: session.activeFiles
              };
              await this.threadManager.updateThreadStore(currentThread);
          }
      }

      // 2. Load target state
      session.currentThreadId = threadId;
      if (targetThread.contextSnapshot) {
          session.messages = targetThread.contextSnapshot.messages || [];
          if (targetThread.contextSnapshot.activeFiles) {
              session.activeFiles = targetThread.contextSnapshot.activeFiles;
          }
      } else {
          session.messages = [];
          session.activeFiles = [];
      }

      await this.store.update(session);
      return true;
  }

  /**
   * Get or create a session for a user
   */
  async getSession(userId: string): Promise<Session> {
    return this.store.getOrCreate(userId);
  }

  /**
   * Alias for getSession (used by handler)
   */
  async getOrCreateSession(userId: string): Promise<Session> {
    return this.getSession(userId);
  }

  /**
   * Update a session
   */
  async updateSession(session: Session): Promise<void> {
    await this.store.update(session);
  }

  // ============================================================================
  // Thread Management (V3.1)
  // ============================================================================

  /**
   * Get the ID of the currently active thread
   */
  getActiveThreadId(session: Session): string | undefined {
    return session.metadata?.activeThreadId;
  }

  /**
   * Pause the currently active thread (saves state and clears session)
   */
  async pauseActiveThread(session: Session): Promise<void> {
    const threadId = this.getActiveThreadId(session);
    if (!threadId) return;

    // Snapshot current state
    const snapshot = {
      messages: session.messages,
      activeTaskId: session.activeTaskId,
      activeFiles: session.activeFiles,
      repoMap: session.repoMap,
      project: session.currentProject
    };

    // Update thread in DB
    const thread = this.threadManager.getThread(threadId);
    if (thread) {
        thread.contextSnapshot = snapshot;
        thread.status = 'paused';
        await this.threadManager.updateThreadStore(thread);
    }
    
    // Clear session state (except persistent preferences)
    session.metadata.activeThreadId = undefined;
    session.messages = [];
    session.activeTaskId = null;
    session.activeFiles = [];
    // We keep repoMap/Project as they might be relevant to the next thread 
    // or just general workspace state, but for "clean slate" thread switching,
    // maybe we should clear them? 
    // Let's clear them to ensure threads are isolated contexts.
    session.repoMap = null;
    session.currentProject = null;

    await this.updateSession(session);
  }

  /**
   * Resume a specific thread
   */
  async resumeThread(session: Session, threadId: string): Promise<boolean> {
      const thread = this.threadManager.getThread(threadId);
      if (!thread) return false;

      // Pause current if active
      await this.pauseActiveThread(session);

      // Restore state
      const snapshot = thread.contextSnapshot || {};
      session.messages = snapshot.messages || [];
      session.activeTaskId = snapshot.activeTaskId || null;
      session.activeFiles = snapshot.activeFiles || [];
      session.repoMap = snapshot.repoMap || null;
      session.currentProject = snapshot.project || null;
      
      // Update metadata
      // if (!session.metadata) session.metadata = {};
      session.metadata.activeThreadId = thread.id;

      // Mark thread active
      thread.status = 'active';
      await this.threadManager.updateThreadStore(thread);

      await this.updateSession(session);
      return true;
  }

  /**
   * Create and switch to a new thread
   */
  async startNewThread(session: Session, title?: string): Promise<string> {
      await this.pauseActiveThread(session);

      const thread = await this.threadManager.createThread(session.id, title);
      
      // if (!session.metadata) session.metadata = {};
      session.metadata.activeThreadId = thread.id;
      
      await this.updateSession(session);
      return thread.id;
  }

  public getThreadManager(): ThreadManager {
    return this.threadManager;
  }

  // ============================================================================
  // Message Management
  // ============================================================================

  /**
   * Add a user message to the session
   */
  async addUserMessage(session: Session, content: string): Promise<Message> {
    const message = createMessage('user', content);
    session.messages.push(message);
    await this.store.update(session);
    
    // Check for summarization (V3.1)
    summarizer.checkAndSummarize(session).catch(err => {
        logger.warn('Background summarization failed', err);
    });

    return message;
  }

  /**
   * Add an assistant message to the session
   */
  async addAssistantMessage(session: Session, content: string): Promise<Message> {
    const message = createMessage('assistant', content);
    session.messages.push(message);
    await this.store.update(session);
    return message;
  }

  /**
   * Add an assistant message with tool calls (when LLM requests tools)
   */
  async addAssistantToolCallMessage(
    session: Session,
    content: string | null,
    toolCalls: Array<{ id: string; name: string; arguments: string }>
  ): Promise<Message> {
    const message = createMessage(
      'assistant',
      content || '',
      undefined,
      toolCalls.map(tc => ({ id: tc.id, name: tc.name, arguments: tc.arguments }))
    );
    session.messages.push(message);
    await this.store.update(session);
    return message;
  }

  /**
   * Add a tool call message to the session
   */
  async addToolMessage(
    session: Session, 
    toolCall: ToolCall,
    content?: string,
    toolCallId?: string
  ): Promise<Message> {
    const message = createMessage(
      'tool', 
      content || `Tool: ${toolCall.name}`,
      toolCall
    );
    // Override the auto-generated ID with the tool_call_id for proper pairing
    if (toolCallId) {
      message.id = toolCallId;
    }
    session.messages.push(message);
    await this.store.update(session);
    return message;
  }

  /**
   * Get recent messages (for context window)
   */
  getRecentMessages(session: Session, limit: number = 50): Message[] {
    return session.messages.slice(-limit);
  }

  /**
   * Truncate message history to save memory
   */
  async truncateMessages(session: Session, keepLast: number = 100): Promise<void> {
    if (session.messages.length > keepLast) {
      session.messages = session.messages.slice(-keepLast);
      await this.store.update(session);
      logger.debug('Truncated message history', { 
        sessionId: session.id, 
        remaining: session.messages.length 
      });
    }
  }

  // ============================================================================
  // Active Files Management
  // ============================================================================

  /**
   * Add a file to active context
   */
  async addActiveFile(session: Session, filePath: string): Promise<void> {
    if (!session.activeFiles.includes(filePath)) {
      session.activeFiles.push(filePath);
      await this.store.update(session);
      logger.debug('Added active file', { sessionId: session.id, filePath });
    }
  }

  /**
   * Remove a file from active context
   */
  async removeActiveFile(session: Session, filePath: string): Promise<void> {
    const index = session.activeFiles.indexOf(filePath);
    if (index !== -1) {
      session.activeFiles.splice(index, 1);
      await this.store.update(session);
      logger.debug('Removed active file', { sessionId: session.id, filePath });
    }
  }

  /**
   * Clear all active files
   */
  async clearActiveFiles(session: Session): Promise<void> {
    session.activeFiles = [];
    await this.store.update(session);
  }

  /**
   * Set active files (replace all)
   */
  async setActiveFiles(session: Session, files: string[]): Promise<void> {
    session.activeFiles = [...files];
    await this.store.update(session);
  }

  // ============================================================================
  // Repo Map Management
  // ============================================================================

  /**
   * Update the cached repo map
   */
  async updateRepoMap(session: Session, repoMap: string): Promise<void> {
    session.repoMap = repoMap;
    session.repoMapUpdatedAt = new Date().toISOString();
    await this.store.update(session);
    logger.debug('Updated repo map', { sessionId: session.id });
  }

  /**
   * Check if repo map needs refresh (older than 5 minutes)
   */
  isRepoMapStale(session: Session): boolean {
    if (!session.repoMapUpdatedAt) return true;
    
    const updatedAt = new Date(session.repoMapUpdatedAt).getTime();
    const fiveMinutes = 5 * 60 * 1000;
    return Date.now() - updatedAt > fiveMinutes;
  }

  /**
   * Clear the repo map (force refresh on next use)
   */
  async clearRepoMap(session: Session): Promise<void> {
    session.repoMap = null;
    session.repoMapUpdatedAt = null;
    await this.store.update(session);
  }

  // ============================================================================
  // Preferences Management
  // ============================================================================

  /**
   * Update user preferences
   */
  async updatePreferences(
    session: Session, 
    updates: Partial<UserPreferences>
  ): Promise<void> {
    session.preferences = { ...session.preferences, ...updates };
    await this.store.update(session);
    logger.info('Updated preferences', { 
      sessionId: session.id, 
      preferences: session.preferences 
    });
  }

  /**
   * Set autonomy level
   */
  async setAutonomyLevel(session: Session, level: AutonomyLevel): Promise<void> {
    await this.updatePreferences(session, { autonomyLevel: level });
  }

  /**
   * Toggle auto-commit
   */
  async toggleAutoCommit(session: Session): Promise<boolean> {
    const newValue = !session.preferences.autoCommit;
    await this.updatePreferences(session, { autoCommit: newValue });
    return newValue;
  }

  /**
   * Toggle verbose mode
   */
  async toggleVerboseMode(session: Session): Promise<boolean> {
    const newValue = !session.preferences.verboseMode;
    await this.updatePreferences(session, { verboseMode: newValue });
    return newValue;
  }

  // ============================================================================
  // Git Tracking
  // ============================================================================

  /**
   * Record the starting git commit for undo-all
   */
  async setGitStartCommit(session: Session, commitHash: string): Promise<void> {
    session.gitStartCommit = commitHash;
    await this.store.update(session);
  }

  // ============================================================================
  // Session Lifecycle
  // ============================================================================

  /**
   * Clear session (reset conversation but keep preferences)
   */
  async clearSession(session: Session): Promise<Session> {
    const cleared = await this.store.clear(session.id);
    if (!cleared) {
      throw new Error('Failed to clear session');
    }
    return cleared;
  }

  /**
   * Delete session entirely
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.store.delete(sessionId);
  }

  /**
   * Run cleanup of expired sessions
   */
  async cleanup(): Promise<number> {
    return this.store.cleanup();
  }
}

// Singleton instance
let managerInstance: SessionManager | null = null;

/**
 * Get the singleton session manager instance
 */
export async function getSessionManager(): Promise<SessionManager> {
  if (!managerInstance) {
    managerInstance = new SessionManager();
    await managerInstance.init();
  }
  return managerInstance;
}
