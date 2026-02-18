import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockManager = {
  hasRunningTask: vi.fn(() => false),
  getCurrentTaskId: vi.fn(() => null),
  createTask: vi.fn(),
  getTask: vi.fn(),
  cancelTask: vi.fn(),
};

const mockIntegration = {
  executeTask: vi.fn(async () => ({ success: true })),
  cancelExecution: vi.fn(() => false),
};

const mockEnv = {
  ENABLE_COPILOT: 'true',
  ENABLE_GEMINI: 'false',
  ENABLE_CLAUDE: 'false',
  ENABLE_OPENCODE: 'false',
  ENABLE_CODEX: 'false',
};

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../src/config/env.js', () => ({ env: mockEnv }));

vi.mock('../../src/task/manager.js', () => ({
  getTaskManager: vi.fn(async () => mockManager),
}));

vi.mock('../../src/workspace/manager.js', () => ({
  workspaceManager: {
    getActiveWorkspaceId: vi.fn(() => 'ws1'),
    getWorkspace: vi.fn(async () => ({ id: 'ws1', name: 'ws1' })),
  },
}));

vi.mock('../../src/task/integration.js', () => ({
  getTaskIntegration: vi.fn(() => mockIntegration),
}));

vi.mock('../../src/harness/executor.js', () => ({
  getHarnessExecutor: vi.fn(),
}));

describe('task tool ambiguity choices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.ENABLE_COPILOT = 'true';
    mockEnv.ENABLE_GEMINI = 'false';
    mockEnv.ENABLE_CLAUDE = 'false';
    mockEnv.ENABLE_OPENCODE = 'false';
    mockEnv.ENABLE_CODEX = 'false';
  });

  it('returns enabled agents as choices on ambiguous selection error', async () => {
    mockEnv.ENABLE_COPILOT = 'true';
    mockEnv.ENABLE_CLAUDE = 'true';
    mockManager.createTask.mockRejectedValueOnce(new Error('Ambiguous agent selection: multiple enabled'));

    const { handleTaskCreate } = await import('../../src/tools/task.js');
    const result = await handleTaskCreate({ goal: 'do thing' });

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.output);
    expect(payload.error).toBe('AMBIGUOUS_AGENT_SELECTION');
    expect(payload.choices).toEqual(['copilot', 'claude']);
  });

  it('falls back to schema agent list when no agents are enabled', async () => {
    mockEnv.ENABLE_COPILOT = 'false';
    mockEnv.ENABLE_GEMINI = 'false';
    mockEnv.ENABLE_CLAUDE = 'false';
    mockEnv.ENABLE_OPENCODE = 'false';
    mockEnv.ENABLE_CODEX = 'false';
    mockManager.createTask.mockRejectedValueOnce(new Error('No agents are currently enabled in configuration'));

    const { handleTaskCreate } = await import('../../src/tools/task.js');
    const result = await handleTaskCreate({ goal: 'do thing' });

    const payload = JSON.parse(result.output);
    expect(payload.choices).toEqual(['copilot', 'gemini', 'claude', 'opencode', 'codex']);
  });

  it('task_cancel terminates active process when integration reports running execution', async () => {
    mockManager.getTask.mockReturnValue({
      id: 'tsk_1234567890',
      status: 'running',
      startedAt: new Date(Date.now() - 5000).toISOString(),
    });
    mockIntegration.cancelExecution.mockReturnValue(true);

    const { handleTaskCancel } = await import('../../src/tools/task.js');
    const result = await handleTaskCancel({ taskId: 'tsk_1234567890' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('terminated active process');
    expect(mockIntegration.cancelExecution).toHaveBeenCalledWith('tsk_1234567890');
    expect(mockManager.cancelTask).toHaveBeenCalledWith('tsk_1234567890');
    expect(result.metadata?.processTerminated).toBe(true);
  });

  it('task_status sanitizes structured lifecycle noise from result summaries', async () => {
    mockManager.getCurrentTaskId.mockReturnValue('tsk_abc');
    mockManager.getTask.mockReturnValue({
      id: 'tsk_abc',
      status: 'completed',
      goal: 'Do the thing',
      progress: [],
      result: {
        summary:
          'Done. {\"type\":\"thread.started\",\"thread_id\":\"abc\"}\\n{\"type\":\"item.completed\",\"item\":{\"type\":\"reasoning\"}}\\nFinal summary line.',
      },
    });

    const { handleTaskStatus } = await import('../../src/tools/task.js');
    const result = await handleTaskStatus({});

    expect(result.success).toBe(true);
    expect(result.output).toContain('Result:');
    expect(result.output).toContain('Final summary line.');
    expect(result.output).not.toContain('thread.started');
    expect(result.output).not.toContain('item.completed');
  });
});
