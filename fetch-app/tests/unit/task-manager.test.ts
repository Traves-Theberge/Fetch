/**
 * @fileoverview TaskManager Unit Tests
 *
 * Tests the TaskManager class including task creation, state machine
 * transitions, progress tracking, query methods, agent selection,
 * cancellation, and event emissions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../src/utils/id.js', () => {
  let taskCounter = 0;
  let progressCounter = 0;
  return {
    generateTaskId: vi.fn(() => `tsk_test${++taskCounter}` as const),
    generateProgressId: vi.fn(() => `prg_test${++progressCounter}`),
  };
});

const mockStore = {
  init: vi.fn(),
  loadAllTasks: vi.fn(() => []),
  loadCurrentTaskId: vi.fn(() => null),
  saveTask: vi.fn(),
  saveCurrentTaskId: vi.fn(),
};

vi.mock('../../src/task/store.js', () => ({
  getTaskStore: vi.fn(() => mockStore),
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    ENABLE_COPILOT: true,
    ENABLE_CLAUDE: false,
    ENABLE_GEMINI: false,
  },
  VERSION: '4.3.1',
}));

const { TaskManager } = await import('../../src/task/manager.js');
const { env } = await import('../../src/config/env.js');

// ============================================================================
// Helpers
// ============================================================================

async function createInitializedManager(): Promise<InstanceType<typeof TaskManager>> {
  const manager = new TaskManager();
  await manager.init();
  return manager;
}

const validInput = { goal: 'Add dark mode support', workspace: 'my-project' };
const sessionId = 'ses_test123';

// ============================================================================
// Tests
// ============================================================================

describe('TaskManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env to single-agent default
    (env as any).ENABLE_COPILOT = true;
    (env as any).ENABLE_CLAUDE = false;
    (env as any).ENABLE_GEMINI = false;
  });

  // ==========================================================================
  // Task Creation
  // ==========================================================================

  describe('Task Creation', () => {
    it('should create a task with valid input and default constraints', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);

      expect(task.id).toMatch(/^tsk_/);
      expect(task.goal).toBe('Add dark mode support');
      expect(task.workspace).toBe('my-project');
      expect(task.status).toBe('pending');
      expect(task.agent).toBe('copilot');
      expect(task.agentSelection).toBe('auto');
      expect(task.priority).toBe('normal');
      expect(task.progress).toEqual([]);
      expect(task.retryCount).toBe(0);
      expect(task.constraints.timeoutMs).toBe(300000);
      expect(task.constraints.requireApproval).toBe(false);
      expect(task.constraints.maxRetries).toBe(1);
      expect(task.sessionId).toBe(sessionId);
      expect(task.createdAt).toBeDefined();
    });

    it('should persist the task and current task id to the store', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);

      expect(mockStore.saveTask).toHaveBeenCalledWith(task);
      expect(mockStore.saveCurrentTaskId).toHaveBeenCalledWith(task.id);
    });

    it('should reject an empty goal', async () => {
      const manager = await createInitializedManager();

      await expect(manager.createTask({ goal: '' }, sessionId)).rejects.toThrow(
        'Task goal cannot be empty'
      );
    });

    it('should reject a whitespace-only goal', async () => {
      const manager = await createInitializedManager();

      await expect(manager.createTask({ goal: '   ' }, sessionId)).rejects.toThrow(
        'Task goal cannot be empty'
      );
    });

    it('should reject creating a task when another is already active', async () => {
      const manager = await createInitializedManager();
      await manager.createTask(validInput, sessionId);

      await expect(
        manager.createTask({ goal: 'Second task' }, sessionId)
      ).rejects.toThrow('Cannot create task');
    });

    it('should allow creating a new task after the previous one completes', async () => {
      const manager = await createInitializedManager();
      const first = await manager.createTask(validInput, sessionId);
      await manager.startTask(first.id);
      await manager.completeTask(first.id, {
        success: true,
        summary: 'Done',
        filesModified: [],
        filesCreated: [],
        filesDeleted: [],
        rawOutput: '',
        exitCode: 0,
      });

      const second = await manager.createTask({ goal: 'Another task' }, sessionId);
      expect(second.id).toBeDefined();
      expect(second.goal).toBe('Another task');
    });

    it('should use a custom timeout when provided', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(
        { goal: 'Quick fix', timeout: 60000 },
        sessionId
      );

      expect(task.constraints.timeoutMs).toBe(60000);
    });
  });

  // ==========================================================================
  // State Transitions
  // ==========================================================================

  describe('State Transitions', () => {
    it('should transition from pending to running via startTask', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);

      const updated = manager.getTask(task.id);
      expect(updated?.status).toBe('running');
      expect(updated?.startedAt).toBeDefined();
    });

    it('should transition from running to completed', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);

      const result = {
        success: true,
        summary: 'Completed',
        filesModified: ['src/theme.ts'],
        filesCreated: [],
        filesDeleted: [],
        rawOutput: 'output',
        exitCode: 0,
      };
      await manager.completeTask(task.id, result);

      const updated = manager.getTask(task.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.result).toEqual(result);
      expect(updated?.completedAt).toBeDefined();
    });

    it('should transition from running to failed', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);
      await manager.failTask(task.id, 'Compilation error');

      const updated = manager.getTask(task.id);
      expect(updated?.status).toBe('failed');
      expect(updated?.result?.error).toBe('Compilation error');
      expect(updated?.result?.success).toBe(false);
      expect(updated?.completedAt).toBeDefined();
    });

    it('should transition from running to waiting_input', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);
      await manager.setWaitingInput(task.id, 'Which color scheme?');

      const updated = manager.getTask(task.id);
      expect(updated?.status).toBe('waiting_input');
      expect(updated?.pendingQuestion).toBe('Which color scheme?');
    });

    it('should transition from waiting_input back to running via resumeTask', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);
      await manager.setWaitingInput(task.id, 'Question?');
      await manager.resumeTask(task.id);

      const updated = manager.getTask(task.id);
      expect(updated?.status).toBe('running');
      expect(updated?.pendingQuestion).toBeUndefined();
    });

    it('should throw on invalid transition from pending to completed', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);

      await expect(
        manager.completeTask(task.id, {
          success: true,
          summary: 'Done',
          filesModified: [],
          filesCreated: [],
          filesDeleted: [],
          rawOutput: '',
          exitCode: 0,
        })
      ).rejects.toThrow('Invalid state transition');
    });

    it('should throw on invalid transition from completed to running', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);
      await manager.completeTask(task.id, {
        success: true,
        summary: 'Done',
        filesModified: [],
        filesCreated: [],
        filesDeleted: [],
        rawOutput: '',
        exitCode: 0,
      });

      await expect(manager.startTask(task.id)).rejects.toThrow(
        'Invalid state transition'
      );
    });

    it('should throw when resuming a task that is not waiting_input', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);

      await expect(manager.resumeTask(task.id)).rejects.toThrow(
        'Cannot resume task'
      );
    });
  });

  // ==========================================================================
  // Task Cancellation
  // ==========================================================================

  describe('Task Cancellation', () => {
    it('should cancel a pending task', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);
      await manager.cancelTask(task.id);

      const updated = manager.getTask(task.id);
      expect(updated?.status).toBe('cancelled');
      expect(updated?.completedAt).toBeDefined();
    });

    it('should cancel a running task and clear currentTaskId', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);
      await manager.cancelTask(task.id);

      expect(manager.getTask(task.id)?.status).toBe('cancelled');
      expect(manager.hasRunningTask()).toBe(false);
      expect(manager.getCurrentTask()).toBeUndefined();
    });

    it('should cancel a waiting_input task', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);
      await manager.setWaitingInput(task.id, 'Question?');
      await manager.cancelTask(task.id);

      expect(manager.getTask(task.id)?.status).toBe('cancelled');
    });
  });

  // ==========================================================================
  // Progress Tracking
  // ==========================================================================

  describe('Progress Tracking', () => {
    it('should append progress entries to the task', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);

      await manager.addProgress(task.id, 'Analyzing codebase', ['src/'], 25);
      await manager.addProgress(task.id, 'Writing changes', ['src/theme.ts'], 75);

      const updated = manager.getTask(task.id);
      expect(updated?.progress).toHaveLength(2);
      expect(updated?.progress[0].message).toBe('Analyzing codebase');
      expect(updated?.progress[0].files).toEqual(['src/']);
      expect(updated?.progress[0].percent).toBe(25);
      expect(updated?.progress[1].message).toBe('Writing changes');
      expect(updated?.progress[1].percent).toBe(75);
    });

    it('should persist the task after adding progress', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);

      mockStore.saveTask.mockClear();
      await manager.addProgress(task.id, 'Step 1');

      expect(mockStore.saveTask).toHaveBeenCalled();
    });

    it('should throw when adding progress to a non-existent task', async () => {
      const manager = await createInitializedManager();

      await expect(
        manager.addProgress('tsk_nonexistent' as any, 'msg')
      ).rejects.toThrow('Task not found');
    });
  });

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  describe('Query Methods', () => {
    it('should return a task by id via getTask', async () => {
      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);

      expect(manager.getTask(task.id)).toEqual(task);
    });

    it('should return undefined for a non-existent task id', async () => {
      const manager = await createInitializedManager();

      expect(manager.getTask('tsk_doesnotexist' as any)).toBeUndefined();
    });

    it('should report hasRunningTask correctly for active tasks', async () => {
      const manager = await createInitializedManager();
      expect(manager.hasRunningTask()).toBe(false);

      const task = await manager.createTask(validInput, sessionId);
      // pending is an active status
      expect(manager.hasRunningTask()).toBe(true);

      await manager.startTask(task.id);
      // running is an active status
      expect(manager.hasRunningTask()).toBe(true);

      await manager.completeTask(task.id, {
        success: true,
        summary: 'Done',
        filesModified: [],
        filesCreated: [],
        filesDeleted: [],
        rawOutput: '',
        exitCode: 0,
      });
      // completed clears currentTaskId
      expect(manager.hasRunningTask()).toBe(false);
    });

    it('should return the current task via getCurrentTask', async () => {
      const manager = await createInitializedManager();
      expect(manager.getCurrentTask()).toBeUndefined();

      const task = await manager.createTask(validInput, sessionId);
      expect(manager.getCurrentTask()).toEqual(task);
    });

    it('should throw via getTaskOrThrow for a missing task', async () => {
      const manager = await createInitializedManager();

      expect(() => manager.getTaskOrThrow('tsk_missing' as any)).toThrow(
        'Task not found: tsk_missing'
      );
    });
  });

  // ==========================================================================
  // Agent Selection
  // ==========================================================================

  describe('Agent Selection', () => {
    it('should auto-select the only enabled agent', async () => {
      (env as any).ENABLE_COPILOT = true;
      (env as any).ENABLE_CLAUDE = false;
      (env as any).ENABLE_GEMINI = false;

      const manager = await createInitializedManager();
      const task = await manager.createTask(validInput, sessionId);

      expect(task.agent).toBe('copilot');
    });

    it('should use an explicitly requested agent when enabled', async () => {
      (env as any).ENABLE_COPILOT = true;
      (env as any).ENABLE_CLAUDE = true;
      (env as any).ENABLE_GEMINI = false;

      const manager = await createInitializedManager();
      const task = await manager.createTask(
        { goal: 'Fix bug', agent: 'claude' },
        sessionId
      );

      expect(task.agent).toBe('claude');
    });

    it('should throw when multiple agents are enabled and auto is used', async () => {
      (env as any).ENABLE_COPILOT = true;
      (env as any).ENABLE_CLAUDE = true;
      (env as any).ENABLE_GEMINI = false;

      const manager = await createInitializedManager();

      await expect(
        manager.createTask({ goal: 'Do something' }, sessionId)
      ).rejects.toThrow('Ambiguous agent selection');
    });

    it('should throw when no agents are enabled', async () => {
      (env as any).ENABLE_COPILOT = false;
      (env as any).ENABLE_CLAUDE = false;
      (env as any).ENABLE_GEMINI = false;

      const manager = await createInitializedManager();

      await expect(
        manager.createTask({ goal: 'Do something' }, sessionId)
      ).rejects.toThrow('No agents are currently enabled');
    });

    it('should throw when explicitly requesting a disabled agent', async () => {
      (env as any).ENABLE_COPILOT = true;
      (env as any).ENABLE_CLAUDE = false;
      (env as any).ENABLE_GEMINI = false;

      const manager = await createInitializedManager();

      await expect(
        manager.createTask({ goal: 'Fix', agent: 'claude' }, sessionId)
      ).rejects.toThrow('not enabled');
    });
  });

  // ==========================================================================
  // Event Emissions
  // ==========================================================================

  describe('Event Emissions', () => {
    it('should emit task:created when a task is created', async () => {
      const manager = await createInitializedManager();
      const events: any[] = [];
      manager.on('task:created', (e: any) => events.push(e));

      await manager.createTask(validInput, sessionId);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('task:created');
      expect(events[0].taskId).toMatch(/^tsk_/);
      expect(events[0].timestamp).toBeDefined();
    });

    it('should emit task:started when a task starts', async () => {
      const manager = await createInitializedManager();
      const events: any[] = [];
      manager.on('task:started', (e: any) => events.push(e));

      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('task:started');
    });

    it('should emit task:completed with result data', async () => {
      const manager = await createInitializedManager();
      const events: any[] = [];
      manager.on('task:completed', (e: any) => events.push(e));

      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);
      await manager.completeTask(task.id, {
        success: true,
        summary: 'All done',
        filesModified: ['a.ts'],
        filesCreated: [],
        filesDeleted: [],
        rawOutput: '',
        exitCode: 0,
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('task:completed');
      expect((events[0].data as any).result.summary).toBe('All done');
    });

    it('should emit task:failed with error data', async () => {
      const manager = await createInitializedManager();
      const events: any[] = [];
      manager.on('task:failed', (e: any) => events.push(e));

      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);
      await manager.failTask(task.id, 'Timeout exceeded');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('task:failed');
      expect((events[0].data as any).error).toBe('Timeout exceeded');
    });

    it('should emit task:cancelled when a task is cancelled', async () => {
      const manager = await createInitializedManager();
      const events: any[] = [];
      manager.on('task:cancelled', (e: any) => events.push(e));

      const task = await manager.createTask(validInput, sessionId);
      await manager.cancelTask(task.id);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('task:cancelled');
    });

    it('should emit wildcard task:* for every task event', async () => {
      const manager = await createInitializedManager();
      const wildcardEvents: any[] = [];
      manager.on('task:*', (e: any) => wildcardEvents.push(e));

      const task = await manager.createTask(validInput, sessionId);
      await manager.startTask(task.id);
      await manager.addProgress(task.id, 'Working...');
      await manager.completeTask(task.id, {
        success: true,
        summary: 'Done',
        filesModified: [],
        filesCreated: [],
        filesDeleted: [],
        rawOutput: '',
        exitCode: 0,
      });

      // created, started, progress, completed
      expect(wildcardEvents).toHaveLength(4);
      const types = wildcardEvents.map((e) => e.type);
      expect(types).toContain('task:created');
      expect(types).toContain('task:started');
      expect(types).toContain('task:progress');
      expect(types).toContain('task:completed');
    });
  });
});
