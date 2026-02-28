import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

const executorEmitter = new EventEmitter() as EventEmitter & {
  execute: ReturnType<typeof vi.fn>;
};
executorEmitter.execute = vi.fn();

const mockTaskManager = {
  pauseTask: vi.fn().mockResolvedValue(undefined),
  failTask: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../src/task/manager.js', () => ({
  getTaskManager: vi.fn().mockResolvedValue(mockTaskManager),
}));

vi.mock('../../src/harness/executor.js', () => ({
  getHarnessExecutor: vi.fn(() => executorEmitter),
}));

vi.mock('../../src/workspace/manager.js', () => ({
  workspaceManager: {
    getWorkspace: vi.fn(),
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    ENABLE_CLAUDE: true,
    ENABLE_COPILOT: true,
    ENABLE_GEMINI: true,
    ENABLE_OPENCODE: false,
    ENABLE_CODEX: false,
  },
}));

const { TaskIntegration } = await import('../../src/task/integration.js');
const { env } = await import('../../src/config/env.js');
const { workspaceManager } = await import('../../src/workspace/manager.js');

describe('TaskIntegration Event Mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executorEmitter.removeAllListeners();
  });

  it('maps harness output payload data->line for callbacks and task events', async () => {
    const integration = new TaskIntegration();
    await integration.initialize();

    const onProgress = vi.fn();
    (integration as any).progressCallbacks.set('tsk_1', onProgress);
    (integration as any).taskSessions.set('tsk_1', 'ses_1');

    let emittedLine: string | undefined;
    integration.on('task:output', (event) => {
      emittedLine = event.line;
    });

    executorEmitter.emit('harness:output', {
      taskId: 'tsk_1',
      data: { data: 'stream line text' },
    });

    expect(onProgress).toHaveBeenCalledWith('tsk_1', 'stream line text');
    expect(emittedLine).toBe('stream line text');
  });

  it('suppresses structured JSONL progress lines from callback/event output', async () => {
    const integration = new TaskIntegration();
    await integration.initialize();

    const onProgress = vi.fn();
    (integration as any).progressCallbacks.set('tsk_1', onProgress);
    (integration as any).taskSessions.set('tsk_1', 'ses_1');

    let emittedLine: string | undefined;
    integration.on('task:output', (event) => {
      emittedLine = event.line;
    });

    executorEmitter.emit('harness:output', {
      taskId: 'tsk_1',
      data: { line: '{"type":"item.completed","item":{"type":"reasoning","text":"x"}}' },
    });

    expect(onProgress).not.toHaveBeenCalled();
    expect(emittedLine).toBe('');
  });

  it('pauses task manager when harness emits a question event', async () => {
    const integration = new TaskIntegration();
    await integration.initialize();
    (integration as any).taskSessions.set('tsk_1', 'ses_1');

    let emittedQuestion: string | undefined;
    integration.on('task:question', (event) => {
      emittedQuestion = event.question;
    });

    executorEmitter.emit('harness:question', {
      taskId: 'tsk_1',
      data: { question: 'Proceed?' },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockTaskManager.pauseTask).toHaveBeenCalledWith('tsk_1', 'Proceed?');
    expect(emittedQuestion).toBe('Proceed?');
  });

  it('supports opencode/codex in auto selection and throws on ambiguity', async () => {
    const integration = new TaskIntegration();

    (env as any).ENABLE_COPILOT = 'false';
    (env as any).ENABLE_GEMINI = 'false';
    (env as any).ENABLE_CLAUDE = 'false';
    (env as any).ENABLE_OPENCODE = 'true';
    (env as any).ENABLE_CODEX = 'false';
    expect((integration as any).selectAgent('auto')).toBe('opencode');

    (env as any).ENABLE_CODEX = 'true';
    expect(() => (integration as any).selectAgent('auto')).toThrow('Ambiguous agent selection');
  });

  it('does not rethrow when failTask transition throws in executeTask catch path', async () => {
    const integration = new TaskIntegration();
    await integration.initialize();

    mockTaskManager.failTask.mockRejectedValueOnce(new Error('invalid transition'));
    vi.mocked(workspaceManager.getWorkspace as any).mockResolvedValueOnce(null);

    const result = await integration.executeTask({
      id: 'tsk_1',
      goal: 'x',
      workspace: 'missing',
      agent: 'copilot',
      status: 'pending',
      progress: [],
      createdAt: new Date().toISOString(),
      sessionId: 'ses_1',
      priority: 'normal',
      constraints: {},
      retryCount: 0,
      agentSelection: 'copilot',
    } as any);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Workspace not found');
  });

  it('strips structured harness JSONL from user-facing summaries', () => {
    const integration = new TaskIntegration();
    const cleaned = (integration as any).cleanSummaryText([
      '{"type":"thread.started","thread_id":"abc"}',
      '{"type":"item.completed","item":{"type":"reasoning","text":"x"}}',
      'Implemented the zinc shadcn refactor and kept gameplay behavior unchanged.',
    ].join('\n'));

    expect(cleaned).toContain('Implemented the zinc shadcn refactor');
    expect(cleaned).not.toContain('thread.started');
    expect(cleaned).not.toContain('"type":"item.completed"');
  });
});
