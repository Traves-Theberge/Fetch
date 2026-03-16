import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

import { TpmjsClient } from '../../src/tools/tpmjs_client.js';

describe('TpmjsClient', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('search', () => {
    it('returns results on successful search', async () => {
      const mockResponse = {
        results: [
          { name: 'bash-tool', description: 'Run bash commands', version: '1.0.0' },
        ],
        total: 1,
      };
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new TpmjsClient({ baseUrl: 'https://tpmjs.test/api' });
      const result = await client.search('bash');

      expect(result.results).toHaveLength(1);
      expect(result.results[0].name).toBe('bash-tool');
      expect(result.total).toBe(1);
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchSpy.mock.calls[0][0]).toContain('search?q=bash');
    });

    it('returns empty results on HTTP error', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = new TpmjsClient();
      const result = await client.search('broken');

      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('returns empty results on network failure', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const client = new TpmjsClient();
      const result = await client.search('fail');

      expect(result.results).toHaveLength(0);
    });
  });

  describe('getManifest', () => {
    it('returns manifest on success', async () => {
      const mockManifest = {
        name: 'bash-tool',
        description: 'Run bash commands',
        version: '1.0.0',
        command: 'bash -c {{script}}',
        parameters: [
          { name: 'script', type: 'string', description: 'Script to run', required: true },
        ],
      };
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockManifest),
      });

      const client = new TpmjsClient({ baseUrl: 'https://tpmjs.test/api' });
      const result = await client.getManifest('bash-tool');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('bash-tool');
      expect(result!.command).toBe('bash -c {{script}}');
    });

    it('returns null on 404', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const client = new TpmjsClient();
      const result = await client.getManifest('nonexistent');

      expect(result).toBeNull();
    });

    it('returns null on network failure', async () => {
      fetchSpy.mockRejectedValue(new Error('Connection refused'));

      const client = new TpmjsClient();
      const result = await client.getManifest('broken');

      expect(result).toBeNull();
    });
  });

  describe('getManifests', () => {
    it('returns only successful manifests', async () => {
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ name: 'tool-a', description: 'A', version: '1.0.0', command: 'echo a' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });

      const client = new TpmjsClient();
      const results = await client.getManifests(['tool-a', 'tool-b']);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('tool-a');
    });
  });

  describe('custom options', () => {
    it('strips trailing slashes from baseUrl', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [], total: 0 }),
      });

      const client = new TpmjsClient({ baseUrl: 'https://tpmjs.test/api///' });
      await client.search('test');

      expect(fetchSpy.mock.calls[0][0]).toMatch(/^https:\/\/tpmjs\.test\/api\/search/);
    });
  });
});
