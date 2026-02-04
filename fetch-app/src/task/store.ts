/**
 * @fileoverview Task Store - SQLite Persistent Storage
 * 
 * Provides persistent storage for tasks using better-sqlite3.
 * 
 * @module task/store
 */

import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { mkdir } from 'fs/promises';
import { Task, TaskId } from './types.js';
import { logger } from '../utils/logger.js';

/** Default database file path */
const DEFAULT_DB_PATH = process.env.DATABASE_PATH 
  ? join(dirname(process.env.DATABASE_PATH), 'tasks.db')
  : '/app/data/tasks.db';

export class TaskStore {
  private db: Database.Database | null = null;
  private dbPath: string;
  private initialized: boolean = false;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
  }

  /**
   * Initialize the store
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure directory exists
      await mkdir(dirname(this.dbPath), { recursive: true });

      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');

      // Create tables
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          data TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

        CREATE TABLE IF NOT EXISTS task_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      this.initialized = true;
      logger.info(`TaskStore initialized at ${this.dbPath}`);
    } catch (error) {
      logger.error('Failed to initialize TaskStore', { error, path: this.dbPath });
      throw error;
    }
  }

  /**
   * Save a task
   */
  async saveTask(task: Task): Promise<void> {
    await this.ensureInitialized();
    
    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO tasks (id, session_id, data, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.sessionId,
      JSON.stringify(task),
      task.status,
      task.createdAt,
      new Date().toISOString()
    );
  }

  /**
   * Load all tasks
   */
  async loadAllTasks(): Promise<Task[]> {
    await this.ensureInitialized();
    
    const rows = this.db!.prepare('SELECT data FROM tasks').all() as { data: string }[];
    return rows.map(row => JSON.parse(row.data) as Task);
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: TaskId): Promise<void> {
    await this.ensureInitialized();
    this.db!.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  }

  /**
   * Save current task ID
   */
  async saveCurrentTaskId(taskId: TaskId | null): Promise<void> {
    await this.ensureInitialized();
    
    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO task_metadata (key, value)
      VALUES (?, ?)
    `);

    stmt.run('currentTaskId', taskId || '');
  }

  /**
   * Load current task ID
   */
  async loadCurrentTaskId(): Promise<TaskId | null> {
    await this.ensureInitialized();
    
    const row = this.db!.prepare('SELECT value FROM task_metadata WHERE key = ?')
      .get('currentTaskId') as { value: string } | undefined;
    
    return (row?.value as TaskId) || null;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }
}

let storeInstance: TaskStore | null = null;

export function getTaskStore(): TaskStore {
  if (!storeInstance) {
    storeInstance = new TaskStore();
  }
  return storeInstance;
}
