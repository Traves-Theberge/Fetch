/**
 * @fileoverview Session Store - Persistent Storage
 * 
 * Provides persistent storage for sessions using lowdb (JSON file database).
 * Handles session creation, retrieval, updates, and cleanup.
 * 
 * @module session/store
 * @see {@link SessionStore} - Main store class
 * @see {@link getSessionStore} - Get singleton instance
 * 
 * ## Storage
 * 
 * - File: `/app/data/sessions.json`
 * - Format: JSON with array of Session objects
 * - Expiry: Sessions expire after 7 days of inactivity
 * 
 * ## Database Schema
 * 
 * ```json
 * {
 *   "sessions": [
 *     {
 *       "id": "uuid",
 *       "userId": "phone_number",
 *       "createdAt": "ISO date",
 *       "lastActivityAt": "ISO date",
 *       "messages": [...],
 *       "preferences": {...},
 *       ...
 *     }
 *   ]
 * }
 * ```
 * 
 * @example
 * ```typescript
 * import { SessionStore, getSessionStore } from './store.js';
 * 
 * const store = getSessionStore();
 * await store.init();
 * 
 * const session = await store.getOrCreate('user123');
 * session.messages.push(newMessage);
 * await store.update(session);
 * ```
 */

import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import { 
  Database, 
  Session, 
  createSession 
} from './types.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Default database file path */
const DEFAULT_DB_PATH = '/app/data/sessions.json';

/** Session expiry time (7 days in milliseconds) */
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// =============================================================================
// SESSION STORE CLASS
// =============================================================================

/**
 * Persistent session storage using lowdb.
 * 
 * Provides CRUD operations for sessions with automatic initialization,
 * activity tracking, and expiry cleanup.
 * 
 * @class
 * @example
 * ```typescript
 * const store = new SessionStore('/path/to/sessions.json');
 * await store.init();
 * 
 * const session = await store.getOrCreate('user@phone');
 * ```
 */
export class SessionStore {
  private db: Low<Database>;
  private dbPath: string;
  private initialized: boolean = false;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    const adapter = new JSONFile<Database>(dbPath);
    this.db = new Low(adapter, { sessions: [] });
  }

  /**
   * Initialize the database
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure data directory exists
      await mkdir(dirname(this.dbPath), { recursive: true });

      // Read existing data or create empty database
      await this.db.read();
      
      if (!this.db.data) {
        this.db.data = { sessions: [] };
        await this.db.write();
      }

      this.initialized = true;
      logger.info('Session store initialized', { 
        sessionCount: this.db.data.sessions.length 
      });
    } catch (error) {
      logger.error('Failed to initialize session store', { error });
      throw error;
    }
  }

  /**
   * Ensure store is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Session store not initialized. Call init() first.');
    }
  }

  /**
   * Get session by user ID, creating if needed
   */
  async getOrCreate(userId: string): Promise<Session> {
    this.ensureInitialized();

    // Try to find existing session
    let session = this.db.data!.sessions.find(s => s.userId === userId);

    if (!session) {
      // Create new session
      session = createSession(userId);
      this.db.data!.sessions.push(session);
      await this.db.write();
      logger.info('Created new session', { sessionId: session.id, userId });
    } else {
      // Migrate old sessions to have new fields
      let needsUpdate = false;
      
      if (session.availableProjects === undefined) {
        session.availableProjects = [];
        needsUpdate = true;
      }
      if (session.currentProject === undefined) {
        session.currentProject = null;
        needsUpdate = true;
      }
      if (session.activeFiles === undefined) {
        session.activeFiles = [];
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await this.db.write();
        logger.info('Migrated session to new schema', { sessionId: session.id });
      }
      
      // Update last activity
      session.lastActivityAt = new Date().toISOString();
      await this.db.write();
    }

    return session;
  }

  /**
   * Get session by ID
   */
  async getById(sessionId: string): Promise<Session | undefined> {
    this.ensureInitialized();
    return this.db.data!.sessions.find(s => s.id === sessionId);
  }

  /**
   * Get session by user ID
   */
  async getByUserId(userId: string): Promise<Session | undefined> {
    this.ensureInitialized();
    return this.db.data!.sessions.find(s => s.userId === userId);
  }

  /**
   * Update session
   */
  async update(session: Session): Promise<void> {
    this.ensureInitialized();

    const index = this.db.data!.sessions.findIndex(s => s.id === session.id);
    
    if (index === -1) {
      throw new Error(`Session not found: ${session.id}`);
    }

    session.lastActivityAt = new Date().toISOString();
    this.db.data!.sessions[index] = session;
    await this.db.write();
  }

  /**
   * Delete session
   */
  async delete(sessionId: string): Promise<boolean> {
    this.ensureInitialized();

    const index = this.db.data!.sessions.findIndex(s => s.id === sessionId);
    
    if (index === -1) {
      return false;
    }

    this.db.data!.sessions.splice(index, 1);
    await this.db.write();
    logger.info('Deleted session', { sessionId });
    return true;
  }

  /**
   * Clear session (reset to fresh state but keep preferences)
   */
  async clear(sessionId: string): Promise<Session | undefined> {
    this.ensureInitialized();

    const session = await this.getById(sessionId);
    if (!session) return undefined;

    // Keep user ID and preferences, reset everything else
    const clearedSession = createSession(session.userId);
    clearedSession.id = session.id;
    clearedSession.preferences = session.preferences;
    clearedSession.createdAt = session.createdAt;

    await this.update(clearedSession);
    logger.info('Cleared session', { sessionId });
    return clearedSession;
  }

  /**
   * Clean up expired sessions
   */
  async cleanup(): Promise<number> {
    this.ensureInitialized();

    const now = Date.now();
    const expiredSessions = this.db.data!.sessions.filter(s => {
      const lastActivity = new Date(s.lastActivityAt).getTime();
      return now - lastActivity > SESSION_EXPIRY_MS;
    });

    if (expiredSessions.length > 0) {
      this.db.data!.sessions = this.db.data!.sessions.filter(s => {
        const lastActivity = new Date(s.lastActivityAt).getTime();
        return now - lastActivity <= SESSION_EXPIRY_MS;
      });
      await this.db.write();
      logger.info('Cleaned up expired sessions', { count: expiredSessions.length });
    }

    return expiredSessions.length;
  }

  /**
   * Get all sessions (for debugging)
   */
  async getAll(): Promise<Session[]> {
    this.ensureInitialized();
    return [...this.db.data!.sessions];
  }

  /**
   * Get session count
   */
  async count(): Promise<number> {
    this.ensureInitialized();
    return this.db.data!.sessions.length;
  }
}

// Singleton instance
let storeInstance: SessionStore | null = null;

/**
 * Get the singleton session store instance
 */
export function getSessionStore(dbPath?: string): SessionStore {
  if (!storeInstance) {
    storeInstance = new SessionStore(dbPath);
  }
  return storeInstance;
}
