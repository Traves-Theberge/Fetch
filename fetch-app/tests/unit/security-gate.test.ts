import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    section: vi.fn(),
    divider: vi.fn(),
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    OWNER_PHONE_NUMBER: '+15551234567',
  },
}));

vi.mock('../../src/security/whitelist.js', () => {
  const numbers = new Set<string>();
  return {
    getWhitelistStore: vi.fn(async () => ({
      has: (n: string) => numbers.has(n),
      add: async (n: string) => { numbers.add(n); return true; },
      remove: async (n: string) => numbers.delete(n),
      count: () => numbers.size,
      list: () => Array.from(numbers),
      shutdown: vi.fn(),
    })),
    WhitelistStore: vi.fn(),
  };
});

describe('SecurityGate', () => {
  let SecurityGate: typeof import('../../src/security/gate.js').SecurityGate;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../src/security/gate.js');
    SecurityGate = module.SecurityGate;
  });

  describe('hasFetchTrigger', () => {
    it('returns true when message starts with @fetch', async () => {
      const gate = await SecurityGate.create();
      expect(gate.hasFetchTrigger('@fetch hello')).toBe(true);
    });

    it('is case-insensitive', async () => {
      const gate = await SecurityGate.create();
      expect(gate.hasFetchTrigger('@FETCH hello')).toBe(true);
      expect(gate.hasFetchTrigger('@Fetch hello')).toBe(true);
    });

    it('returns false for messages without trigger', async () => {
      const gate = await SecurityGate.create();
      expect(gate.hasFetchTrigger('hello world')).toBe(false);
    });

    it('handles leading whitespace', async () => {
      const gate = await SecurityGate.create();
      expect(gate.hasFetchTrigger('  @fetch hello')).toBe(true);
    });
  });

  describe('stripTrigger', () => {
    it('removes @fetch prefix and trims', async () => {
      const gate = await SecurityGate.create();
      expect(gate.stripTrigger('@fetch hello world')).toBe('hello world');
    });

    it('returns body unchanged when no trigger present', async () => {
      const gate = await SecurityGate.create();
      expect(gate.stripTrigger('just a message')).toBe('just a message');
    });
  });

  describe('isOwnerMessage', () => {
    it('returns true for direct message from owner', async () => {
      const gate = await SecurityGate.create();
      expect(gate.isOwnerMessage('15551234567@c.us', undefined)).toBe(true);
    });

    it('returns true for group message from owner via participantId', async () => {
      const gate = await SecurityGate.create();
      expect(gate.isOwnerMessage('group@g.us', '15551234567@c.us')).toBe(true);
    });

    it('returns false for group message without participantId', async () => {
      const gate = await SecurityGate.create();
      expect(gate.isOwnerMessage('group@g.us', undefined)).toBe(false);
    });

    it('returns false for broadcast messages', async () => {
      const gate = await SecurityGate.create();
      expect(gate.isOwnerMessage('broadcast@broadcast', undefined)).toBe(false);
    });

    it('returns false for non-owner sender', async () => {
      const gate = await SecurityGate.create();
      expect(gate.isOwnerMessage('19999999999@c.us', undefined)).toBe(false);
    });
  });

  describe('isAuthorized', () => {
    it('authorizes owner with @fetch trigger', async () => {
      const gate = await SecurityGate.create();
      expect(gate.isAuthorized('15551234567@c.us', undefined, '@fetch hello')).toBe(true);
    });

    it('rejects owner without @fetch trigger', async () => {
      const gate = await SecurityGate.create();
      expect(gate.isAuthorized('15551234567@c.us', undefined, 'hello')).toBe(false);
    });

    it('rejects broadcast messages', async () => {
      const gate = await SecurityGate.create();
      expect(gate.isAuthorized('broadcast@broadcast', undefined, '@fetch hello')).toBe(false);
    });

    it('rejects unknown sender with @fetch trigger', async () => {
      const gate = await SecurityGate.create();
      expect(gate.isAuthorized('19999999999@c.us', undefined, '@fetch hello')).toBe(false);
    });

    it('rejects group message missing participantId', async () => {
      const gate = await SecurityGate.create();
      expect(gate.isAuthorized('group@g.us', undefined, '@fetch hello')).toBe(false);
    });
  });

  describe('isAuthorizedUser', () => {
    it('returns true for owner', async () => {
      const gate = await SecurityGate.create();
      expect(gate.isAuthorizedUser('15551234567@c.us')).toBe(true);
    });

    it('returns false for unknown user', async () => {
      const gate = await SecurityGate.create();
      expect(gate.isAuthorizedUser('19999999999@c.us')).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('clears whitelist reference', async () => {
      const gate = await SecurityGate.create();
      expect(gate.getWhitelist()).not.toBeNull();
      await gate.shutdown();
      expect(gate.getWhitelist()).toBeNull();
    });
  });
});
