import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TpmjsToolManifest } from '../../src/tools/tpmjs_client.js';

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock the TpmjsClient
const getManifestsMock = vi.fn();
vi.mock('../../src/tools/tpmjs_client.js', () => ({
  TpmjsClient: class MockTpmjsClient {
    getManifests = getManifestsMock;
  },
}));

import {
  manifestToToolDefinition,
  sanitizeToolName,
  loadFetchConfig,
  loadTpmjsTools,
} from '../../src/tools/tpmjs_loader.js';
import { DangerLevel } from '../../src/tools/types.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('tpmjs_loader', () => {
  describe('sanitizeToolName', () => {
    it('converts scoped package names', () => {
      expect(sanitizeToolName('@tpmjs/discord-read')).toBe('tpmjs_discord_read');
    });

    it('converts hyphens to underscores', () => {
      expect(sanitizeToolName('bash-tool')).toBe('bash_tool');
    });

    it('removes invalid characters', () => {
      expect(sanitizeToolName('my.tool!v2')).toBe('mytoolv2');
    });

    it('lowercases the result', () => {
      expect(sanitizeToolName('MyTool')).toBe('mytool');
    });
  });

  describe('manifestToToolDefinition', () => {
    it('converts a simple command manifest', () => {
      const manifest: TpmjsToolManifest = {
        name: 'bash-tool',
        description: 'Run bash commands',
        version: '1.0.0',
        command: 'bash -c {{script}}',
        parameters: [
          { name: 'script', type: 'string', description: 'Script to run', required: true },
        ],
      };

      const result = manifestToToolDefinition(manifest);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('bash_tool');
      expect(result!.command).toBe('bash -c {{script}}');
      expect(result!.danger).toBe(DangerLevel.MODERATE);
      expect(result!.parameters).toHaveLength(1);
      expect(result!.parameters[0].name).toBe('script');
    });

    it('converts an MCP manifest', () => {
      const manifest: TpmjsToolManifest = {
        name: '@tpmjs/discord-read',
        description: 'Read Discord messages',
        version: '2.0.0',
        mcp: {
          command: 'npx',
          args: ['-y', '@tpmjs/discord-read'],
          env: { DISCORD_TOKEN: 'placeholder' },
        },
      };

      const result = manifestToToolDefinition(manifest);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('tpmjs_discord_read');
      expect(result!.command).toContain('npx');
      expect(result!.command).toContain('@tpmjs/discord-read');
      expect(result!.command).toContain('DISCORD_TOKEN');
    });

    it('returns null for manifests with no command or mcp', () => {
      const manifest: TpmjsToolManifest = {
        name: 'empty-tool',
        description: 'No exec config',
        version: '1.0.0',
      };

      const result = manifestToToolDefinition(manifest);
      expect(result).toBeNull();
    });
  });

  describe('loadFetchConfig', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tpmjs-test-'));
    });

    it('loads a valid config', async () => {
      const configPath = path.join(tmpDir, 'fetch.config.json');
      await fs.writeFile(configPath, JSON.stringify({
        tools: ['bash-tool', '@tpmjs/discord-read'],
      }));

      const config = await loadFetchConfig(configPath);
      expect(config).not.toBeNull();
      expect(config!.tools).toEqual(['bash-tool', '@tpmjs/discord-read']);
    });

    it('returns null for missing file', async () => {
      const result = await loadFetchConfig(path.join(tmpDir, 'nonexistent.json'));
      expect(result).toBeNull();
    });

    it('returns null for invalid JSON', async () => {
      const configPath = path.join(tmpDir, 'bad.json');
      await fs.writeFile(configPath, 'not json');

      const result = await loadFetchConfig(configPath);
      expect(result).toBeNull();
    });

    it('returns null for schema-invalid config', async () => {
      const configPath = path.join(tmpDir, 'bad-schema.json');
      await fs.writeFile(configPath, JSON.stringify({ tools: 'not-an-array' }));

      const result = await loadFetchConfig(configPath);
      expect(result).toBeNull();
    });

    it('accepts config with optional tpmjs section', async () => {
      const configPath = path.join(tmpDir, 'full.json');
      await fs.writeFile(configPath, JSON.stringify({
        tools: ['my-tool'],
        tpmjs: { baseUrl: 'https://custom.registry/api', timeoutMs: 5000 },
      }));

      const config = await loadFetchConfig(configPath);
      expect(config).not.toBeNull();
      expect(config!.tpmjs?.baseUrl).toBe('https://custom.registry/api');
      expect(config!.tpmjs?.timeoutMs).toBe(5000);
    });
  });

  describe('loadTpmjsTools', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tpmjs-load-'));
      vi.clearAllMocks();
    });

    it('returns empty result when config not found', async () => {
      const result = await loadTpmjsTools(path.join(tmpDir, 'nonexistent.json'));
      expect(result.tools).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
    });

    it('returns empty result when tools array is empty', async () => {
      const configPath = path.join(tmpDir, 'fetch.config.json');
      await fs.writeFile(configPath, JSON.stringify({ tools: [] }));

      const result = await loadTpmjsTools(configPath);
      expect(result.tools).toHaveLength(0);
    });

    it('loads tools successfully from manifests', async () => {
      const configPath = path.join(tmpDir, 'fetch.config.json');
      await fs.writeFile(configPath, JSON.stringify({ tools: ['bash-tool'] }));

      getManifestsMock.mockResolvedValue([
        {
          name: 'bash-tool',
          description: 'Run bash commands',
          version: '1.0.0',
          command: 'bash -c {{script}}',
          parameters: [{ name: 'script', type: 'string', description: 'Script', required: true }],
        },
      ]);

      const result = await loadTpmjsTools(configPath);
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].definition.name).toBe('bash_tool');
      expect(result.failed).toHaveLength(0);
    });

    it('tracks failed tool fetches', async () => {
      const configPath = path.join(tmpDir, 'fetch.config.json');
      await fs.writeFile(configPath, JSON.stringify({ tools: ['bash-tool', 'missing-tool'] }));

      getManifestsMock.mockResolvedValue([
        {
          name: 'bash-tool',
          description: 'Run bash',
          version: '1.0.0',
          command: 'bash',
        },
      ]);

      const result = await loadTpmjsTools(configPath);
      expect(result.tools).toHaveLength(1);
      expect(result.failed).toContain('missing-tool');
    });
  });
});
