import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionStore, getSessionStore, resetSessionStoreForTests } from '../../src/session/store.js';

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

describe('SessionStore JSON guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionStoreForTests();
  });

  it('returns safe fallback session when stored JSON is malformed', async () => {
    const store = new SessionStore('/tmp/test-sessions.db');
    const internals = store as unknown as {
      initialized: boolean;
      db: object | null;
      stmtGetById: { get: (id: string) => unknown } | null;
    };

    internals.initialized = true;
    internals.db = {};
    internals.stmtGetById = {
      get: () => ({
        id: 'sess_corrupt',
        user_id: 'user_1',
        data: '{bad json',
        created_at: '2026-02-01T00:00:00.000Z',
        last_activity_at: '2026-02-01T01:00:00.000Z',
      }),
    };

    const session = await store.getById('sess_corrupt');

    expect(session).toBeDefined();
    expect(session?.id).toBe('sess_corrupt');
    expect(session?.userId).toBe('user_1');
    expect(Array.isArray(session?.messages)).toBe(true);
  });
});

describe('SessionStore singleton path semantics', () => {
  beforeEach(() => {
    resetSessionStoreForTests();
  });

  it('throws on dbPath mismatch unless singleton is reset', () => {
    const storeA = getSessionStore('/tmp/a.db');
    expect(storeA).toBeDefined();

    expect(() => getSessionStore('/tmp/b.db')).toThrow(/already initialized/);

    resetSessionStoreForTests();
    expect(() => getSessionStore('/tmp/b.db')).not.toThrow();
  });
});
