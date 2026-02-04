/**
 * @fileoverview Session Store - SQLite Persistent Storage
 * 
 * Provides persistent storage for sessions using better-sqlite3.
 * Handles session creation, retrieval, updates, and cleanup.
 * 
 * @module session/store
 * @see {@link SessionStore} - Main store class
 * @see {@link getSessionStore} - Get singleton instance
 * 
 * ## Storage
 * 
 * - File: `/app/data/sessions.db`
 * - Format: SQLite database
 * - Expiry: Sessions expire after 7 days of inactivity
 * 
 * ## Database Schema
 * 
 * ```sql
 * CREATE TABLE sessions (
 *   id TEXT PRIMARY KEY,
 *   user_id TEXT UNIQUE NOT NULL,
 *   data TEXT NOT NULL,  -- JSON blob
 *   created_at TEXT NOT NULL,
 *   last_activity_at TEXT NOT NULL
 * );
 * CREATE INDEX idx_sessions_user_id ON sessions(user_id);
 * CREATE INDEX idx_sessions_last_activity ON sessions(last_activity_at);
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

import Database from 'better-sqlite3';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import { 
  Session, 
  createSession 
} from './types.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Default database file path */
const DEFAULT_DB_PATH = '/app/data/sessions.db';

/** Session expiry time (7 days in milliseconds) */
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// =============================================================================
// DATABASE ROW TYPE
// =============================================================================

interface SessionRow {
  id: string;
  user_id: string;
  data: string;
  created_at: string;
  last_activity_at: string;
}

// =============================================================================
// SESSION STORE CLASS
// =============================================================================

/**
 * Persistent session storage using SQLite.
 * 
 * Provides CRUD operations for sessions with automatic initialization,
 * activity tracking, and expiry cleanup.
 * 
 * @class
 * @example
 * ```typescript
 * const store = new SessionStore('/path/to/sessions.db');
 * await store.init();
 * 
 * const session = await store.getOrCreate('user@phone');
 * ```
 */
export class SessionStore {
  private db: Database.Database | null = null;
  private dbPath: string;
  private initialized: boolean = false;

  // Prepared statements for performance
  private stmtGetById: Database.Statement | null = null;
  private stmtGetByUserId: Database.Statement | null = null;
  private stmtInsert: Database.Statement | null = null;
  private stmtUpdate: Database.Statement | null = null;
  private stmtDelete: Database.Statement | null = null;
  private stmtGetAll: Database.Statement | null = null;
  private stmtCount: Database.Statement | null = null;
  private stmtCleanup: Database.Statement | null = null;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
  }

  /**
   * Initialize the database
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure data directory exists
      await mkdir(dirname(this.dbPath), { recursive: true });

      // Open database
      this.db = new Database(this.dbPath);
      
      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');
      
      // Create tables if they don't exist
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT UNIQUE NOT NULL,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_activity_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity_at);
      `);

      // Prepare statements
      this.stmtGetById = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
      this.stmtGetByUserId = this.db.prepare('SELECT * FROM sessions WHERE user_id = ?');
      this.stmtInsert = this.db.prepare(`
        INSERT INTO sessions (id, user_id, data, created_at, last_activity_at)
        VALUES (@id, @user_id, @data, @created_at, @last_activity_at)
      `);
      this.stmtUpdate = this.db.prepare(`
        UPDATE sessions SET data = @data, last_activity_at = @last_activity_at WHERE id = @id
      `);
      this.stmtDelete = this.db.prepare('DELETE FROM sessions WHERE id = ?');
      this.stmtGetAll = this.db.prepare('SELECT * FROM sessions ORDER BY last_activity_at DESC');
      this.stmtCount = this.db.prepare('SELECT COUNT(*) as count FROM sessions');
      this.stmtCleanup = this.db.prepare('DELETE FROM sessions WHERE last_activity_at < ?');

      this.initialized = true;
      
      const count = (this.stmtCount.get() as { count: number }).count;
      logger.info('Session store initialized', { sessionCount: count });
    } catch (error) {
      logger.error('Failed to initialize session store', { error });
      throw error;
    }
  }

  /**
   * Ensure store is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('Session store not initialized. Call init() first.');
    }
  }

  /**
   * Convert database row to Session object
   */
  private rowToSession(row: SessionRow): Session {
    const session = JSON.parse(row.data) as Session;
    // Ensure timestamps are synced
    session.lastActivityAt = row.last_activity_at;
    return session;
  }

  /**
   * Get session by user ID, creating if needed
   */
  async getOrCreate(userId: string): Promise<Session> {
    this.ensureInitialized();

    // Try to find existing session
    const row = this.stmtGetByUserId!.get(userId) as SessionRow | undefined;

    if (!row) {
      // Create new session
      const session = createSession(userId);
      
      this.stmtInsert!.run({
        id: session.id,
        user_id: session.userId,
        data: JSON.stringify(session),
        created_at: session.createdAt,
        last_activity_at: session.lastActivityAt,
      });
      
      logger.info('Created new session', { sessionId: session.id, userId });
      return session;
    }

    // Parse existing session
    const session = this.rowToSession(row);
    let needsUpdate = false;
    
    // Migrate old sessions to have new fields
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
    
    // Update last activity
    session.lastActivityAt = new Date().toISOString();
    
    if (needsUpdate) {
      logger.info('Migrated session to new schema', { sessionId: session.id });
    }
    
    // Always update activity timestamp
    this.stmtUpdate!.run({
      id: session.id,
      data: JSON.stringify(session),
      last_activity_at: session.lastActivityAt,
    });

    return session;
  }

  /**
   * Get session by ID
   */
  async getById(sessionId: string): Promise<Session | undefined> {
    this.ensureInitialized();
    const row = this.stmtGetById!.get(sessionId) as SessionRow | undefined;
    return row ? this.rowToSession(row) : undefined;
  }

  /**
   * Get session by user ID
   */
  async getByUserId(userId: string): Promise<Session | undefined> {
    this.ensureInitialized();
    const row = this.stmtGetByUserId!.get(userId) as SessionRow | undefined;
    return row ? this.rowToSession(row) : undefined;
  }

  /**
   * Update session
   */
  async update(session: Session): Promise<void> {
    this.ensureInitialized();

    session.lastActivityAt = new Date().toISOString();
    
    const result = this.stmtUpdate!.run({
      id: session.id,
      data: JSON.stringify(session),
      last_activity_at: session.lastActivityAt,
    });
    
    if (result.changes === 0) {
      throw new Error(`Session not found: ${session.id}`);
    }
  }

  /**
   * Delete session
   */
  async delete(sessionId: string): Promise<boolean> {
    this.ensureInitialized();

    const result = this.stmtDelete!.run(sessionId);
    
    if (result.changes > 0) {
      logger.info('Deleted session', { sessionId });
      return true;
    }
    return false;
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

    const expiryDate = new Date(Date.now() - SESSION_EXPIRY_MS).toISOString();
    const result = this.stmtCleanup!.run(expiryDate);
    
    if (result.changes > 0) {
      logger.info('Cleaned up expired sessions', { count: result.changes });
    }

    return result.changes;
  }

  /**
   * Get all sessions (for debugging)
   */
  async getAll(): Promise<Session[]> {
    this.ensureInitialized();
    const rows = this.stmtGetAll!.all() as SessionRow[];
    return rows.map(row => this.rowToSession(row));
  }

  /**
   * Get session count
   */
  async count(): Promise<number> {
    this.ensureInitialized();
    const result = this.stmtCount!.get() as { count: number };
    return result.count;
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
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
