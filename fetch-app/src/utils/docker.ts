/**
 * @fileoverview Docker execution utilities
 *
 * Provides utilities for executing commands inside the Kennel Docker container.
 * The Kennel container is where coding agents (Claude, Gemini, Copilot) run
 * with access to the mounted workspace.
 *
 * @module utils/docker
 * @see {@link HarnessExecutor} - Uses this for container execution
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────┐
 * │           Bridge Container              │
 * │  ┌─────────────────────────────────┐   │
 * │  │         Fetch App               │   │
 * │  │   (calls dockerExec)            │   │
 * │  └─────────────────────────────────┘   │
 * └─────────────────────┬───────────────────┘
 *                       │ docker exec
 *                       ▼
 * ┌─────────────────────────────────────────┐
 * │           Kennel Container              │
 * │  ┌─────────────────────────────────┐   │
 * │  │    Claude / Gemini / Copilot    │   │
 * │  │       (coding agents)           │   │
 * │  └─────────────────────────────────┘   │
 * │                                         │
 * │  /workspace ← mounted from host         │
 * └─────────────────────────────────────────┘
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * import { dockerExec, isKennelRunning } from './utils/docker.js';
 *
 * // Check if Kennel is available
 * if (await isKennelRunning()) {
 *   // Execute command in Kennel
 *   const result = await dockerExec('ls', ['-la', '/workspace']);
 *   console.log(result.stdout);
 * }
 * ```
 */

import Docker from 'dockerode';
import { Writable } from 'stream';
import { logger } from './logger.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Name of the Kennel container
 */
const KENNEL_CONTAINER_NAME = 'fetch-kennel';

/**
 * Default execution timeout (5 minutes)
 */
const DEFAULT_TIMEOUT_MS = 300000;

/**
 * Default working directory in container
 */
const DEFAULT_WORKDIR = '/workspace';

// ============================================================================
// Types
// ============================================================================

/**
 * Docker execution options
 */
export interface DockerExecOptions {
  /** Working directory inside container */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Execution timeout in ms */
  timeoutMs?: number;
  /** User to run as (default: root) */
  user?: string;
  /** Attach to stdin */
  stdin?: boolean;
}

/**
 * Docker execution result
 */
export interface DockerExecResult {
  /** Exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether the command timed out */
  timedOut: boolean;
}

/**
 * Container status information
 */
export interface ContainerStatus {
  /** Whether container exists */
  exists: boolean;
  /** Whether container is running */
  running: boolean;
  /** Container ID (if exists) */
  id?: string;
  /** Container state (running, exited, etc.) */
  state?: string;
}

// ============================================================================
// Docker Client
// ============================================================================

/**
 * Docker client instance
 *
 * Connects via the Docker socket.
 */
let dockerClient: Docker | null = null;

/**
 * Get or create the Docker client
 *
 * @returns Docker client
 */
function getDocker(): Docker {
  if (!dockerClient) {
    dockerClient = new Docker({
      socketPath: '/var/run/docker.sock',
    });
  }
  return dockerClient;
}

// ============================================================================
// Container Management
// ============================================================================

/**
 * Get the Kennel container status
 *
 * @returns Container status
 */
export async function getKennelStatus(): Promise<ContainerStatus> {
  try {
    const docker = getDocker();
    const containers = await docker.listContainers({
      all: true,
      filters: { name: [KENNEL_CONTAINER_NAME] },
    });

    if (containers.length === 0) {
      return { exists: false, running: false };
    }

    const container = containers[0];
    return {
      exists: true,
      running: container.State === 'running',
      id: container.Id,
      state: container.State,
    };
  } catch (error) {
    logger.warn('Failed to get Kennel status', { error });
    return { exists: false, running: false };
  }
}

/**
 * Check if the Kennel container is running
 *
 * @returns True if Kennel is running
 */
export async function isKennelRunning(): Promise<boolean> {
  const status = await getKennelStatus();
  return status.running;
}

/**
 * Get the Kennel container
 *
 * @returns Container instance
 * @throws Error if container not found or not running
 */
async function getKennelContainer(): Promise<Docker.Container> {
  const docker = getDocker();
  const status = await getKennelStatus();

  if (!status.exists) {
    throw new Error(`Kennel container '${KENNEL_CONTAINER_NAME}' not found`);
  }

  if (!status.running) {
    throw new Error(`Kennel container '${KENNEL_CONTAINER_NAME}' is not running`);
  }

  return docker.getContainer(status.id!);
}

// ============================================================================
// Command Execution
// ============================================================================

/**
 * Execute a command in the Kennel container
 *
 * @param command - Command to execute
 * @param args - Command arguments
 * @param options - Execution options
 * @returns Execution result
 *
 * @example
 * ```typescript
 * const result = await dockerExec('claude', ['--print', '-p', 'Add tests']);
 * if (result.exitCode === 0) {
 *   console.log('Success:', result.stdout);
 * } else {
 *   console.error('Failed:', result.stderr);
 * }
 * ```
 */
export async function dockerExec(
  command: string,
  args: string[] = [],
  options: DockerExecOptions = {}
): Promise<DockerExecResult> {
  const {
    cwd = DEFAULT_WORKDIR,
    env = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    user = 'root',
  } = options;

  const container = await getKennelContainer();

  // Build command array
  const cmd = [command, ...args];

  // Build environment array
  const envArray = Object.entries(env).map(([k, v]) => `${k}=${v}`);

  logger.debug('Docker exec', { command, args, cwd });

  // Create exec instance
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: cwd,
    User: user,
    Env: envArray,
  });

  // Start exec and collect output
  return new Promise<DockerExecResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let finished = false;

    // Timeout handler
    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        logger.warn('Docker exec timed out', { command, timeoutMs });
        resolve({
          exitCode: 124, // Timeout exit code
          stdout,
          stderr,
          timedOut: true,
        });
      }
    }, timeoutMs);

    exec.start({ hijack: true, stdin: false }, (err, stream) => {
      if (err) {
        clearTimeout(timeout);
        if (!finished) {
          finished = true;
          resolve({
            exitCode: 1,
            stdout: '',
            stderr: err.message,
            timedOut: false,
          });
        }
        return;
      }

      if (!stream) {
        clearTimeout(timeout);
        if (!finished) {
          finished = true;
          resolve({
            exitCode: 1,
            stdout: '',
            stderr: 'No stream returned',
            timedOut: false,
          });
        }
        return;
      }

      // Demux stdout and stderr
      const stdoutStream = new Writable({
        write(chunk, _encoding, callback) {
          stdout += chunk.toString();
          callback();
        },
      });

      const stderrStream = new Writable({
        write(chunk, _encoding, callback) {
          stderr += chunk.toString();
          callback();
        },
      });

      // Docker multiplexes stdout/stderr
      const docker = getDocker();
      docker.modem.demuxStream(stream, stdoutStream, stderrStream);

      stream.on('end', async () => {
        clearTimeout(timeout);

        if (finished) return;
        finished = true;

        // Get exit code
        try {
          const inspectData = await exec.inspect();
          resolve({
            exitCode: inspectData.ExitCode ?? 0,
            stdout,
            stderr,
            timedOut: false,
          });
        } catch {
          resolve({
            exitCode: 0,
            stdout,
            stderr,
            timedOut: false,
          });
        }
      });

      stream.on('error', (streamErr) => {
        clearTimeout(timeout);
        if (!finished) {
          finished = true;
          resolve({
            exitCode: 1,
            stdout,
            stderr: streamErr.message,
            timedOut: false,
          });
        }
      });
    });
  });
}

/**
 * Execute a command and stream output
 *
 * @param command - Command to execute
 * @param args - Command arguments
 * @param onStdout - Stdout callback
 * @param onStderr - Stderr callback
 * @param options - Execution options
 * @returns Exit code
 */
export async function dockerExecStream(
  command: string,
  args: string[],
  onStdout: (data: string) => void,
  onStderr: (data: string) => void,
  options: DockerExecOptions = {}
): Promise<number> {
  const {
    cwd = DEFAULT_WORKDIR,
    env = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    user = 'root',
  } = options;

  const container = await getKennelContainer();
  const cmd = [command, ...args];
  const envArray = Object.entries(env).map(([k, v]) => `${k}=${v}`);

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: cwd,
    User: user,
    Env: envArray,
  });

  return new Promise<number>((resolve) => {
    let finished = false;

    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve(124);
      }
    }, timeoutMs);

    exec.start({ hijack: true, stdin: false }, (err, stream) => {
      if (err || !stream) {
        clearTimeout(timeout);
        if (!finished) {
          finished = true;
          resolve(1);
        }
        return;
      }

      const stdoutStream = new Writable({
        write(chunk, _encoding, callback) {
          onStdout(chunk.toString());
          callback();
        },
      });

      const stderrStream = new Writable({
        write(chunk, _encoding, callback) {
          onStderr(chunk.toString());
          callback();
        },
      });

      const docker = getDocker();
      docker.modem.demuxStream(stream, stdoutStream, stderrStream);

      stream.on('end', async () => {
        clearTimeout(timeout);
        if (finished) return;
        finished = true;

        try {
          const inspectData = await exec.inspect();
          resolve(inspectData.ExitCode ?? 0);
        } catch {
          resolve(0);
        }
      });

      stream.on('error', () => {
        clearTimeout(timeout);
        if (!finished) {
          finished = true;
          resolve(1);
        }
      });
    });
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * List files in a directory inside the container
 *
 * @param path - Directory path
 * @returns Array of file/directory names
 */
export async function listDirectory(path: string): Promise<string[]> {
  const result = await dockerExec('ls', ['-1', path]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to list directory: ${result.stderr}`);
  }
  return result.stdout.split('\n').filter((line) => line.trim());
}

/**
 * Check if a path exists in the container
 *
 * @param path - Path to check
 * @returns True if path exists
 */
export async function pathExists(path: string): Promise<boolean> {
  const result = await dockerExec('test', ['-e', path]);
  return result.exitCode === 0;
}

/**
 * Get file contents from the container
 *
 * @param path - File path
 * @returns File contents
 */
export async function readFile(path: string): Promise<string> {
  const result = await dockerExec('cat', [path]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to read file: ${result.stderr}`);
  }
  return result.stdout;
}

/**
 * Get workspace path for a project
 *
 * @param workspaceName - Workspace name
 * @returns Full path inside container
 */
export function getWorkspacePath(workspaceName: string): string {
  // Sanitize workspace name to prevent path traversal
  const safeName = workspaceName.replace(/[^a-zA-Z0-9._-]/g, '');
  return `${DEFAULT_WORKDIR}/${safeName}`;
}
