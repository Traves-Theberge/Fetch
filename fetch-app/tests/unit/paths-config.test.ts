import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import fs from 'fs';

vi.mock('fs');

vi.mock('../../src/config/env.js', () => ({
  env: {
    DATA_DIR: '',
    DATABASE_PATH: '',
    TASKS_DB_PATH: '',
  },
}));

describe('config/paths', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('resolves DATA_DIR from env override', async () => {
    const envModule = await import('../../src/config/env.js');
    (envModule.env as Record<string, string>).DATA_DIR = '/custom/data';

    const { DATA_DIR } = await import('../../src/config/paths.js');
    expect(DATA_DIR).toBe(path.resolve('/custom/data'));

    (envModule.env as Record<string, string>).DATA_DIR = '';
  });

  it('falls back to cwd/data when no other source exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const envModule = await import('../../src/config/env.js');
    (envModule.env as Record<string, string>).DATA_DIR = '';

    const { DATA_DIR } = await import('../../src/config/paths.js');
    expect(DATA_DIR).toBe(path.join(process.cwd(), 'data'));
  });

  it('exports derived path constants', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const envModule = await import('../../src/config/env.js');
    (envModule.env as Record<string, string>).DATA_DIR = '';

    const paths = await import('../../src/config/paths.js');
    expect(paths.IDENTITY_DIR).toContain('identity');
    expect(paths.SKILLS_DIR).toContain('skills');
    expect(paths.TOOLS_DIR).toContain('tools');
    expect(paths.SESSIONS_DB).toContain('sessions.db');
    expect(paths.TASKS_DB).toContain('tasks.db');
    expect(paths.WORKFLOWS_JSON).toContain('workflows.json');
  });
});
