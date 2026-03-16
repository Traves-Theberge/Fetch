import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const pingMock = vi.fn();
const createContainerMock = vi.fn();

vi.mock('dockerode', () => ({
  default: class Dockerode {
    constructor() {}
    ping = pingMock;
    createContainer = createContainerMock;
  },
}));

import { EphemeralExecutor } from '../../src/executor/docker.js';
import type { ContainerResourceLimits } from '../../src/executor/docker.js';

describe('EphemeralExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ping', () => {
    it('returns true when Docker daemon is reachable', async () => {
      pingMock.mockResolvedValueOnce('OK');
      const executor = new EphemeralExecutor();
      expect(await executor.ping()).toBe(true);
    });

    it('returns false when Docker daemon is unreachable', async () => {
      pingMock.mockRejectedValueOnce(new Error('connection refused'));
      const executor = new EphemeralExecutor();
      expect(await executor.ping()).toBe(false);
    });
  });

  describe('run config resolution', () => {
    it('uses default image when not specified', async () => {
      const executor = new EphemeralExecutor();

      // Mock the container lifecycle
      const mockStream = { on: vi.fn() };
      const mockContainer = {
        id: 'abc123def456',
        attach: vi.fn().mockResolvedValue(mockStream),
        start: vi.fn().mockResolvedValue(undefined),
        wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
        modem: {
          demuxStream: vi.fn((_stream: unknown, stdout: { on: (event: string, cb: (chunk: Buffer) => void) => void }, _stderr: unknown) => {
            // Simulate empty output
            stdout.on('data', () => {});
          }),
        },
      };
      createContainerMock.mockResolvedValueOnce(mockContainer);

      await executor.run({ command: ['echo', 'hello'] });

      expect(createContainerMock).toHaveBeenCalledOnce();
      const config = createContainerMock.mock.calls[0][0];
      expect(config.Image).toBe('fetch-kennel:latest');
      expect(config.Cmd).toEqual(['echo', 'hello']);
      expect(config.WorkingDir).toBe('/workspace');
    });

    it('applies custom resource limits merged with defaults', async () => {
      const executor = new EphemeralExecutor();

      const mockStream = { on: vi.fn() };
      const mockContainer = {
        id: 'abc123def456',
        attach: vi.fn().mockResolvedValue(mockStream),
        start: vi.fn().mockResolvedValue(undefined),
        wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
        modem: {
          demuxStream: vi.fn(),
        },
      };
      createContainerMock.mockResolvedValueOnce(mockContainer);

      const customLimits: Partial<ContainerResourceLimits> = {
        memoryBytes: 1024 * 1024 * 1024, // 1GB
        cpus: 2.0,
      };

      await executor.run({
        command: ['ls'],
        limits: customLimits as ContainerResourceLimits,
      });

      const config = createContainerMock.mock.calls[0][0];
      // Custom values applied
      expect(config.HostConfig.Memory).toBe(1024 * 1024 * 1024);
      expect(config.HostConfig.NanoCpus).toBe(2e9);
      // Defaults preserved for non-overridden fields
      expect(config.HostConfig.PidsLimit).toBe(256);
    });

    it('disables network by default', async () => {
      const executor = new EphemeralExecutor();

      const mockStream = { on: vi.fn() };
      const mockContainer = {
        id: 'abc123def456',
        attach: vi.fn().mockResolvedValue(mockStream),
        start: vi.fn().mockResolvedValue(undefined),
        wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
        modem: {
          demuxStream: vi.fn(),
        },
      };
      createContainerMock.mockResolvedValueOnce(mockContainer);

      await executor.run({ command: ['ls'] });

      const config = createContainerMock.mock.calls[0][0];
      expect(config.HostConfig.NetworkMode).toBe('none');
      expect(config.HostConfig.CapAdd).toEqual([]);
    });

    it('enables bridge network and NET_BIND_SERVICE when networkEnabled', async () => {
      const executor = new EphemeralExecutor();

      const mockStream = { on: vi.fn() };
      const mockContainer = {
        id: 'abc123def456',
        attach: vi.fn().mockResolvedValue(mockStream),
        start: vi.fn().mockResolvedValue(undefined),
        wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
        modem: {
          demuxStream: vi.fn(),
        },
      };
      createContainerMock.mockResolvedValueOnce(mockContainer);

      await executor.run({ command: ['curl', 'example.com'], networkEnabled: true });

      const config = createContainerMock.mock.calls[0][0];
      expect(config.HostConfig.NetworkMode).toBe('bridge');
      expect(config.HostConfig.CapAdd).toEqual(['NET_BIND_SERVICE']);
    });

    it('enforces security hardening defaults', async () => {
      const executor = new EphemeralExecutor();

      const mockStream = { on: vi.fn() };
      const mockContainer = {
        id: 'abc123def456',
        attach: vi.fn().mockResolvedValue(mockStream),
        start: vi.fn().mockResolvedValue(undefined),
        wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
        modem: {
          demuxStream: vi.fn(),
        },
      };
      createContainerMock.mockResolvedValueOnce(mockContainer);

      await executor.run({ command: ['echo', 'test'] });

      const config = createContainerMock.mock.calls[0][0];
      expect(config.HostConfig.ReadonlyRootfs).toBe(true);
      expect(config.HostConfig.SecurityOpt).toContain('no-new-privileges:true');
      expect(config.HostConfig.CapDrop).toEqual(['ALL']);
      expect(config.HostConfig.AutoRemove).toBe(true);
    });

    it('propagates container creation errors', async () => {
      const executor = new EphemeralExecutor();
      createContainerMock.mockRejectedValueOnce(new Error('image not found'));

      await expect(executor.run({ command: ['ls'] })).rejects.toThrow('image not found');
    });
  });
});
