import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockedFs = vi.mocked(fs);

describe('tool loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects malformed parameters and returns null', async () => {
    mockedFs.readFile.mockResolvedValueOnce(JSON.stringify({
      name: 'bad_tool',
      description: 'Broken tool',
      command: 'echo ok',
      parameters: { not: 'an array' },
    }) as never);

    const { loadToolDefinition } = await import('../../src/tools/loader.js');
    const result = await loadToolDefinition('/tmp/bad-tool.json');

    expect(result).toBeNull();
  });

  it('accepts valid definition and defaults parameters to empty array', async () => {
    mockedFs.readFile.mockResolvedValueOnce(JSON.stringify({
      name: 'ok_tool',
      description: 'Good tool',
      command: 'echo ok',
    }) as never);

    const { loadToolDefinition } = await import('../../src/tools/loader.js');
    const result = await loadToolDefinition('/tmp/ok-tool.json');

    expect(result).toBeDefined();
    expect(result?.name).toBe('ok_tool');
    expect(result?.parameters).toEqual([]);
  });
});
