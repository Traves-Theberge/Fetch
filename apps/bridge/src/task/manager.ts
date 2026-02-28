/**
 * @fileoverview Task lifecycle state manager.
 *
 * Maintains in-memory task state, persists it via `TaskStore`, validates state
 * transitions, and emits task events used by tools/integration layers.
 *
 * @module task/manager
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

/** Default execution constraints applied to newly created tasks. */
const DEFAULT_CONSTRAINTS = {
  timeoutMs: 300000, // 5 minutes
  requireApproval: false,
  maxRetries: 1,
};

/** Returns true when the status represents an active non-terminal task. */
function isActiveStatus(status: TaskStatus): boolean {
  return status === 'pending' || status === 'running' || status === 'waiting_input';
}

/** Allowed state transitions for task lifecycle enforcement. */
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

/** Creates, mutates, and queries task state with persistence and event emission. */
export class TaskManager extends EventEmitter {
  /** In-memory task storage */
  private tasks: Map<TaskId, Task> = new Map();

  /** Currently active task (only one at a time) */
  private currentTaskId: TaskId | null = null;

  /** Persistence store */
  private store: TaskStore;
  private persistenceHealthy: boolean = true;
  private persistenceInitError: string | null = null;

  constructor(store?: TaskStore) {
    super();
    this.store = store || getTaskStore();
  }

  /** Initializes store access and restores persisted tasks/current-task pointer. */
  async init(): Promise<void> {
    try {
      await this.store.init();

      const loadedTasks = await this.store.loadAllTasks();
      for (const task of loadedTasks) {
        this.tasks.set(task.id, task);
      }

      this.currentTaskId = await this.store.loadCurrentTaskId();
      this.persistenceHealthy = true;
      this.persistenceInitError = null;

      logger.info(`TaskManager initialized with ${loadedTasks.length} tasks`, {
        currentTaskId: this.currentTaskId
      });
    } catch (error) {
      this.persistenceHealthy = false;
      this.persistenceInitError = error instanceof Error ? error.message : String(error);
      logger.error('Failed to initialize TaskManager', { error });
      // Don't throw, just start with empty state if DB fails
    }
  }

  // ==========================================================================
  // Task Creation
  // ==========================================================================

  /**
   * Creates a task and marks it as the current active task.
   *
   * @throws Error when a non-terminal task is already active
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

  /** Transitions task from `pending` to `running` and persists state. */
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

  /** Transitions task to `waiting_input` and stores the pending question. */
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

  /** Resumes a task from `waiting_input` back to `running`. */
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

  /** Marks task as completed, stores result, and clears current active task pointer. */
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

  /** Marks task as failed with normalized result payload and persistence update. */
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

  /** Cancels a task and clears current active task pointer when applicable. */
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

  /** Alias used by integration layer to transition a task into waiting input state. */
  async pauseTask(taskId: TaskId, reason?: string): Promise<void> {
    await this.setWaitingInput(taskId, reason ?? 'Waiting for input');
    this.emitTaskEvent('task:paused', taskId, { reason });
  }

  // ==========================================================================
  // Progress Tracking
  // ==========================================================================

  /** Appends one progress entry to the task timeline and persists the task. */
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

  /** Returns task by id or `undefined` when not found. */
  getTask(taskId: TaskId): Task | undefined {
    return this.tasks.get(taskId);
  }

  /** Returns task by id or throws when missing. */
  getTaskOrThrow(taskId: TaskId): Task {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  /** Returns current active task object when set. */
  getCurrentTask(): Task | undefined {
    return this.currentTaskId ? this.tasks.get(this.currentTaskId) : undefined;
  }

  /** Returns current active task id or `null`. */
  getCurrentTaskId(): TaskId | null {
    return this.currentTaskId;
  }

  /** Returns true when the current task is in an active state. */
  hasRunningTask(): boolean {
    if (!this.currentTaskId) return false;
    const task = this.tasks.get(this.currentTaskId);
    return task !== undefined && isActiveStatus(task.status);
  }

  /** Returns whether persistence initialized successfully for this process run. */
  isPersistenceHealthy(): boolean {
    return this.persistenceHealthy;
  }

  /** Returns the initialization error string when persistence is degraded. */
  getPersistenceInitError(): string | null {
    return this.persistenceInitError;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /** Applies a validated state transition or throws on invalid move. */
  private transitionTo(task: Task, newStatus: TaskStatus): void {
    const validTargets = VALID_TRANSITIONS[task.status];
    if (!validTargets.includes(newStatus)) {
      throw new Error(
        `Invalid state transition: ${task.status} → ${newStatus}`
      );
    }
    task.status = newStatus;
  }

  /** Resolves explicit or `auto` agent selection against enabled harness flags. */
  private selectAgent(selection: string, _goal: string): AgentType {
    // Helper to check if a string flag is 'true'
    const isTrue = (val: unknown) => String(val).trim().toLowerCase() === 'true';

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

  /** Emits typed task event and wildcard task stream event. */
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

/** Process-wide task manager singleton state. */
let taskManagerInstance: TaskManager | null = null;
let taskInitPromise: Promise<TaskManager> | null = null;

/** Returns singleton task manager, initializing once on first call. */
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
