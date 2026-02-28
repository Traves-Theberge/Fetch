import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn(),
    })),
  },
}));

describe('IdentityManager reload merge', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('merges loaded context fields (owner) during reloadIdentity', async () => {
    const { IdentityLoader } = await import('../../src/identity/loader.js');
    const loadSpy = vi.spyOn(IdentityLoader.prototype, 'load');
    loadSpy.mockResolvedValue({ context: { owner: 'Updated Owner' } } as never);

    const { getIdentityManager } = await import('../../src/identity/manager.js');
    const manager = getIdentityManager();
    await manager.whenReady();
    await manager.reloadIdentity();

    expect((manager as any).identity.context.owner).toBe('Updated Owner');
    manager.shutdown();
  });
});
