import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { DangerLevel } from '../../src/tools/types.js';

const loadToolDefinitionMock = vi.fn();
const buildToolSchemaMock = vi.fn();
const watcherCloseMock = vi.fn();

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../src/tools/loader.js', () => ({
  loadToolDefinition: (...args: unknown[]) => loadToolDefinitionMock(...args),
  buildToolSchema: (...args: unknown[]) => buildToolSchemaMock(...args),
}));

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn(),
      close: watcherCloseMock,
    })),
  },
}));

function makeToolDef(name: string) {
  return {
    name,
    description: `${name} description`,
    command: 'echo ok',
    danger: DangerLevel.SAFE,
    parameters: [],
  };
}

describe('ToolRegistry custom tool reload', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    buildToolSchemaMock.mockReturnValue(z.object({}));
  });

  it('removes stale old name when one file is renamed to a new tool name', async () => {
    const { getToolRegistry } = await import('../../src/tools/registry.js');
    const registry = getToolRegistry();
    const internals = registry as unknown as { loadCustomTool: (filePath: string) => Promise<void> };

    loadToolDefinitionMock
      .mockResolvedValueOnce(makeToolDef('tool_a'))
      .mockResolvedValueOnce(makeToolDef('tool_b'));

    await internals.loadCustomTool('/tmp/tool.json');
    await internals.loadCustomTool('/tmp/tool.json');

    expect(registry.get('tool_a')).toBeUndefined();
    expect(registry.get('tool_b')).toBeDefined();
  });

  it('unloads stale mapping when a previously valid file becomes invalid', async () => {
    const { getToolRegistry } = await import('../../src/tools/registry.js');
    const registry = getToolRegistry();
    const internals = registry as unknown as { loadCustomTool: (filePath: string) => Promise<void> };

    loadToolDefinitionMock
      .mockResolvedValueOnce(makeToolDef('tool_live'))
      .mockResolvedValueOnce(null);

    await internals.loadCustomTool('/tmp/live.json');
    expect(registry.get('tool_live')).toBeDefined();

    await internals.loadCustomTool('/tmp/live.json');
    expect(registry.get('tool_live')).toBeUndefined();
  });

  it('closes watchers on shutdown', async () => {
    const { getToolRegistry } = await import('../../src/tools/registry.js');
    const registry = getToolRegistry();
    await registry.shutdown();
    expect(watcherCloseMock).toHaveBeenCalled();
  });
});
