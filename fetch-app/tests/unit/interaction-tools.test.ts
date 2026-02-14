import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTaskManager = {
  getCurrentTaskId: vi.fn(),
  getTask: vi.fn(),
  setWaitingInput: vi.fn(),
  addProgress: vi.fn(),
};

vi.mock('../../src/task/manager.js', () => ({
  getTaskManager: vi.fn(async () => mockTaskManager),
}));

describe('interaction tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-approves unnecessary confirmation questions outside supervised mode', async () => {
    const { handleAskUser } = await import('../../src/tools/interaction.js');

    const result = await handleAskUser(
      { question: 'Should I proceed?' },
      { autonomyLevel: 'aggressive' }
    );

    expect(result.success).toBe(true);
    expect(result.metadata?.autoApproved).toBe(true);
    expect(mockTaskManager.setWaitingInput).not.toHaveBeenCalled();
  });

  it('sends question to task manager when active task exists', async () => {
    mockTaskManager.getCurrentTaskId.mockReturnValue('tsk_1');
    mockTaskManager.getTask.mockReturnValue({ id: 'tsk_1', status: 'running' });

    const { handleAskUser } = await import('../../src/tools/interaction.js');

    const result = await handleAskUser({ question: 'Pick one', options: ['A', 'B'] });

    expect(result.success).toBe(true);
    expect(mockTaskManager.setWaitingInput).toHaveBeenCalledWith('tsk_1', expect.stringContaining('Options:'));
  });

  it('rejects progress update when no active task exists', async () => {
    mockTaskManager.getCurrentTaskId.mockReturnValue(null);

    const { handleReportProgress } = await import('../../src/tools/interaction.js');
    const result = await handleReportProgress({ message: 'working', percent: 50 });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No active task');
  });
});
