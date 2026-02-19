import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('index runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('starts status API and stays alive in setup mode when env validation fails', async () => {
    const exitMock = vi.fn();
    const startStatusServer = vi.fn();
    const updateStatus = vi.fn();

    vi.doMock('../../src/config/env.js', () => ({
      env: {},
      validateEnv: vi.fn(() => ({ valid: false, missing: ['OPENAI_API_KEY'] })),
    }));
    vi.doMock('../../src/api/status.js', () => ({
      startStatusServer,
      setLogoutCallback: vi.fn(),
      setWhatsAppControlCallbacks: vi.fn(),
      updateStatus,
    }));
    vi.doMock('../../src/bridge/client.js', () => ({
      Bridge: class {
        async initialize() { return; }
        async destroy() { return; }
      },
    }));
    vi.doMock('../../src/skills/manager.js', () => ({
      getSkillManager: vi.fn(() => ({ init: vi.fn(async () => undefined), shutdown: vi.fn(async () => undefined) })),
    }));
    vi.doMock('../../src/session/store.js', () => ({
      getSessionStore: vi.fn(() => ({ close: vi.fn() })),
    }));
    vi.doMock('../../src/task/store.js', () => ({
      getTaskStore: vi.fn(() => ({ close: vi.fn() })),
    }));
    vi.doMock('../../src/identity/manager.js', () => ({
      getIdentityManager: vi.fn(() => ({ shutdown: vi.fn() })),
    }));
    vi.doMock('../../src/tools/registry.js', () => ({
      getToolRegistry: vi.fn(() => ({ shutdown: vi.fn() })),
    }));
    vi.doMock('../../src/workflow/manager.js', () => ({
      getWorkflowManager: vi.fn(async () => ({ shutdown: vi.fn(async () => undefined) })),
      shutdownWorkflowManager: vi.fn(async () => undefined),
    }));
    vi.doMock('../../src/utils/version.js', () => ({
      getVersion: vi.fn(() => '0.0.0-test'),
    }));
    vi.doMock('../../src/utils/logger.js', () => ({
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), section: vi.fn(), success: vi.fn(), divider: vi.fn() },
    }));

    const { createRuntime } = await import('../../src/index.js');
    const runtime = createRuntime({ exit: exitMock });

    await runtime.main();

    expect(exitMock).not.toHaveBeenCalled();
    expect(startStatusServer).toHaveBeenCalledTimes(1);
    expect(updateStatus).toHaveBeenCalled();
  });

  it('shutdown is idempotent and exits once', async () => {
    const exitMock = vi.fn();
    const destroyMock = vi.fn(async () => undefined);
    const poolKillAll = vi.fn();

    vi.doMock('../../src/config/env.js', () => ({
      env: {},
      validateEnv: vi.fn(() => ({ valid: true, missing: [] })),
    }));
    vi.doMock('../../src/api/status.js', () => ({
      startStatusServer: vi.fn(),
      setLogoutCallback: vi.fn(),
      setWhatsAppControlCallbacks: vi.fn(),
      updateStatus: vi.fn(),
    }));
    vi.doMock('../../src/bridge/client.js', () => ({
      Bridge: class {
        async initialize() { return; }
        async destroy() { await destroyMock(); }
      },
    }));
    vi.doMock('../../src/harness/pool.js', () => ({
      getHarnessPool: vi.fn(() => ({ getSpawner: () => ({ killAll: poolKillAll }) })),
    }));
    vi.doMock('../../src/skills/manager.js', () => ({
      getSkillManager: vi.fn(() => ({ init: vi.fn(async () => undefined), shutdown: vi.fn(async () => undefined) })),
    }));
    vi.doMock('../../src/session/store.js', () => ({
      getSessionStore: vi.fn(() => ({ close: vi.fn() })),
    }));
    vi.doMock('../../src/task/store.js', () => ({
      getTaskStore: vi.fn(() => ({ close: vi.fn() })),
    }));
    vi.doMock('../../src/identity/manager.js', () => ({
      getIdentityManager: vi.fn(() => ({ shutdown: vi.fn() })),
    }));
    vi.doMock('../../src/tools/registry.js', () => ({
      getToolRegistry: vi.fn(() => ({ shutdown: vi.fn() })),
    }));
    vi.doMock('../../src/workflow/manager.js', () => ({
      getWorkflowManager: vi.fn(async () => ({ shutdown: vi.fn(async () => undefined) })),
      shutdownWorkflowManager: vi.fn(async () => undefined),
    }));
    vi.doMock('../../src/utils/version.js', () => ({
      getVersion: vi.fn(() => '0.0.0-test'),
    }));
    vi.doMock('../../src/utils/logger.js', () => ({
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), section: vi.fn(), success: vi.fn(), divider: vi.fn() },
    }));

    const { createRuntime } = await import('../../src/index.js');
    const runtime = createRuntime({ exit: exitMock });

    await runtime.main();
    await runtime.shutdown('SIGTERM');
    await runtime.shutdown('SIGTERM');

    expect(poolKillAll).toHaveBeenCalledTimes(1);
    expect(destroyMock).toHaveBeenCalledTimes(0);
    expect(exitMock).toHaveBeenCalledTimes(1);
    expect(exitMock).toHaveBeenCalledWith(0);
  });
});
