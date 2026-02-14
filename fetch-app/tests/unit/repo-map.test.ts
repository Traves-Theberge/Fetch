import { describe, it, expect, vi, beforeEach } from 'vitest';

const dockerExecMock = vi.fn();
const extractSymbolsMock = vi.fn();

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/utils/docker.js', () => ({
  dockerExec: (...args: unknown[]) => dockerExecMock(...args),
}));

vi.mock('../../src/workspace/symbols.js', () => ({
  extractSymbols: (...args: unknown[]) => extractSymbolsMock(...args),
}));

import { generateRepoMap } from '../../src/workspace/repo-map.js';

describe('repo-map generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses deterministic lexical ordering before maxFiles truncation', async () => {
    dockerExecMock.mockImplementation(async (cmd: string, _args: string[]) => {
      if (cmd === 'find') {
        return {
          exitCode: 0,
          stdout: './z.ts\n./a.ts\n./m.ts\n',
          stderr: '',
          timedOut: false,
        };
      }
      if (cmd === 'head') {
        return { exitCode: 0, stdout: 'export const x = 1;', stderr: '', timedOut: false };
      }
      return { exitCode: 1, stdout: '', stderr: '', timedOut: false };
    });

    extractSymbolsMock.mockReturnValue([{ name: 'x', type: 'const' }]);

    const output = await generateRepoMap('/workspace/demo', { maxFiles: 2, projectType: 'typescript' });

    expect(output).toContain('a.ts');
    expect(output).toContain('m.ts');
    expect(output).not.toContain('z.ts');

    const headFiles = dockerExecMock.mock.calls
      .filter((call) => call[0] === 'head')
      .map((call) => call[1][2]);
    expect(headFiles).toEqual(['./a.ts', './m.ts']);
  });
});
