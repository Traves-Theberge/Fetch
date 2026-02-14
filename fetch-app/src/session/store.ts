/**
 * @fileoverview SQLite-backed storage for session and memory records.
 *
 * Responsibilities:
 * - initialize schema and prepared statements
 * - CRUD operations for sessions
 * - expiry cleanup and pagination
 * - memory insert/recall operations
 *
 * @module session/store
 */

import Database from 'better-sqlite3';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import {
  Session,
  createSession,
  type MemoryEntry,
  type MemoryCategory,
  generateId,
} from './types.js';
import { logger } from '../utils/logger.js';
import { SESSIONS_DB } from '../config/paths.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Default SQLite file path. */
const DEFAULT_DB_PATH = SESSIONS_DB;

/** Session expiry cutoff window (7 days). */
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
 * Storage adapter over `better-sqlite3` for session persistence.
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
  private stmtCount: Database.Statement | null = null;
  private stmtList: Database.Statement | null = null;
  private stmtCleanup: Database.Statement | null = null;
  private stmtMemoryInsert: Database.Statement | null = null;
  private stmtMemorySearch: Database.Statement | null = null;
  private stmtMemoryUpdateRecall: Database.Statement | null = null;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
  }

  /**
   * Returns configured SQLite path for this store instance.
   */
  getPath(): string {
    return this.dbPath;
  }

  /**
   * Initializes database connection, schema, and prepared statements.
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
        
        -- Metadata key-value store
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        -- Migration: drop legacy tables no longer used
        DROP TABLE IF EXISTS conversation_summaries;
        DROP TABLE IF EXISTS conversation_threads;

        -- Structured memory for cross-session recall
        CREATE TABLE IF NOT EXISTS memory (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          category TEXT NOT NULL,
          content TEXT NOT NULL,
          keywords TEXT NOT NULL,
          importance INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          last_recalled_at TEXT,
          recall_count INTEGER DEFAULT 0,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_memory_session ON memory(session_id);
        CREATE INDEX IF NOT EXISTS idx_memory_category ON memory(category);
        CREATE INDEX IF NOT EXISTS idx_memory_keywords ON memory(keywords);
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
      this.stmtCount = this.db.prepare('SELECT COUNT(*) as count FROM sessions');
      this.stmtList = this.db.prepare('SELECT * FROM sessions ORDER BY last_activity_at DESC LIMIT ? OFFSET ?');
      this.stmtCleanup = this.db.prepare('DELETE FROM sessions WHERE last_activity_at < ?');

      // Memory statements
      this.stmtMemoryInsert = this.db.prepare(`
        INSERT INTO memory (id, session_id, category, content, keywords, importance, created_at)
        VALUES (@id, @session_id, @category, @content, @keywords, @importance, @created_at)
      `);
      this.stmtMemorySearch = this.db.prepare(`
        SELECT * FROM memory WHERE session_id = ? ORDER BY importance DESC, created_at DESC LIMIT ?
      `);
      this.stmtMemoryUpdateRecall = this.db.prepare(`
        UPDATE memory SET last_recalled_at = @last_recalled_at, recall_count = recall_count + 1 WHERE id = @id
      `);

      this.initialized = true;

      const count = (this.stmtCount.get() as { count: number }).count;
      logger.info('Session store initialized', { sessionCount: count });

      // Auto-cleanup expired sessions on startup
      const cleaned = await this.cleanup();
      if (cleaned > 0) {
        logger.info('Startup cleanup removed expired sessions', { count: cleaned });
      }
    } catch (error) {
      logger.error('Failed to initialize session store', { error });
      throw error;
    }
  }

  /**
   * Throws when store is not initialized.
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('Session store not initialized. Call init() first.');
    }
  }

  /**
   * Converts session row payload into in-memory session object.
   */
  private rowToSession(row: SessionRow): Session {
    try {
      const session = JSON.parse(row.data) as Session;
      // Ensure timestamps are synced
      session.lastActivityAt = row.last_activity_at;
      return session;
    } catch (error) {
      logger.error('Failed to parse session row JSON; rebuilding safe fallback session', {
        sessionId: row.id,
        userId: row.user_id,
        error,
      });

      const fallback = createSession(row.user_id);
      fallback.id = row.id;
      fallback.createdAt = row.created_at;
      fallback.lastActivityAt = row.last_activity_at;
      return fallback;
    }
  }

  /**
   * Returns session by user id, creating and persisting a new one when missing.
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
   * Returns session by session id.
   */
  async getById(sessionId: string): Promise<Session | undefined> {
    this.ensureInitialized();
    const row = this.stmtGetById!.get(sessionId) as SessionRow | undefined;
    return row ? this.rowToSession(row) : undefined;
  }

  /**
   * Returns session by user id.
   */
  async getByUserId(userId: string): Promise<Session | undefined> {
    this.ensureInitialized();
    const row = this.stmtGetByUserId!.get(userId) as SessionRow | undefined;
    return row ? this.rowToSession(row) : undefined;
  }

  /**
   * Persists updated session payload and bumps activity timestamp.
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
   * Deletes one session by id.
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
   * Resets session state while preserving identity and preferences.
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
   * Deletes expired sessions and returns removed count.
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
   * Returns total persisted session count.
   */
  async count(): Promise<number> {
    this.ensureInitialized();
    const result = this.stmtCount!.get() as { count: number };
    return result.count;
  }

  /**
   * Lists sessions ordered by recent activity.
   */
  async list(limit: number = 50, offset: number = 0): Promise<Session[]> {
    this.ensureInitialized();
    const rows = this.stmtList!.all(limit, offset) as SessionRow[];
    return rows.map(row => this.rowToSession(row));
  }

  // ===========================================================================
  // Memory CRUD
  // ===========================================================================

  /**
   * Inserts a memory entry for the given session.
   */
  addMemory(
    sessionId: string,
    category: MemoryCategory,
    content: string,
    keywords: string,
    importance: number = 1
  ): MemoryEntry {
    this.ensureInitialized();

    const entry: MemoryEntry = {
      id: `mem_${generateId(10)}`,
      sessionId,
      category,
      content,
      keywords,
      importance: Math.max(1, Math.min(5, importance)),
      createdAt: new Date().toISOString(),
      lastRecalledAt: null,
      recallCount: 0,
    };

    this.stmtMemoryInsert!.run({
      id: entry.id,
      session_id: entry.sessionId,
      category: entry.category,
      content: entry.content,
      keywords: entry.keywords,
      importance: entry.importance,
      created_at: entry.createdAt,
    });

    return entry;
  }

  /**
   * Recalls session memories using keyword-weighted scoring.
   */
  recallMemories(sessionId: string, query: string, limit: number = 5): MemoryEntry[] {
    this.ensureInitialized();

    // Fetch candidate memories for this session
    const rows = this.stmtMemorySearch!.all(sessionId, limit * 3) as Array<{
      id: string;
      session_id: string;
      category: string;
      content: string;
      keywords: string;
      importance: number;
      created_at: string;
      last_recalled_at: string | null;
      recall_count: number;
    }>;

    if (rows.length === 0) return [];

    // BM25-style keyword scoring
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (queryTerms.length === 0) {
      // No meaningful query terms - return top by importance
      return rows.slice(0, limit).map(r => this.rowToMemory(r));
    }

    const scored = rows.map(row => {
      const keywords = row.keywords.toLowerCase();
      const content = row.content.toLowerCase();
      let score = 0;

      for (const term of queryTerms) {
        if (keywords.includes(term)) score += 3;
        if (content.includes(term)) score += 1;
      }

      // Boost by importance
      score *= (1 + row.importance * 0.2);

      return { row, score };
    });

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    const results = scored
      .filter(s => s.score > 0)
      .slice(0, limit)
      .map(s => this.rowToMemory(s.row));

    // Update recall timestamps
    const now = new Date().toISOString();
    for (const entry of results) {
      this.stmtMemoryUpdateRecall!.run({ id: entry.id, last_recalled_at: now });
    }

    return results;
  }

  /** Converts a memory row into domain memory entity. */
  private rowToMemory(row: {
    id: string;
    session_id: string;
    category: string;
    content: string;
    keywords: string;
    importance: number;
    created_at: string;
    last_recalled_at: string | null;
    recall_count: number;
  }): MemoryEntry {
    return {
      id: row.id,
      sessionId: row.session_id,
      category: row.category as MemoryCategory,
      content: row.content,
      keywords: row.keywords,
      importance: row.importance,
      createdAt: row.created_at,
      lastRecalledAt: row.last_recalled_at,
      recallCount: row.recall_count,
    };
  }

  /**
   * Closes database connection and marks store uninitialized.
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
 * Returns process-wide session store singleton.
 */
export function getSessionStore(dbPath?: string): SessionStore {
  if (!storeInstance) {
    storeInstance = new SessionStore(dbPath);
    return storeInstance;
  }

  if (dbPath && dbPath !== storeInstance.getPath()) {
    throw new Error(
      `SessionStore singleton already initialized for ${storeInstance.getPath()}. ` +
      'Call resetSessionStoreForTests() before requesting a different dbPath.'
    );
  }

  return storeInstance;
}

/**
 * Resets the store singleton to support isolated tests.
 */
export function resetSessionStoreForTests(): void {
  if (storeInstance) {
    storeInstance.close();
  }
  storeInstance = null;
}
