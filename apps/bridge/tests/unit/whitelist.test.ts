import { beforeEach, describe, expect, it, vi } from 'vitest';

const watcherCloseMock = vi.fn();

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn(),
      close: watcherCloseMock,
    })),
  },
}));

describe('WhitelistStore reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recovers persist lock after a write failure', async () => {
    const { WhitelistStore } = await import('../../src/security/whitelist.js');
    const store = new WhitelistStore();

    const doPersist = vi.spyOn(store as unknown as { doPersist: () => Promise<void> }, 'doPersist');
    doPersist
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined);

    await expect(store.add('15551234567')).rejects.toThrow('disk full');
    await expect(store.add('15557654321')).resolves.toBe(true);
  });

  it('resets singleton init promise after initialization failure', async () => {
    vi.resetModules();
    const module = await import('../../src/security/whitelist.js');
    const initSpy = vi.spyOn(module.WhitelistStore.prototype, 'initialize');
    initSpy.mockRejectedValueOnce(new Error('init failed'));
    initSpy.mockResolvedValueOnce(undefined);

    await expect(module.getWhitelistStore()).rejects.toThrow('init failed');
    await expect(module.getWhitelistStore()).resolves.toBeTruthy();
    expect(initSpy).toHaveBeenCalledTimes(2);
  });

  it('closes watcher on shutdown', async () => {
    const { WhitelistStore } = await import('../../src/security/whitelist.js');
    const store = new WhitelistStore();
    await store.initialize();
    await store.shutdown();
    expect(watcherCloseMock).toHaveBeenCalled();
  });
});
