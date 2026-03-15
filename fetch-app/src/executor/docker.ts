/**
 * @fileoverview Ephemeral Docker container manager for high-risk task isolation.
 *
 * Uses dockerode to create short-lived containers from the kennel image with
 * strict resource limits and network restrictions. Containers are automatically
 * removed after execution completes.
 *
 * @module executor/docker
 */

import Dockerode from 'dockerode';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Resource limits applied to ephemeral containers.
 */
export interface ContainerResourceLimits {
  /** Memory limit in bytes (default: 512MB) */
  memoryBytes: number;
  /** CPU period/quota fraction (default: 1.0 = one core) */
  cpus: number;
  /** Maximum number of PIDs (default: 256) */
  pidsLimit: number;
  /** Maximum number of open files (default: 1024) */
  nofileLimit: number;
  /** Maximum number of processes/threads (default: 256) */
  nprocLimit: number;
  /** Tmpfs size for /tmp in bytes (default: 64MB) */
  tmpfsSizeBytes: number;
}

/**
 * Configuration for spawning an ephemeral container.
 */
export interface EphemeralContainerConfig {
  /** Docker image to use (default: kennel image) */
  image: string;
  /** Command to execute inside the container */
  command: string[];
  /** Working directory inside the container */
  workingDir: string;
  /** Environment variables to inject */
  env: Record<string, string>;
  /** Host directories to bind-mount as read-only */
  readOnlyMounts: Array<{ hostPath: string; containerPath: string }>;
  /** Host directories to bind-mount as read-write */
  writableMounts: Array<{ hostPath: string; containerPath: string }>;
  /** Resource limits */
  limits: ContainerResourceLimits;
  /** Execution timeout in milliseconds */
  timeoutMs: number;
  /** Allow network access (default: false) */
  networkEnabled: boolean;
  /** Whitelisted hosts for DNS resolution (only when networkEnabled is true) */
  networkWhitelist: string[];
  /** Custom seccomp profile path (default: Docker's built-in default profile) */
  seccompProfile: string | undefined;
}

/**
 * Result of an ephemeral container execution.
 */
export interface EphemeralContainerResult {
  /** Container exit code */
  exitCode: number;
  /** Captured stdout */
  stdout: string;
  /** Captured stderr */
  stderr: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Whether execution was terminated due to timeout */
  timedOut: boolean;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_LIMITS: ContainerResourceLimits = {
  memoryBytes: 512 * 1024 * 1024, // 512MB
  cpus: 1.0,
  pidsLimit: 256,
  nofileLimit: 1024,
  nprocLimit: 256,
  tmpfsSizeBytes: 64 * 1024 * 1024, // 64MB
};

const DEFAULT_IMAGE = 'fetch-kennel:latest';

// ============================================================================
// EphemeralExecutor
// ============================================================================

/**
 * Manages ephemeral Docker containers for isolated task execution.
 *
 * Each container is created, started, awaited, and removed in a single
 * `run()` call. No container state persists beyond the execution.
 */
export class EphemeralExecutor {
  private docker: Dockerode;

  constructor(dockerOptions?: Dockerode.DockerOptions) {
    this.docker = new Dockerode(dockerOptions ?? { socketPath: '/var/run/docker.sock' });
  }

  /**
   * Executes a command inside a fresh ephemeral container.
   *
   * The container is created with strict security defaults:
   * - Read-only root filesystem
   * - No new privileges
   * - All capabilities dropped (only NET_BIND_SERVICE re-added if network enabled)
   * - PIDs limit enforced
   * - Auto-removed after completion
   */
  async run(config: Partial<EphemeralContainerConfig> & Pick<EphemeralContainerConfig, 'command'>): Promise<EphemeralContainerResult> {
    const resolved = this.resolveConfig(config);
    const startTime = Date.now();

    // Build bind mounts
    const binds: string[] = [
      ...resolved.readOnlyMounts.map(m => `${m.hostPath}:${m.containerPath}:ro`),
      ...resolved.writableMounts.map(m => `${m.hostPath}:${m.containerPath}`),
    ];

    // Build environment array
    const envArray = Object.entries(resolved.env).map(([k, v]) => `${k}=${v}`);

    // Compute CPU quota: Docker uses NanoCPUs (1e9 = 1 CPU)
    const nanoCpus = Math.floor(resolved.limits.cpus * 1e9);

    // Build security options
    const securityOpts = ['no-new-privileges:true'];
    if (resolved.seccompProfile) {
      securityOpts.push(`seccomp=${resolved.seccompProfile}`);
    }

    const tmpfsSizeMb = Math.floor(resolved.limits.tmpfsSizeBytes / (1024 * 1024));

    const containerConfig: Dockerode.ContainerCreateOptions = {
      Image: resolved.image,
      Cmd: resolved.command,
      WorkingDir: resolved.workingDir,
      Env: envArray,
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        // Resource limits
        Memory: resolved.limits.memoryBytes,
        MemorySwap: resolved.limits.memoryBytes, // No swap (same as memory = swap disabled)
        NanoCpus: nanoCpus,
        PidsLimit: resolved.limits.pidsLimit,

        // Ulimits
        Ulimits: [
          { Name: 'nofile', Soft: resolved.limits.nofileLimit, Hard: resolved.limits.nofileLimit },
          { Name: 'nproc', Soft: resolved.limits.nprocLimit, Hard: resolved.limits.nprocLimit },
          { Name: 'core', Soft: 0, Hard: 0 }, // Disable core dumps
        ],

        // Security hardening
        ReadonlyRootfs: true,
        SecurityOpt: securityOpts,
        CapDrop: ['ALL'],
        CapAdd: resolved.networkEnabled ? ['NET_BIND_SERVICE'] : [],

        // Network
        NetworkMode: resolved.networkEnabled ? 'bridge' : 'none',

        // Filesystem
        Binds: binds,
        Tmpfs: {
          '/tmp': `rw,noexec,nosuid,size=${tmpfsSizeMb}m`,
        },

        // Cleanup
        AutoRemove: true,
      },
    };

    let container: Dockerode.Container | undefined;
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      logger.info(`Creating ephemeral container from ${resolved.image}`);
      container = await this.docker.createContainer(containerConfig);

      // Attach to streams before starting
      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      // Demux stdout/stderr from the multiplexed Docker stream
      const passThrough = new (await import('stream')).PassThrough();
      const stderrPassThrough = new (await import('stream')).PassThrough();
      container.modem.demuxStream(stream, passThrough, stderrPassThrough);

      passThrough.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      stderrPassThrough.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      // Start container
      await container.start();
      logger.info(`Ephemeral container ${container.id.slice(0, 12)} started`);

      // Setup timeout
      const timeoutPromise = new Promise<'timeout'>((resolve) => {
        if (resolved.timeoutMs > 0) {
          timeoutHandle = setTimeout(() => resolve('timeout'), resolved.timeoutMs);
        }
      });

      // Wait for container to finish
      const waitPromise = container.wait();

      const result = await Promise.race([waitPromise, timeoutPromise]);

      if (result === 'timeout') {
        timedOut = true;
        logger.warn(`Ephemeral container ${container.id.slice(0, 12)} timed out after ${resolved.timeoutMs}ms`);
        try {
          await container.kill();
        } catch {
          // Container may have already exited
        }
      }

      if (timeoutHandle) clearTimeout(timeoutHandle);

      // Allow streams to flush
      await new Promise(resolve => setTimeout(resolve, 100));

      const exitCode = timedOut ? 137 : (result as { StatusCode: number }).StatusCode;
      const durationMs = Date.now() - startTime;

      const execResult: EphemeralContainerResult = {
        exitCode,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        durationMs,
        timedOut,
      };

      logger.info(`Ephemeral container exited with code ${exitCode} in ${durationMs}ms`);
      return execResult;
    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);

      // Try to clean up container if auto-remove didn't fire
      if (container) {
        try {
          await container.remove({ force: true });
        } catch {
          // Already removed or doesn't exist
        }
      }

      throw error;
    }
  }

  /**
   * Merges partial config with defaults.
   */
  private resolveConfig(
    partial: Partial<EphemeralContainerConfig> & Pick<EphemeralContainerConfig, 'command'>
  ): EphemeralContainerConfig {
    return {
      image: partial.image ?? DEFAULT_IMAGE,
      command: partial.command,
      workingDir: partial.workingDir ?? '/workspace',
      env: partial.env ?? {},
      readOnlyMounts: partial.readOnlyMounts ?? [],
      writableMounts: partial.writableMounts ?? [],
      limits: { ...DEFAULT_LIMITS, ...partial.limits },
      timeoutMs: partial.timeoutMs ?? 300_000,
      networkEnabled: partial.networkEnabled ?? false,
      networkWhitelist: partial.networkWhitelist ?? [],
      seccompProfile: partial.seccompProfile,
    };
  }

  /**
   * Checks that the Docker daemon is reachable.
   */
  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }
}
