import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('getSessionManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('retries initialization after an init failure', async () => {
    let initAttempts = 0;

    vi.doMock('../../src/session/store.js', () => ({
      getSessionStore: vi.fn(() => ({
        init: vi.fn(async () => {
          initAttempts += 1;
          if (initAttempts === 1) {
            throw new Error('init failed once');
          }
        }),
        getOrCreate: vi.fn(),
        getById: vi.fn(),
        update: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        addMemory: vi.fn(),
        recallMemories: vi.fn(),
      })),
      SessionStore: class {},
    }));

    const { getSessionManager } = await import('../../src/session/manager.js');

    await expect(getSessionManager()).rejects.toThrow('init failed once');
    const manager = await getSessionManager();

    expect(manager).toBeDefined();
    expect(initAttempts).toBe(2);
  });
});
