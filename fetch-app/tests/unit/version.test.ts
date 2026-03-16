import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';

vi.mock('fs');

describe('getVersion', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads version from VERSION file when present', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).endsWith('VERSION')
    );
    vi.mocked(fs.readFileSync).mockReturnValue('v1.2.3\n');

    const { getVersion } = await import('../../src/utils/version.js');
    expect(getVersion()).toBe('v1.2.3');
  });

  it('falls back to package.json version', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).endsWith('package.json')
    );
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '0.5.0' }));

    const { getVersion } = await import('../../src/utils/version.js');
    expect(getVersion()).toBe('v0.5.0');
  });

  it('returns unknown fallback when no source available', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const { getVersion } = await import('../../src/utils/version.js');
    expect(getVersion()).toBe('v0.0.0-unknown');
  });

  it('caches version after first call', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const { getVersion } = await import('../../src/utils/version.js');
    const first = getVersion();
    const callsAfterFirst = vi.mocked(fs.existsSync).mock.calls.length;
    const second = getVersion();
    const callsAfterSecond = vi.mocked(fs.existsSync).mock.calls.length;
    expect(first).toBe(second);
    // No additional fs calls on second invocation
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });
});
