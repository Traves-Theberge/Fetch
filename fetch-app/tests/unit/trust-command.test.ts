import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../src/session/types.js';

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    OWNER_PHONE_NUMBER: '+15551234567',
  },
}));

const mockWhitelist = {
  add: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  has: vi.fn(),
};

vi.mock('../../src/security/whitelist.js', () => ({
  getWhitelistStore: vi.fn(async () => mockWhitelist),
}));

function makeSession(userId: string): Session {
  return {
    userId,
    chatId: userId,
    displayName: 'Test User',
    history: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    preferences: {},
  } as Session;
}

describe('handleTrust', () => {
  let handleTrust: typeof import('../../src/commands/trust.js').handleTrust;
  const ownerSession = makeSession('15551234567@c.us');
  const otherSession = makeSession('19999999999@c.us');

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../src/commands/trust.js');
    handleTrust = module.handleTrust;
    mockWhitelist.list.mockReturnValue([]);
  });

  it('rejects non-owner users', async () => {
    const result = await handleTrust('add 15559999999', otherSession);
    expect(result.handled).toBe(true);
    expect(result.responses[0]).toContain('Only the owner');
  });

  it('shows help for unknown subcommand', async () => {
    const result = await handleTrust('', ownerSession);
    expect(result.handled).toBe(true);
    expect(result.responses[0]).toContain('Trust Commands');
  });

  describe('add', () => {
    it('adds a valid number', async () => {
      mockWhitelist.add.mockResolvedValue(true);
      const result = await handleTrust('add 15559876543', ownerSession);
      expect(result.responses[0]).toContain('Added');
      expect(mockWhitelist.add).toHaveBeenCalledWith('15559876543');
    });

    it('reports when number is already trusted', async () => {
      mockWhitelist.add.mockResolvedValue(false);
      const result = await handleTrust('add 15559876543', ownerSession);
      expect(result.responses[0]).toContain('already trusted');
    });

    it('rejects numbers shorter than 10 digits', async () => {
      const result = await handleTrust('add 12345', ownerSession);
      expect(result.responses[0]).toContain('Usage');
    });

    it('shows usage when no number provided', async () => {
      const result = await handleTrust('add', ownerSession);
      expect(result.responses[0]).toContain('Usage');
    });
  });

  describe('remove', () => {
    it('removes an existing number', async () => {
      mockWhitelist.remove.mockResolvedValue(true);
      const result = await handleTrust('remove 15559876543', ownerSession);
      expect(result.responses[0]).toContain('Removed');
    });

    it('accepts rm alias', async () => {
      mockWhitelist.remove.mockResolvedValue(true);
      const result = await handleTrust('rm 15559876543', ownerSession);
      expect(result.responses[0]).toContain('Removed');
    });

    it('reports when number was not in whitelist', async () => {
      mockWhitelist.remove.mockResolvedValue(false);
      const result = await handleTrust('remove 15559876543', ownerSession);
      expect(result.responses[0]).toContain('was not in the whitelist');
    });
  });

  describe('list', () => {
    it('shows empty list message', async () => {
      mockWhitelist.list.mockReturnValue([]);
      const result = await handleTrust('list', ownerSession);
      expect(result.responses[0]).toContain('No trusted numbers');
    });

    it('lists trusted numbers', async () => {
      mockWhitelist.list.mockReturnValue(['15559876543', '15551111111']);
      const result = await handleTrust('list', ownerSession);
      expect(result.responses[0]).toContain('15559876543');
      expect(result.responses[0]).toContain('15551111111');
      expect(result.responses[0]).toContain('(2)');
    });

    it('accepts ls alias', async () => {
      mockWhitelist.list.mockReturnValue([]);
      const result = await handleTrust('ls', ownerSession);
      expect(result.responses[0]).toContain('Trusted Numbers');
    });
  });
});
