import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockManager = {
  hasRunningTask: vi.fn(() => false),
  getCurrentTaskId: vi.fn(() => null),
  createTask: vi.fn(),
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
  getTaskIntegration: vi.fn(() => ({ executeTask: vi.fn(async () => ({ success: true })) })),
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
});
