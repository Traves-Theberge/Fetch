/**
 * @fileoverview Docker exec helpers for the Kennel container.
 *
 * Provides status checks plus buffered and streamed command execution.
 *
 * @module utils/docker
 */

import Docker from 'dockerode';
import { Writable } from 'stream';
import { logger } from './logger.js';
import { KENNEL_CONTAINER } from '../harness/types.js';

// ============================================================================
// Constants
// ============================================================================

/** Kennel container name. */
const KENNEL_CONTAINER_NAME = KENNEL_CONTAINER;

/** Default command timeout (ms). */
const DEFAULT_TIMEOUT_MS = 300000;

/** Default working directory in Kennel. */
const DEFAULT_WORKDIR = '/workspace';

// ============================================================================
// Types
// ============================================================================

/** Options for one Docker command execution. */
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

/** Result from one Docker command execution. */
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

/** Current status for the Kennel container. */
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

/** Lazy Docker client (socket: `/var/run/docker.sock`). */
let dockerClient: Docker | null = null;

/** Returns a cached Docker client instance. */
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

/** Returns whether the Kennel container exists and is running. */
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

/** Convenience check for Kennel running state. */
export async function isKennelRunning(): Promise<boolean> {
  const status = await getKennelStatus();
  return status.running;
}

/** Returns the running Kennel container or throws a descriptive error. */
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

/** Executes a command in Kennel and returns captured stdout/stderr plus exit state. */
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
    stdin = false,
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
    let execStream: any = null;

    // Timeout handler
    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        logger.warn('Docker exec timed out', { command, timeoutMs });
        void terminateExecOnTimeout(container, exec, command);
        if (execStream && typeof execStream.destroy === 'function') {
          execStream.destroy();
        }
        resolve({
          exitCode: 124, // Timeout exit code
          stdout,
          stderr,
          timedOut: true,
        });
      }
    }, timeoutMs);

    exec.start({ hijack: true, stdin }, (err, stream) => {
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
      execStream = stream;

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

/** Executes a command in Kennel and streams output through callbacks. */
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
    stdin = false,
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
    let execStream: any = null;

    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        void terminateExecOnTimeout(container, exec, command);
        if (execStream && typeof execStream.destroy === 'function') {
          execStream.destroy();
        }
        resolve(124);
      }
    }, timeoutMs);

    exec.start({ hijack: true, stdin }, (err, stream) => {
      if (err || !stream) {
        clearTimeout(timeout);
        if (!finished) {
          finished = true;
          resolve(1);
        }
        return;
      }
      execStream = stream;

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

/** Returns sanitized workspace path under `/workspace`. */
export function getWorkspacePath(workspaceName: string): string {
  // Sanitize workspace name to prevent path traversal
  const safeName = workspaceName.replace(/[^a-zA-Z0-9._-]/g, '');
  return `${DEFAULT_WORKDIR}/${safeName}`;
}

async function terminateExecOnTimeout(
  container: Docker.Container,
  exec: Docker.Exec,
  command: string
): Promise<void> {
  try {
    const inspectData = await exec.inspect() as { Pid?: number | null };
    const pid = inspectData.Pid;
    if (!pid || pid <= 1) {
      logger.warn('Docker exec timeout: unable to resolve process pid for cancellation', { command });
      return;
    }

    const killer = await container.exec({
      Cmd: ['sh', '-lc', `kill -TERM ${pid} >/dev/null 2>&1 || true; sleep 0.2; kill -KILL ${pid} >/dev/null 2>&1 || true`],
      AttachStdout: false,
      AttachStderr: false,
      WorkingDir: DEFAULT_WORKDIR,
      User: 'root',
    });

    await new Promise<void>((resolve) => {
      killer.start({ hijack: true, stdin: false }, () => resolve());
    });
  } catch (error) {
    logger.warn('Failed to terminate timed-out docker exec process', { command, error });
  }
}
