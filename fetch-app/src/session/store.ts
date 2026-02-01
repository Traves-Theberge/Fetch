/**
 * Session Store
 * 
 * Persistent storage for sessions using lowdb.
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

// Default database path
const DEFAULT_DB_PATH = '/app/data/sessions.json';

// Session expiry (7 days)
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Session store using lowdb for persistence
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
