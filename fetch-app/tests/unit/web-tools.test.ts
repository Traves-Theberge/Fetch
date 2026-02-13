/**
 * @fileoverview Tests for web_fetch and web_search tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWebFetch, handleWebSearch } from '../../src/tools/web.js';

describe('Web Tools', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes('example.com')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'text/html' },
          text: async () => '<html><head><title>Example Domain</title></head><body><h1>Example Domain</h1><p>This domain is for use in illustrative examples in documents.</p></body></html>',
          json: async () => ({}),
        };
      }
      if (url.includes('httpstat.us/404')) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: { get: () => 'text/plain' },
          text: async () => 'Not Found',
        };
      }
      if (url.includes('searxng')) {
        throw new TypeError('fetch failed');
      }
      return { ok: false, status: 404 };
    });
  });

  // ─── web_fetch ───────────────────────────────────────────────

  describe('web_fetch', () => {
    it('should reject invalid input (missing url)', async () => {
      const result = await handleWebFetch({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should reject invalid URL format', async () => {
      const result = await handleWebFetch({ url: 'not-a-url' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should block private/internal URLs (localhost)', async () => {
      const result = await handleWebFetch({ url: 'http://localhost:3000' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should block private/internal URLs (127.0.0.1)', async () => {
      const result = await handleWebFetch({ url: 'http://127.0.0.1:8080' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should block private/internal URLs (10.x.x.x)', async () => {
      const result = await handleWebFetch({ url: 'http://10.0.0.1/admin' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should block private/internal URLs (192.168.x.x)', async () => {
      const result = await handleWebFetch({ url: 'http://192.168.1.1' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should block private/internal URLs (172.16.x.x)', async () => {
      const result = await handleWebFetch({ url: 'http://172.16.0.1' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should block private/internal URLs (0.0.0.0)', async () => {
      const result = await handleWebFetch({ url: 'http://0.0.0.0:8080' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should block private/internal URLs (IPv6 loopback ::1)', async () => {
      const result = await handleWebFetch({ url: 'http://[::1]:3000' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should block private/internal URLs (IPv6 link-local fe80::)', async () => {
      const result = await handleWebFetch({ url: 'http://[fe80::1]:8080' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should fetch and extract content from a real page', async () => {
      const result = await handleWebFetch({ url: 'https://example.com' });
      expect(result.success).toBe(true);

      const output = JSON.parse(result.output);
      expect(output.url).toBe('https://example.com');
      expect(output.title).toContain('Example');
      expect(output.content).toBeTruthy();
      expect(output.content.length).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
    }, 15000);

    it('should handle CSS selector extraction', async () => {
      const result = await handleWebFetch({ url: 'https://example.com', selector: 'h1' });
      expect(result.success).toBe(true);

      const output = JSON.parse(result.output);
      expect(output.content).toContain('Example Domain');
    }, 15000);

    it('should handle non-existent CSS selector gracefully', async () => {
      const result = await handleWebFetch({ url: 'https://example.com', selector: '#nonexistent-id-12345' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    }, 15000);

    it('should handle HTTP errors gracefully', async () => {
      const result = await handleWebFetch({ url: 'https://httpstat.us/404' });
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    }, 15000);

    it('should include metadata in result', async () => {
      const result = await handleWebFetch({ url: 'https://example.com' });
      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.tool).toBe('web_fetch');
      expect(result.metadata?.url).toBe('https://example.com');
    }, 15000);
  });

  // ─── web_search ──────────────────────────────────────────────

  describe('web_search', () => {
    it('should reject invalid input (missing query)', async () => {
      const result = await handleWebSearch({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should reject empty query', async () => {
      const result = await handleWebSearch({ query: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should return connection error when SearXNG is not running', async () => {
      // SearXNG won't be running in test environment
      const result = await handleWebSearch({ query: 'test query' });
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      // Should give a helpful error about SearXNG not being available
    }, 20000);

    it('should accept valid count parameter', async () => {
      const result = await handleWebSearch({ query: 'test', count: 3 });
      // Will fail because SearXNG isn't running, but validates input accepted
      expect(result.success).toBe(false);
    }, 20000);

    it('should reject count > 20', async () => {
      const result = await handleWebSearch({ query: 'test', count: 50 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should accept category parameter', async () => {
      const result = await handleWebSearch({ query: 'test', category: 'it' });
      expect(result.success).toBe(false); // SearXNG not running
      // But input was accepted (no validation error)
      expect(result.error).not.toContain('Invalid input');
    }, 20000);

    it('should reject count less than 1', async () => {
      const result = await handleWebSearch({ query: 'test', count: 0 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should reject invalid category', async () => {
      const result = await handleWebSearch({ query: 'test', category: 'invalid' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });
  });
});
