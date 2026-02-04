/**
 * @fileoverview Task lifecycle management
 *
 * The TaskManager is responsible for creating, tracking, and managing
 * the lifecycle of coding tasks in Fetch v2. It coordinates with the
 * TaskQueue and HarnessExecutor to execute tasks.
 *
 * @module task/manager
 * @see {@link Task} - Task entity
 * @see {@link TaskQueue} - Single-task queue
 * @see {@link HarnessExecutor} - Task execution
 *
 * ## Overview
 *
 * The TaskManager handles:
 * - Task creation and validation
 * - Task state transitions
 * - Progress tracking
 * - Result handling
 * - Event emission
 *
 * ## State Machine
 *
 * ```
 * pending ──────► running ──────► completed
 *                    │                ▲
 *                    ▼                │
 *              waiting_input ─────────┘
 *                    │
 *                    ▼
 *                 failed
 *                    │
 *                    ▼
 *               cancelled
 * ```
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { generateTaskId, generateProgressId } from '../utils/id.js';
import { getTaskStore, TaskStore } from './store.js';
import type {
  Task,
  TaskId,
  TaskStatus,
  TaskProgress,
  TaskResult,
  TaskCreateInput,
  TaskEvent,
  TaskEventType,
  AgentType,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default task constraints
 */
const DEFAULT_CONSTRAINTS = {
  timeoutMs: 300000, // 5 minutes
  requireApproval: false,
  maxRetries: 1,
};

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['running', 'cancelled'],
  running: ['waiting_input', 'completed', 'failed', 'cancelled'],
  waiting_input: ['running', 'completed', 'failed', 'cancelled'],
  completed: [],
  failed: ['cancelled'],
  cancelled: [],
};

// ============================================================================
// TaskManager Class
// ============================================================================

/**
 * Task lifecycle manager
 *
 * Manages the creation, execution, and completion of coding tasks.
 * Emits events for task state changes.
 *
 * @example
 * ```typescript
 * const manager = new TaskManager();
 *
 * manager.on('task:created', (event) => {
 *   console.log(`Task ${event.taskId} created`);
 * });
 *
 * const task = await manager.createTask({
 *   goal: 'Add dark mode',
 *   workspace: 'my-project',
 *   sessionId: 'ses_Ab3dE7gH'
 * });
 * ```
 */
export class TaskManager extends EventEmitter {
  /** In-memory task storage */
  private tasks: Map<TaskId, Task> = new Map();

  /** Currently active task (only one at a time) */
  private currentTaskId: TaskId | null = null;

  /** Persistence store */
  private store: TaskStore;

  constructor(store?: TaskStore) {
    super();
    this.store = store || getTaskStore();
  }

  /**
   * Initialize the task manager, loading state from disk
   */
  async init(): Promise<void> {
    try {
      await this.store.init();
      
      const loadedTasks = await this.store.loadAllTasks();
      for (const task of loadedTasks) {
        this.tasks.set(task.id, task);
      }
      
      this.currentTaskId = await this.store.loadCurrentTaskId();
      
      logger.info(`TaskManager initialized with ${loadedTasks.length} tasks`, {
        currentTaskId: this.currentTaskId
      });
    } catch (error) {
      logger.error('Failed to initialize TaskManager', { error });
      // Don't throw, just start with empty state if DB fails
    }
  }

  // ==========================================================================
  // Task Creation
  // ==========================================================================

  /**
   * Create a new task
   *
   * @param input - Task creation input
   * @param sessionId - Session ID creating the task
   * @returns Created task
   * @throws Error if a task is already running
   */
  async createTask(input: TaskCreateInput, sessionId: string): Promise<Task> {
    // Check for running task
    if (this.currentTaskId) {
      const current = this.tasks.get(this.currentTaskId);
      if (current && ['pending', 'running', 'waiting_input'].includes(current.status)) {
        throw new Error(
          `Cannot create task: task ${this.currentTaskId} is already ${current.status}`
        );
      }
    }

    // Determine agent
    const agent = this.selectAgent(input.agent ?? 'auto', input.goal);

    // Create task
    const task: Task = {
      id: generateTaskId(),
      goal: input.goal,
      workspace: input.workspace ?? '',
      agent,
      agentSelection: input.agent ?? 'auto',
      status: 'pending',
      priority: 'normal',
      constraints: {
        ...DEFAULT_CONSTRAINTS,
        timeoutMs: input.timeout ?? DEFAULT_CONSTRAINTS.timeoutMs,
      },
      progress: [],
      retryCount: 0,
      createdAt: new Date().toISOString(),
      sessionId,
    };

    // Store task
    this.tasks.set(task.id, task);
    this.currentTaskId = task.id;
    
    // Persist
    await this.store.saveTask(task);
    await this.store.saveCurrentTaskId(task.id);

    // Emit event
    this.emitTaskEvent('task:created', task.id, { task });

    logger.info(`Task created: ${task.id}`, {
      goal: task.goal.substring(0, 50) + '...',
      agent: task.agent,
      workspace: task.workspace,
    });

    return task;
  }

  // ==========================================================================
  // Task State Management
  // ==========================================================================

  /**
   * Start a task
   *
   * @param taskId - Task ID to start
   * @throws Error if task not found or invalid transition
   */
  async startTask(taskId: TaskId): Promise<void> {
    const task = this.getTaskOrThrow(taskId);
    this.transitionTo(task, 'running');
    task.startedAt = new Date().toISOString();
    
    // Persist
    await this.store.saveTask(task);
    
    this.emitTaskEvent('task:started', taskId);

    logger.info(`Task started: ${taskId}`);
  }

  /**
   * Mark task as waiting for user input
   *
   * @param taskId - Task ID
   * @param question - Question being asked
   */
  async setWaitingInput(taskId: TaskId, question: string): Promise<void> {
    const task = this.getTaskOrThrow(taskId);
    this.transitionTo(task, 'waiting_input');
    task.pendingQuestion = question;
    
    // Persist
    await this.store.saveTask(task);
    
    this.emitTaskEvent('task:question', taskId, { question });

    logger.info(`Task waiting for input: ${taskId}`, { question });
  }

  /**
   * Resume task from waiting state
   *
   * @param taskId - Task ID
   */
  async resumeTask(taskId: TaskId): Promise<void> {
    const task = this.getTaskOrThrow(taskId);
    if (task.status !== 'waiting_input') {
      throw new Error(`Cannot resume task: task is ${task.status}, not waiting_input`);
    }
    this.transitionTo(task, 'running');
    task.pendingQuestion = undefined;
    
    // Persist
    await this.store.saveTask(task);

    logger.info(`Task resumed: ${taskId}`);
  }

  /**
   * Complete a task successfully
   *
   * @param taskId - Task ID
   * @param result - Task result
   */
  async completeTask(taskId: TaskId, result: TaskResult): Promise<void> {
    const task = this.getTaskOrThrow(taskId);
    this.transitionTo(task, 'completed');
    task.result = result;
    task.completedAt = new Date().toISOString();
    this.currentTaskId = null;
    
    // Persist
    await this.store.saveTask(task);
    await this.store.saveCurrentTaskId(null);
    
    this.emitTaskEvent('task:completed', taskId, { result });

    logger.success(`Task completed: ${taskId}`, {
      filesModified: result.filesModified.length,
      filesCreated: result.filesCreated.length,
    });
  }

  /**
   * Fail a task
   *
   * @param taskId - Task ID
   * @param error - Error message
   * @param result - Partial result (if any)
   */
  async failTask(taskId: TaskId, error: string, result?: Partial<TaskResult>): Promise<void> {
    const task = this.getTaskOrThrow(taskId);
    this.transitionTo(task, 'failed');
    task.result = {
      success: false,
      summary: error,
      filesModified: result?.filesModified ?? [],
      filesCreated: result?.filesCreated ?? [],
      filesDeleted: result?.filesDeleted ?? [],
      error,
      rawOutput: result?.rawOutput ?? '',
      exitCode: result?.exitCode ?? 1,
    };
    task.completedAt = new Date().toISOString();
    this.currentTaskId = null;
    
    // Persist
    await this.store.saveTask(task);
    await this.store.saveCurrentTaskId(null);
    
    this.emitTaskEvent('task:failed', taskId, { error });

    logger.error(`Task failed: ${taskId}`, { error });
  }

  /**
   * Cancel a task
   *
   * @param taskId - Task ID
   */
  async cancelTask(taskId: TaskId): Promise<void> {
    const task = this.getTaskOrThrow(taskId);
    this.transitionTo(task, 'cancelled');
    task.completedAt = new Date().toISOString();
    if (this.currentTaskId === taskId) {
      this.currentTaskId = null;
    }
    
    // Persist
    await this.store.saveTask(task);
    await this.store.saveCurrentTaskId(this.currentTaskId);
    
    this.emitTaskEvent('task:cancelled', taskId);

    logger.warn(`Task cancelled: ${taskId}`);
  }

  /**
   * Pause a task (alias for setWaitingInput)
   * Used by task integration layer.
   *
   * @param taskId - Task ID
   * @param reason - Reason for pause (e.g., question from harness)
   */
  async pauseTask(taskId: TaskId, reason?: string): Promise<void> {
    await this.setWaitingInput(taskId, reason ?? 'Waiting for input');
    this.emitTaskEvent('task:paused', taskId, { reason });
  }

  // ==========================================================================
  // Progress Tracking
  // ==========================================================================

  /**
   * Add a progress update to a task
   *
   * @param taskId - Task ID
   * @param message - Progress message
   * @param files - Files being modified (optional)
   * @param percent - Percentage complete (optional)
   */
  async addProgress(
    taskId: TaskId,
    message: string,
    files?: string[],
    percent?: number
  ): Promise<void> {
    const task = this.getTaskOrThrow(taskId);

    const progress: TaskProgress = {
      id: generateProgressId(),
      timestamp: new Date().toISOString(),
      message,
      files,
      percent,
    };

    task.progress.push(progress);
    
    // Persist
    await this.store.saveTask(task);
    
    this.emitTaskEvent('task:progress', taskId, { progress });

    logger.debug(`Task progress: ${taskId}`, { message, percent });
  }

  // ==========================================================================
  // Task Queries
  // ==========================================================================

  /**
   * Get a task by ID
   *
   * @param taskId - Task ID
   * @returns Task if found, undefined otherwise
   */
  getTask(taskId: TaskId): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get a task by ID, throwing if not found
   *
   * @param taskId - Task ID
   * @returns Task
   * @throws Error if task not found
   */
  getTaskOrThrow(taskId: TaskId): Task {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  /**
   * Get the current active task
   *
   * @returns Current task if any, undefined otherwise
   */
  getCurrentTask(): Task | undefined {
    return this.currentTaskId ? this.tasks.get(this.currentTaskId) : undefined;
  }

  /**
   * Get the current active task ID
   *
   * @returns Current task ID if any, null otherwise
   */
  getCurrentTaskId(): TaskId | null {
    return this.currentTaskId;
  }

  /**
   * Check if a task is currently running
   *
   * @returns True if a task is running
   */
  hasRunningTask(): boolean {
    if (!this.currentTaskId) return false;
    const task = this.tasks.get(this.currentTaskId);
    return task !== undefined && ['pending', 'running', 'waiting_input'].includes(task.status);
  }

  /**
   * Get all tasks for a session
   *
   * @param sessionId - Session ID
   * @returns Array of tasks
   */
  getTasksForSession(sessionId: string): Task[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.sessionId === sessionId
    );
  }

  /**
   * Get recent tasks (last N)
   *
   * @param limit - Maximum number of tasks to return
   * @returns Array of recent tasks
   */
  getRecentTasks(limit: number = 10): Task[] {
    return Array.from(this.tasks.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Transition a task to a new state
   *
   * @param task - Task to transition
   * @param newStatus - New status
   * @throws Error if transition is invalid
   */
  private transitionTo(task: Task, newStatus: TaskStatus): void {
    const validTargets = VALID_TRANSITIONS[task.status];
    if (!validTargets.includes(newStatus)) {
      throw new Error(
        `Invalid state transition: ${task.status} → ${newStatus}`
      );
    }
    task.status = newStatus;
  }

  /**
   * Select an agent for a task
   *
   * @param selection - Agent selection ('auto' or specific agent)
   * @param _goal - Task goal (for auto-selection logic, unused currently)
   * @returns Selected agent type
   */
  private selectAgent(selection: string, _goal: string): AgentType {
    if (selection !== 'auto') {
      return selection as AgentType;
    }

    // Auto-selection logic
    // For now, default to Claude as it's the most capable
    // Future: analyze goal complexity to route appropriately
    return 'claude';
  }

  /**
   * Emit a task event
   *
   * @param type - Event type
   * @param taskId - Task ID
   * @param data - Event data
   */
  private emitTaskEvent(type: TaskEventType, taskId: TaskId, data?: unknown): void {
    const event: TaskEvent = {
      type,
      taskId,
      timestamp: new Date().toISOString(),
      data,
    };
    this.emit(type, event);
    this.emit('task:*', event); // Wildcard for all task events
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global task manager instance
 */
let taskManagerInstance: TaskManager | null = null;

/**
 * Get or create the global task manager instance
 *
 * @returns Task manager instance
 */
export async function getTaskManager(): Promise<TaskManager> {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager();
    await taskManagerInstance.init();
  }
  return taskManagerInstance;
}
