import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStore } from '../../src/task/store.js';

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

describe('TaskStore JSON guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips malformed task rows while loading valid tasks', async () => {
    const store = new TaskStore('/tmp/test-tasks.db');
    const internals = store as unknown as {
      initialized: boolean;
      db: { prepare: (sql: string) => { all: () => Array<{ data: string }> } } | null;
    };

    internals.initialized = true;
    internals.db = {
      prepare: () => ({
        all: () => [
          { data: '{"id":"tsk_valid","sessionId":"s1","goal":"x","workspace":"w","agent":"copilot","agentSelection":"auto","status":"pending","priority":"normal","constraints":{"timeoutMs":1,"requireApproval":false,"maxRetries":1},"progress":[],"retryCount":0,"createdAt":"2026-02-01T00:00:00.000Z"}' },
          { data: '{bad json' },
        ],
      }),
    };

    const tasks = await store.loadAllTasks();

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe('tsk_valid');
  });
});
