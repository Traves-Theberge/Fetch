/**
 * @fileoverview Task lifecycle management
 *
 * The TaskManager is responsible for creating, tracking, and managing
 * the lifecycle of coding tasks. It coordinates with the
 * HarnessExecutor to execute tasks.
 *
 * @module task/manager
 * @see {@link Task} - Task entity
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
import { env } from '../config/env.js';
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
 * Check if a task status represents an active (non-terminal) state
 */
function isActiveStatus(status: TaskStatus): boolean {
  return status === 'pending' || status === 'running' || status === 'waiting_input';
}

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
  paused: ['running', 'cancelled'],
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
    if (!input.goal?.trim()) {
      throw new Error('Task goal cannot be empty');
    }

    // Check for running task
    if (this.currentTaskId) {
      const current = this.tasks.get(this.currentTaskId);
      if (current && isActiveStatus(current.status)) {
        throw new Error(
          `Cannot create task: task ${this.currentTaskId} is already ${current.status}`
        );
      }
    }

    // Determine agent
    const agent = this.selectAgent(input.agent ?? 'auto', input.goal);
    logger.info(`Final agent selected: ${agent}`);

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
    try {
      await this.store.saveTask(task);
      await this.store.saveCurrentTaskId(task.id);
    } catch (err) {
      logger.error(`Failed to persist task ${task.id}`, err);
    }

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
    try {
      await this.store.saveTask(task);
    } catch (err) {
      logger.error(`Failed to persist task start: ${taskId}`, err);
    }

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
    try {
      await this.store.saveTask(task);
    } catch (err) {
      logger.error(`Failed to persist waiting_input: ${taskId}`, err);
    }

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
    try {
      await this.store.saveTask(task);
    } catch (err) {
      logger.error(`Failed to persist task resume: ${taskId}`, err);
    }

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
    try {
      await this.store.saveTask(task);
      await this.store.saveCurrentTaskId(null);
    } catch (err) {
      logger.error(`Failed to persist task completion: ${taskId}`, err);
    }

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
    try {
      await this.store.saveTask(task);
      await this.store.saveCurrentTaskId(null);
    } catch (err) {
      logger.error(`Failed to persist task failure: ${taskId}`, err);
    }

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
    try {
      await this.store.saveTask(task);
      await this.store.saveCurrentTaskId(this.currentTaskId);
    } catch (err) {
      logger.error(`Failed to persist task cancellation: ${taskId}`, err);
    }

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
    try {
      await this.store.saveTask(task);
    } catch (err) {
      logger.error(`Failed to persist task progress: ${taskId}`, err);
    }

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
    return task !== undefined && isActiveStatus(task.status);
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
   * @param _goal - Task goal
   * @returns Selected agent type
   * @throws Error if selection is ambiguous or no agents are enabled
   */
  private selectAgent(selection: string, _goal: string): AgentType {
    // Helper to check if a string flag is 'true'
    const isTrue = (val: any) => String(val).trim().toLowerCase() === 'true';

    const copilotEnabled = isTrue(env.ENABLE_COPILOT);
    const geminiEnabled = isTrue(env.ENABLE_GEMINI);
    const claudeEnabled = isTrue(env.ENABLE_CLAUDE);

    // 1. Explicit selection
    if (selection !== 'auto') {
      const agent = selection as AgentType;
      const opencodeEnabled = isTrue(env.ENABLE_OPENCODE);
      const codexEnabled = isTrue(env.ENABLE_CODEX);

      const isEnabled = (agent === 'copilot' && copilotEnabled) ||
        (agent === 'gemini' && geminiEnabled) ||
        (agent === 'claude' && claudeEnabled) ||
        (agent === 'opencode' && opencodeEnabled) ||
        (agent === 'codex' && codexEnabled);

      if (!isEnabled) {
        throw new Error(
          `Requested agent "${selection}" is not enabled. ` +
          `Enabled agents: ${copilotEnabled ? 'copilot ' : ''}${geminiEnabled ? 'gemini ' : ''}${claudeEnabled ? 'claude ' : ''}${opencodeEnabled ? 'opencode ' : ''}${codexEnabled ? 'codex' : ''}`.trim()
        );
      }
      return agent;
    }

    // 2. Auto-selection based on env flags
    const enabled: AgentType[] = [];
    if (copilotEnabled) enabled.push('copilot');
    if (geminiEnabled) enabled.push('gemini');
    if (claudeEnabled) enabled.push('claude');
    if (isTrue(env.ENABLE_OPENCODE)) enabled.push('opencode');
    if (isTrue(env.ENABLE_CODEX)) enabled.push('codex');
    logger.info(`Enabled agents for selection: ${enabled.join(', ')}`);

    if (enabled.length === 1) {
      logger.info(`Auto-selected agent: ${enabled[0]}`);
      return enabled[0];
    }

    if (enabled.length > 1) {
      throw new Error(
        `Ambiguous agent selection: Multiple agents are enabled (${enabled.join(', ')}). ` +
        `Please specify which agent to use (e.g., "use gemini to...") or disable others in .env.`
      );
    }

    throw new Error(
      'No agents are currently enabled in configuration (ENABLE_COPILOT, ENABLE_GEMINI, ENABLE_CLAUDE, ENABLE_OPENCODE, or ENABLE_CODEX). ' +
      'Please check your .env settings.'
    );
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
let taskInitPromise: Promise<TaskManager> | null = null;

/**
 * Get or create the global task manager instance
 *
 * @returns Task manager instance
 */
export async function getTaskManager(): Promise<TaskManager> {
  if (taskManagerInstance) return taskManagerInstance;
  if (taskInitPromise) return taskInitPromise;

  taskInitPromise = (async () => {
    const instance = new TaskManager();
    await instance.init();
    taskManagerInstance = instance;
    return instance;
  })();

  return taskInitPromise;
}
