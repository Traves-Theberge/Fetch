/**
 * @fileoverview Polling Service
 * 
 * Manages periodic tasks that need to run in the background.
 * Examples: Checking PR status, git pull, verifying server health.
 */

import { PollingTask } from './types.js';
import { logger } from '../utils/logger.js';

export class PollingService {
  private static instance: PollingService | undefined;
  private tasks: Map<string, PollingTask> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  public static getInstance(): PollingService {
    if (!PollingService.instance) {
      PollingService.instance = new PollingService();
    }
    return PollingService.instance as PollingService;
  }

  /**
   * Start the polling service
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Starting proactive polling service...');
    
    // Resume all enabled tasks
    for (const task of this.tasks.values()) {
      if (task.enabled) {
        this.scheduleTask(task);
      }
    }
  }

  /**
   * Stop the polling service
   */
  public stop(): void {
    this.isRunning = false;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    logger.info('Polling service stopped');
  }

  /**
   * Register a new task
   */
  public addTask(task: Omit<PollingTask, 'lastRun' | 'type'> & { type?: 'interval' }): void {
    const fullTask: PollingTask = {
      type: 'interval',
      lastRun: 0,
      ...task,
      enabled: task.enabled ?? true
    };
    
    this.tasks.set(fullTask.id, fullTask);
    logger.debug(`Registered polling task: ${fullTask.name} (${fullTask.intervalMs}ms)`);
    
    if (this.isRunning && fullTask.enabled) {
      this.scheduleTask(fullTask);
    }
  }

  /**
   * Manually poll (run) a specific task immediately
   */
  public async poll(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
        throw new Error(`Polling task not found: ${taskId}`);
    }
    
    logger.info(`Manually triggering polling task: ${task.name}`);
    try {
        await task.handler();
        task.lastRun = Date.now();
        // Reset timer if running to avoid double execution
        if (this.isRunning && task.enabled) {
            this.scheduleTask(task);
        }
    } catch (error) {
        logger.error(`Manual polling task '${task.name}' failed:`, error instanceof Error ? error.message : String(error));
        throw error;
    }
  }

  /**
   * Get all registered tasks
   */
  public getTasks(): PollingTask[] {
      return Array.from(this.tasks.values());
  }

  /**
   * Get pending tasks (tasks that are overdue)
   * Note based on simple interval calculation
   */
  public getPendingTasks(): PollingTask[] {
      const now = Date.now();
      return Array.from(this.tasks.values()).filter(t => 
          t.enabled && (now - t.lastRun >= t.intervalMs)
      );
  }

  private scheduleTask(task: PollingTask): void {
    if (this.timers.has(task.id)) {
      clearTimeout(this.timers.get(task.id)!);
    }

    const timer = setTimeout(async () => {
      if (!this.isRunning || !task.enabled) return;
      
      try {
        await task.handler();
        task.lastRun = Date.now();
      } catch (error) {
        logger.error(`Polling task '${task.name}' failed:`, error instanceof Error ? error.message : String(error));
      } finally {
        // Reschedule
        this.scheduleTask(task);
      }
    }, task.intervalMs);

    this.timers.set(task.id, timer);
  }
}

export const getPollingService = () => PollingService.getInstance();
