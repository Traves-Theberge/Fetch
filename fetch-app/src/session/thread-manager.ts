/**
 * @fileoverview Thread Manager
 * 
 * Manages conversation threads allowing the user to switch contexts.
 * 
 * - Threads are stored in `conversation_threads` table.
 * - Active thread context is swapped in/out of the Session object.
 */

import { nanoid } from 'nanoid';
import { getSessionStore, ThreadRow } from '../session/store.js';

export interface Thread {
    id: string;
    sessionId: string;
    title: string;
    status: 'active' | 'archived' | 'paused';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contextSnapshot: any; // Serialized context
    createdAt: string;
    updatedAt: string;
}

export class ThreadManager {
    private static instance: ThreadManager | undefined;
    private db = getSessionStore();

    private constructor() {}

    public static getInstance(): ThreadManager {
        if (!ThreadManager.instance) {
            ThreadManager.instance = new ThreadManager();
        }
        return ThreadManager.instance as ThreadManager;
    }

    /**
     * List threads for a session
     */
    public listThreads(sessionId: string): Thread[] {
        const rows = this.db.getThreads(sessionId);
        return rows.map(this.mapRowToThread);
    }

    public getThread(id: string): Thread | undefined {
        const row = this.db.getThread(id);
        return row ? this.mapRowToThread(row) : undefined;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async createThread(sessionId: string, title?: string, context?: any): Promise<Thread> {
        const id = nanoid();
        const now = new Date().toISOString();
        const thread: Thread = {
            id,
            sessionId,
            title: title || `Thread ${id.substring(0, 4)}`,
            status: 'active',
            contextSnapshot: context || {},
            createdAt: now,
            updatedAt: now
        };
        
        this.db.createThread(this.mapThreadToRow(thread));
        return thread;
    }

    public async updateThreadStore(thread: Thread) {
        thread.updatedAt = new Date().toISOString();
        this.db.updateThread(this.mapThreadToRow(thread));
    }

    private mapRowToThread(row: ThreadRow): Thread {
        return {
            id: row.id, 
            sessionId: row.session_id,
            title: row.title,
            status: row.status as 'active' | 'archived' | 'paused',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            contextSnapshot: JSON.parse(row.context_snapshot || '{}') as any,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    private mapThreadToRow(thread: Thread): ThreadRow {
        return {
            id: thread.id,
            session_id: thread.sessionId,
            title: thread.title,
            status: thread.status,
            context_snapshot: JSON.stringify(thread.contextSnapshot),
            created_at: thread.createdAt,
            updated_at: thread.updatedAt
        };
    }
}
