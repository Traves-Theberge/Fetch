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
  AgentTask,
  UserPreferences,
  AutonomyLevel,
  createMessage,
  createTask,
  ToolCall
} from './types.js';
import { SessionStore, getSessionStore } from './store.js';
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

  constructor(store?: SessionStore) {
    this.store = store || getSessionStore();
  }

  /**
   * Initialize the session manager
   */
  async init(): Promise<void> {
    await this.store.init();
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
  // Message Management
  // ============================================================================

  /**
   * Add a user message to the session
   */
  async addUserMessage(session: Session, content: string): Promise<Message> {
    const message = createMessage('user', content);
    session.messages.push(message);
    await this.store.update(session);
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
   * Add a tool call message to the session
   */
  async addToolMessage(
    session: Session, 
    toolCall: ToolCall,
    content?: string
  ): Promise<Message> {
    const message = createMessage(
      'tool', 
      content || `Tool: ${toolCall.name}`,
      toolCall
    );
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
  // Task Management
  // ============================================================================

  /**
   * Start a new agent task
   */
  async startTask(session: Session, goal: string): Promise<AgentTask> {
    if (session.currentTask && 
        !['completed', 'failed', 'aborted'].includes(session.currentTask.status)) {
      throw new Error('A task is already in progress. Use /stop to cancel it first.');
    }

    const task = createTask(goal, session.preferences.maxIterations);
    session.currentTask = task;
    await this.store.update(session);
    
    logger.info('Started new task', { 
      sessionId: session.id, 
      taskId: task.id, 
      goal 
    });
    
    return task;
  }

  /**
   * Update the current task
   */
  async updateTask(session: Session, updates: Partial<AgentTask>): Promise<void> {
    if (!session.currentTask) {
      throw new Error('No active task');
    }

    session.currentTask = { ...session.currentTask, ...updates };
    await this.store.update(session);
  }

  /**
   * Complete the current task
   */
  async completeTask(session: Session, output: string): Promise<AgentTask> {
    if (!session.currentTask) {
      throw new Error('No active task');
    }

    session.currentTask.status = 'completed';
    session.currentTask.output = output;
    session.currentTask.completedAt = new Date().toISOString();
    
    await this.store.update(session);
    
    logger.info('Task completed', { 
      sessionId: session.id, 
      taskId: session.currentTask.id 
    });

    const completedTask = session.currentTask;
    session.currentTask = null;
    await this.store.update(session);
    
    return completedTask;
  }

  /**
   * Fail the current task
   */
  async failTask(session: Session, error: string): Promise<AgentTask> {
    if (!session.currentTask) {
      throw new Error('No active task');
    }

    session.currentTask.status = 'failed';
    session.currentTask.error = error;
    session.currentTask.completedAt = new Date().toISOString();
    
    await this.store.update(session);
    
    logger.error('Task failed', { 
      sessionId: session.id, 
      taskId: session.currentTask.id,
      error 
    });

    const failedTask = session.currentTask;
    session.currentTask = null;
    await this.store.update(session);
    
    return failedTask;
  }

  /**
   * Abort the current task (user requested)
   */
  async abortTask(session: Session): Promise<AgentTask | null> {
    if (!session.currentTask) {
      return null;
    }

    session.currentTask.status = 'aborted';
    session.currentTask.completedAt = new Date().toISOString();
    
    await this.store.update(session);
    
    logger.info('Task aborted', { 
      sessionId: session.id, 
      taskId: session.currentTask.id 
    });

    const abortedTask = session.currentTask;
    session.currentTask = null;
    await this.store.update(session);
    
    return abortedTask;
  }

  /**
   * Pause the current task
   */
  async pauseTask(session: Session): Promise<void> {
    if (!session.currentTask) {
      throw new Error('No active task');
    }

    session.currentTask.status = 'paused';
    await this.store.update(session);
    
    logger.info('Task paused', { 
      sessionId: session.id, 
      taskId: session.currentTask.id 
    });
  }

  /**
   * Resume a paused task
   */
  async resumeTask(session: Session): Promise<void> {
    if (!session.currentTask) {
      throw new Error('No active task');
    }

    if (session.currentTask.status !== 'paused') {
      throw new Error('Task is not paused');
    }

    session.currentTask.status = 'executing';
    await this.store.update(session);
    
    logger.info('Task resumed', { 
      sessionId: session.id, 
      taskId: session.currentTask.id 
    });
  }

  /**
   * Set pending approval on task
   */
  async setPendingApproval(
    session: Session,
    tool: string,
    args: Record<string, unknown>,
    description: string,
    diff?: string
  ): Promise<void> {
    if (!session.currentTask) {
      throw new Error('No active task');
    }

    session.currentTask.status = 'awaiting_approval';
    session.currentTask.pendingApproval = {
      tool,
      args,
      description,
      diff,
      createdAt: new Date().toISOString()
    };
    
    await this.store.update(session);
  }

  /**
   * Clear pending approval
   */
  async clearPendingApproval(session: Session, approved: boolean): Promise<void> {
    if (!session.currentTask?.pendingApproval) {
      return;
    }

    const approval = session.currentTask.pendingApproval;
    session.currentTask.pendingApproval = null;
    session.currentTask.status = 'executing';
    
    // Record the approval decision in messages
    await this.addToolMessage(session, {
      name: approval.tool,
      args: approval.args,
      approved
    }, approved ? 'Approved' : 'Rejected');
    
    await this.store.update(session);
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
