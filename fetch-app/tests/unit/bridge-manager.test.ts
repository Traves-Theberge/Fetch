import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BridgeManager } from '../../src/bridge/manager.js';

describe('BridgeManager', () => {
  let manager: BridgeManager;

  beforeEach(() => {
    manager = new BridgeManager();
  });

  it('starts with no active bridges', () => {
    expect(manager.getActiveBridges().size).toBe(0);
  });

  it('returns undefined for unconfigured channel', () => {
    expect(manager.getBridge('slack')).toBeUndefined();
    expect(manager.getBridge('telegram')).toBeUndefined();
    expect(manager.getBridge('discord')).toBeUndefined();
  });

  it('initializeConfiguredBridges returns empty when no tokens set', async () => {
    // Ensure env vars are not set
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_APP_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.DISCORD_TOKEN;

    const started = await manager.initializeConfiguredBridges();
    expect(started).toEqual([]);
    expect(manager.getActiveBridges().size).toBe(0);
  });

  it('destroyAll clears all bridges', async () => {
    await manager.destroyAll();
    expect(manager.getActiveBridges().size).toBe(0);
  });
});
