import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockProject, createMockSession } from '../helpers/mock-session.js';

const mockTaskManager = {
  hasRunningTask: vi.fn(() => false),
  getCurrentTaskId: vi.fn(() => null),
  cancelTask: vi.fn(),
};

const mockTaskIntegration = {
  cancelExecution: vi.fn(() => false),
};

vi.mock('../../src/task/manager.js', () => ({
  getTaskManager: vi.fn(async () => mockTaskManager),
}));

vi.mock('../../src/task/integration.js', () => ({
  getTaskIntegration: vi.fn(() => mockTaskIntegration),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import { exec } from 'child_process';
import { handleStop, handleUndoAll } from '../../src/commands/task.js';

describe('Task Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops active task and reports process termination', async () => {
    mockTaskManager.hasRunningTask.mockReturnValue(true);
    mockTaskManager.getCurrentTaskId.mockReturnValue('tsk_123');
    mockTaskIntegration.cancelExecution.mockReturnValue(true);

    const session = createMockSession();
    const result = await handleStop(session, {} as never);

    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('process terminated');
    expect(mockTaskIntegration.cancelExecution).toHaveBeenCalledWith('tsk_123');
    expect(mockTaskManager.cancelTask).toHaveBeenCalledWith('tsk_123');
  });

  it('returns guidance when session has no start commit', async () => {
    const session = createMockSession();
    const result = await handleUndoAll(session, {} as never);
    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('No start point recorded');
  });

  it('runs git validation and reset with explicit workspace cwd', async () => {
    vi.mocked(exec).mockImplementation(((cmd: string, opts: unknown, cb?: unknown) => {
      const callback = (typeof opts === 'function' ? opts : cb) as (err: Error | null, value: { stdout: string; stderr: string }) => void;
      callback(null, { stdout: '', stderr: '' });
      return {} as never;
    }) as never);

    const session = createMockSession({
      currentProject: createMockProject('my-app'),
    });
    session.gitStartCommit = 'abc1234';

    const result = await handleUndoAll(session, {} as never);

    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('Reset to session start');
    expect(vi.mocked(exec)).toHaveBeenNthCalledWith(
      1,
      'git rev-parse --is-inside-work-tree',
      { cwd: '/workspace/my-app' },
      expect.any(Function)
    );
    expect(vi.mocked(exec)).toHaveBeenNthCalledWith(
      2,
      'git reset --hard abc1234',
      { cwd: '/workspace/my-app' },
      expect.any(Function)
    );
  });

  it('fails safely when git repository validation fails', async () => {
    vi.mocked(exec).mockImplementation(((cmd: string, opts: unknown, cb?: unknown) => {
      const callback = (typeof opts === 'function' ? opts : cb) as (err: Error | null, value: { stdout: string; stderr: string }) => void;
      if (cmd.startsWith('git rev-parse')) {
        callback(new Error('not a git repo'), { stdout: '', stderr: 'not a git repo' });
      } else {
        callback(null, { stdout: '', stderr: '' });
      }
      return {} as never;
    }) as never);

    const session = createMockSession({
      currentProject: createMockProject('my-app'),
    });
    session.gitStartCommit = 'abc1234';

    const result = await handleUndoAll(session, {} as never);
    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('valid git workspace');
  });
});
