import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { DiscordSecurityGate } from '../../src/security/discord-gate.js';

describe('DiscordSecurityGate', () => {
  const OWNER_ID = '123456789012345678';
  const TRUSTED_ID = '987654321098765432';
  const UNTRUSTED_ID = '111111111111111111';
  const CHANNEL_A = '222222222222222222';
  const CHANNEL_B = '333333333333333333';
  const CHANNEL_OTHER = '444444444444444444';

  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      DISCORD_OWNER_ID: process.env.DISCORD_OWNER_ID,
      DISCORD_TRUSTED_USER_IDS: process.env.DISCORD_TRUSTED_USER_IDS,
      DISCORD_CHANNEL_IDS: process.env.DISCORD_CHANNEL_IDS,
    };
  });

  afterEach(() => {
    // Restore env
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('should throw without DISCORD_OWNER_ID', () => {
    delete process.env.DISCORD_OWNER_ID;
    expect(() => new DiscordSecurityGate()).toThrow('DISCORD_OWNER_ID');
  });

  it('should construct when DISCORD_OWNER_ID is set', () => {
    process.env.DISCORD_OWNER_ID = OWNER_ID;
    expect(() => new DiscordSecurityGate()).not.toThrow();
  });

  describe('owner/trusted checks', () => {
    let gate: DiscordSecurityGate;

    beforeEach(() => {
      process.env.DISCORD_OWNER_ID = OWNER_ID;
      process.env.DISCORD_TRUSTED_USER_IDS = TRUSTED_ID;
      gate = new DiscordSecurityGate();
    });

    it('should identify the owner', () => {
      expect(gate.isOwner(OWNER_ID)).toBe(true);
      expect(gate.isOwner(TRUSTED_ID)).toBe(false);
    });

    it('should identify trusted users', () => {
      expect(gate.isTrusted(OWNER_ID)).toBe(true);
      expect(gate.isTrusted(TRUSTED_ID)).toBe(true);
      expect(gate.isTrusted(UNTRUSTED_ID)).toBe(false);
    });

    it('should parse multiple trusted users from CSV', () => {
      process.env.DISCORD_TRUSTED_USER_IDS = `${TRUSTED_ID}, ${UNTRUSTED_ID}`;
      const gate2 = new DiscordSecurityGate();
      expect(gate2.isTrusted(TRUSTED_ID)).toBe(true);
      expect(gate2.isTrusted(UNTRUSTED_ID)).toBe(true);
    });
  });

  describe('channel checks', () => {
    let gate: DiscordSecurityGate;

    it('should allow all channels when no channel IDs configured', () => {
      process.env.DISCORD_OWNER_ID = OWNER_ID;
      delete process.env.DISCORD_CHANNEL_IDS;
      gate = new DiscordSecurityGate();

      expect(gate.isChannelAllowed(CHANNEL_A, false)).toBe(true);
      expect(gate.isChannelAllowed(CHANNEL_OTHER, false)).toBe(true);
    });

    it('should restrict to configured channels', () => {
      process.env.DISCORD_OWNER_ID = OWNER_ID;
      process.env.DISCORD_CHANNEL_IDS = `${CHANNEL_A},${CHANNEL_B}`;
      gate = new DiscordSecurityGate();

      expect(gate.isChannelAllowed(CHANNEL_A, false)).toBe(true);
      expect(gate.isChannelAllowed(CHANNEL_B, false)).toBe(true);
      expect(gate.isChannelAllowed(CHANNEL_OTHER, false)).toBe(false);
    });

    it('should always allow DMs regardless of channel config', () => {
      process.env.DISCORD_OWNER_ID = OWNER_ID;
      process.env.DISCORD_CHANNEL_IDS = CHANNEL_A;
      gate = new DiscordSecurityGate();

      expect(gate.isChannelAllowed(CHANNEL_OTHER, true)).toBe(true);
    });
  });

  describe('full authorization', () => {
    let gate: DiscordSecurityGate;

    beforeEach(() => {
      process.env.DISCORD_OWNER_ID = OWNER_ID;
      process.env.DISCORD_TRUSTED_USER_IDS = TRUSTED_ID;
      process.env.DISCORD_CHANNEL_IDS = CHANNEL_A;
      gate = new DiscordSecurityGate();
    });

    it('should authorize owner in allowed channel', () => {
      expect(gate.isAuthorized(OWNER_ID, CHANNEL_A, false)).toBe(true);
    });

    it('should authorize owner in DM', () => {
      expect(gate.isAuthorized(OWNER_ID, CHANNEL_OTHER, true)).toBe(true);
    });

    it('should authorize trusted user in allowed channel', () => {
      expect(gate.isAuthorized(TRUSTED_ID, CHANNEL_A, false)).toBe(true);
    });

    it('should reject untrusted user', () => {
      expect(gate.isAuthorized(UNTRUSTED_ID, CHANNEL_A, false)).toBe(false);
    });

    it('should reject trusted user in disallowed channel', () => {
      expect(gate.isAuthorized(TRUSTED_ID, CHANNEL_OTHER, false)).toBe(false);
    });
  });
});
