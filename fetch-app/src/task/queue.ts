/**
 * @fileoverview Single-task queue for Fetch v2
 *
 * Implements a simple queue that enforces the "one task at a time" constraint.
 * This ensures that only one coding task is executed at any given moment.
 *
 * @module task/queue
 * @see {@link TaskManager} - Task lifecycle management
 * @see {@link HarnessExecutor} - Task execution
 *
 * ## Overview
 *
 * The TaskQueue:
 * - Holds at most one pending task
 * - Blocks new tasks while one is running
 * - Provides status of current task
 *
 * ## Design Decision
 *
 * We chose a single-task model (not concurrent) because:
 * 1. Harnesses (Claude, Gemini) work best with focused context
 * 2. WhatsApp conversation is serial - user expects one response at a time
 * 3. Simplifies error handling and state management
 * 4. Prevents resource contention in the Kennel container
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import type { Task, TaskId } from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Queue state
 */
export type QueueState = 'idle' | 'busy';

/**
 * Queue status information
 */
export interface QueueStatus {
  /** Current state */
  state: QueueState;
  /** Current task ID (if any) */
  currentTaskId: TaskId | null;
  /** When the current task started */
  startedAt: string | null;
  /** Total tasks processed */
  totalProcessed: number;
}

/**
 * Queue event types
 */
export type QueueEventType =
  | 'queue:idle'
  | 'queue:busy'
  | 'queue:task_started'
  | 'queue:task_finished';

/**
 * Queue event payload
 */
export interface QueueEvent {
  type: QueueEventType;
  timestamp: string;
  taskId?: TaskId;
}

// ============================================================================
// TaskQueue Class
// ============================================================================

/**
 * Single-task queue
 *
 * Enforces the constraint that only one task can run at a time.
 * Emits events for state changes.
 *
 * @example
 * ```typescript
 * const queue = new TaskQueue();
 *
 * // Check if we can accept a new task
 * if (queue.canAccept()) {
 *   queue.setCurrentTask(task);
 *   // ... execute task
 *   queue.clearCurrentTask();
 * } else {
 *   throw new Error('Task already in progress');
 * }
 * ```
 */
export class TaskQueue extends EventEmitter {
  /** Current task being processed */
  private currentTask: Task | null = null;

  /** When the current task started */
  private startedAt: string | null = null;

  /** Total number of tasks processed */
  private totalProcessed: number = 0;

  // ==========================================================================
  // Queue Operations
  // ==========================================================================

  /**
   * Check if the queue can accept a new task
   *
   * @returns True if no task is currently running
   */
  canAccept(): boolean {
    return this.currentTask === null;
  }

  /**
   * Set the current task
   *
   * @param task - Task to set as current
   * @throws Error if a task is already running
   */
  setCurrentTask(task: Task): void {
    if (this.currentTask !== null) {
      throw new Error(
        `Cannot set task: ${this.currentTask.id} is already running`
      );
    }

    this.currentTask = task;
    this.startedAt = new Date().toISOString();

    this.emitEvent('queue:busy');
    this.emitEvent('queue:task_started', task.id);

    logger.debug('Queue: task started', { taskId: task.id });
  }

  /**
   * Clear the current task
   *
   * @returns The task that was cleared, or null if none
   */
  clearCurrentTask(): Task | null {
    const task = this.currentTask;

    if (task) {
      this.currentTask = null;
      this.startedAt = null;
      this.totalProcessed++;

      this.emitEvent('queue:task_finished', task.id);
      this.emitEvent('queue:idle');

      logger.debug('Queue: task finished', {
        taskId: task.id,
        totalProcessed: this.totalProcessed,
      });
    }

    return task;
  }

  /**
   * Get the current task
   *
   * @returns Current task or null
   */
  getCurrentTask(): Task | null {
    return this.currentTask;
  }

  /**
   * Get the current task ID
   *
   * @returns Current task ID or null
   */
  getCurrentTaskId(): TaskId | null {
    return this.currentTask?.id ?? null;
  }

  // ==========================================================================
  // Queue Status
  // ==========================================================================

  /**
   * Get the current queue state
   *
   * @returns 'idle' or 'busy'
   */
  getState(): QueueState {
    return this.currentTask === null ? 'idle' : 'busy';
  }

  /**
   * Check if the queue is idle
   *
   * @returns True if no task is running
   */
  isIdle(): boolean {
    return this.currentTask === null;
  }

  /**
   * Check if the queue is busy
   *
   * @returns True if a task is running
   */
  isBusy(): boolean {
    return this.currentTask !== null;
  }

  /**
   * Get full queue status
   *
   * @returns Queue status information
   */
  getStatus(): QueueStatus {
    return {
      state: this.getState(),
      currentTaskId: this.currentTask?.id ?? null,
      startedAt: this.startedAt,
      totalProcessed: this.totalProcessed,
    };
  }

  /**
   * Get how long the current task has been running
   *
   * @returns Duration in milliseconds, or 0 if no task running
   */
  getCurrentTaskDuration(): number {
    if (!this.startedAt) return 0;
    return Date.now() - new Date(this.startedAt).getTime();
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Emit a queue event
   *
   * @param type - Event type
   * @param taskId - Task ID (optional)
   */
  private emitEvent(type: QueueEventType, taskId?: TaskId): void {
    const event: QueueEvent = {
      type,
      timestamp: new Date().toISOString(),
      taskId,
    };
    this.emit(type, event);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global task queue instance
 */
export const taskQueue = new TaskQueue();
