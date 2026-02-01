/**
 * Task Manager - Persistence Layer
 * 
 * Manages task state using lowdb for JSON file storage.
 * Ensures tasks survive reboots.
 */

import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
export type AgentType = 'claude' | 'gemini' | 'copilot';

export interface Task {
  id: string;
  status: TaskStatus;
  agent: AgentType;
  prompt: string;
  args: string[];
  output?: string;
  createdAt: string;
  updatedAt: string;
}

interface TaskCreateInput {
  agent: AgentType;
  prompt: string;
  args: string[];
}

interface Database {
  tasks: Task[];
}

export class TaskManager {
  private db: Low<Database>;
  private initialized: boolean = false;

  constructor() {
    const adapter = new JSONFile<Database>('/app/data/tasks.json');
    this.db = new Low<Database>(adapter, { tasks: [] });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.db.read();
      this.initialized = true;
    }
  }

  /**
   * Create a new task
   */
  async createTask(input: TaskCreateInput): Promise<Task> {
    await this.ensureInitialized();

    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID().slice(0, 8),
      status: 'PENDING',
      agent: input.agent,
      prompt: input.prompt,
      args: input.args,
      createdAt: now,
      updatedAt: now
    };

    this.db.data.tasks.push(task);
    await this.db.write();

    logger.info(`Task created: ${task.id}`);
    return task;
  }

  /**
   * Update task status
   */
  async updateStatus(taskId: string, status: TaskStatus, output?: string): Promise<void> {
    await this.ensureInitialized();

    const task = this.db.data.tasks.find(t => t.id === taskId);
    if (!task) {
      logger.warn(`Task not found: ${taskId}`);
      return;
    }

    task.status = status;
    task.updatedAt = new Date().toISOString();
    
    if (output !== undefined) {
      task.output = output;
    }

    await this.db.write();
    logger.info(`Task ${taskId} updated to ${status}`);
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId: string): Promise<Task | undefined> {
    await this.ensureInitialized();
    return this.db.data.tasks.find(t => t.id === taskId);
  }

  /**
   * Get recent tasks
   */
  getRecentTasks(limit: number = 10): Task[] {
    if (!this.initialized) {
      return [];
    }
    
    return this.db.data.tasks
      .slice(-limit)
      .reverse();
  }

  /**
   * Get tasks by status
   */
  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    await this.ensureInitialized();
    return this.db.data.tasks.filter(t => t.status === status);
  }
}
