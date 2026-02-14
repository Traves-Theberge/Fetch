/**
 * @fileoverview Low-level process spawner for harness commands.
 *
 * Handles process start, stream forwarding, timeout, and termination.
 */

import { spawn, ChildProcess } from 'child_process';
import { nanoid } from 'nanoid';
import { EventEmitter } from 'events';
import {
  HarnessInstance,
  SpawnConfig,
  HarnessId,
  HarnessStatus
} from './types.js';
import { logger } from '../utils/logger.js';


/**
 * Redacts sensitive values in `docker exec -e KEY=VALUE` argument lists.
 */
export function redactCommandArgs(args: string[]): string[] {
  const redacted = [...args];
  const sensitiveKeys = ['api_key', 'token', 'secret'];

  for (let i = 0; i < redacted.length; i++) {
    // Check for -e KEY=VALUE pattern
    if (redacted[i] === '-e' && i + 1 < redacted.length) {
      const envVar = redacted[i + 1];
      const [key] = envVar.split('=');
      const keyLower = key.toLowerCase();

      if (sensitiveKeys.some(s => keyLower.includes(s))) {
        redacted[i + 1] = `${key}=REDACTED`;
      }
    }
  }
  return redacted;
}

export class HarnessSpawner extends EventEmitter {
  private static readonly TERMINAL_RETENTION_TTL_MS = 15 * 60 * 1000;
  private static readonly MAX_TERMINAL_INSTANCES = 200;

  private instances: Map<HarnessId, HarnessInstance> = new Map();
  private processes: Map<HarnessId, ChildProcess> = new Map();
  private timers: Map<HarnessId, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Spawns one harness process and tracks its runtime state.
   */
  public async spawn(config: SpawnConfig): Promise<HarnessInstance> {
    this.pruneTerminalInstances();

    const id = `hrn_${nanoid(8)}` as HarnessId;

    // Create instance record
    const instance: HarnessInstance = {
      id,
      status: 'starting',
      startTime: Date.now(),
      stdout: [],
      stderr: [],
      config
    };

    this.instances.set(id, instance);

    // Spawn process
    try {
      // If a container is specified, wrap the command with `docker exec`
      // This is the dual-container bridge→kennel execution path
      let spawnCommand = config.command;
      let spawnArgs = config.args;
      let spawnCwd: string | undefined = config.cwd;
      let spawnEnv = { ...process.env, ...config.env };

      if (config.container) {
        // Build docker exec command: docker exec -w <cwd> [-e K=V] <container> <command> <args>
        const dockerArgs = ['exec'];

        // Set working directory inside the container
        if (config.cwd) {
          dockerArgs.push('-w', config.cwd);
        }

        // Forward environment variables
        for (const [key, value] of Object.entries(config.env)) {
          dockerArgs.push('-e', `${key}=${value}`);
        }

        // Container name + original command + original args
        dockerArgs.push(config.container, config.command, ...config.args);

        spawnCommand = 'docker';
        spawnArgs = dockerArgs;
        spawnCwd = undefined; // cwd is inside the container, not on host
        spawnEnv = { ...process.env }; // only pass host env to docker CLI itself
      }

      logger.info(`Spawning harness ${id}: ${spawnCommand} ${redactCommandArgs(spawnArgs).join(' ')}`);

      const child = spawn(spawnCommand, spawnArgs, {
        cwd: spawnCwd,
        env: spawnEnv,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Attach error handler immediately — before the PID check — so the
      // async ENOENT event always has a listener even if we bail out early.
      child.on('error', (err) => {
        logger.error(`Harness ${id} error:`, err);
        instance.status = 'failed';
        this.emit('status', { id, status: 'failed', error: err.message });
      });

      if (!child.pid) {
        throw new Error('Failed to spawn process - no PID returned');
      }

      instance.pid = child.pid;
      instance.status = 'running';
      this.processes.set(id, child);

      // Setup streams
      this.setupStreams(id, child);

      // Setup timeout
      if (config.timeoutMs > 0) {
        const timer = setTimeout(() => this.timeout(id), config.timeoutMs);
        this.timers.set(id, timer);
      }

      return instance;
    } catch (error) {
      instance.status = 'failed';
      logger.error(`Failed to spawn harness ${id}:`, error);
      throw error;
    }
  }

  /**
   * Attaches stdout/stderr/close handlers for one spawned process.
   */
  private setupStreams(id: HarnessId, child: ChildProcess): void {
    const instance = this.instances.get(id);
    if (!instance) return;

    // Guard flag scoped to this execution — prevents stream handlers from
    // emitting events after the process has closed (#5 namespace isolation)
    let settled = false;

    child.stdout?.on('data', (data: Buffer) => {
      if (settled) return;
      const text = data.toString();
      instance.stdout.push(text);
      this.emit('output', { id, type: 'stdout', data: text });
    });

    child.stderr?.on('data', (data: Buffer) => {
      if (settled) return;
      const text = data.toString();
      instance.stderr.push(text);
      this.emit('output', { id, type: 'stderr', data: text });
    });

    child.on('close', (code) => {
      settled = true;

      // Clear timeout timer — this deletion is the synchronization point
      // for the timeout/close race (#6): whoever runs first deletes the
      // timer entry, and the other checks and skips.
      const timer = this.timers.get(id);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(id);
      }

      // Remove stream listeners
      child.stdout?.removeAllListeners('data');
      child.stderr?.removeAllListeners('data');

      // Preserve explicit killed terminal state set by kill()/timeout.
      const finalStatus = instance.status === 'killed'
        ? 'killed'
        : (code === 0 ? 'completed' : 'failed');
      instance.status = finalStatus;
      instance.endedAt = Date.now();
      this.processes.delete(id);

      this.emit('status', { id, status: finalStatus, code });
      logger.info(`Harness ${id} exited with code ${code}`);
      setImmediate(() => this.pruneTerminalInstances());
    });
  }

  /**
   * Writes input to process stdin when writable.
   */
  public sendInput(id: HarnessId, data: string): boolean {
    const child = this.processes.get(id);
    if (child?.stdin?.writable) {
      child.stdin.write(data);
      return true;
    }
    return false;
  }

  /**
   * Sends SIGTERM to one running harness instance.
   */
  public kill(id: HarnessId): boolean {
    const child = this.processes.get(id);
    if (child) {
      const killed = child.kill('SIGTERM');
      if (killed) {
        const instance = this.instances.get(id);
        if (instance) {
          instance.status = 'killed';
          this.emit('status', { id, status: 'killed' });
        }
      }
      return killed;
    }
    return false;
  }

  /**
   * Sends SIGTERM to all running harness instances.
   */
  public killAll(): void {
    for (const id of this.processes.keys()) {
      this.kill(id);
    }
  }

  /**
   * Stops all instances, clears timers, and removes listeners.
   */
  public shutdown(): void {
    this.killAll();
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.instances.clear();
    this.processes.clear();
    this.removeAllListeners();
  }

  /**
   * Handles timeout expiration for a tracked harness instance.
   */
  private timeout(id: HarnessId): void {
    // If the timer was already cleared by the close handler, skip — process already settled (#6)
    if (!this.timers.has(id)) return;
    this.timers.delete(id);

    const instance = this.instances.get(id);
    if (instance && (instance.status === 'running' || instance.status === 'waiting_input')) {
      logger.warn(`Harness ${id} timed out after ${instance.config.timeoutMs}ms`);
      this.kill(id);
    }
  }

  /**
   * Returns tracked instance state by id.
   */
  public getInstance(id: HarnessId): HarnessInstance | undefined {
    return this.instances.get(id);
  }

  /**
   * Lists instances currently running or waiting for input.
   */
  public listRunning(): HarnessInstance[] {
    return Array.from(this.instances.values())
      .filter(i => i.status === 'running' || i.status === 'waiting_input');
  }

  /**
   * Resolves when a harness instance reaches a terminal state.
   */
  public async waitFor(id: HarnessId): Promise<HarnessInstance> {
    const instance = this.instances.get(id);
    if (!instance) throw new Error(`Instance ${id} not found`);

    if (['completed', 'failed', 'killed'].includes(instance.status)) {
      return instance;
    }

    return new Promise((resolve) => {
      const handler = (event: { id: HarnessId, status: HarnessStatus }) => {
        if (event.id === id && ['completed', 'failed', 'killed'].includes(event.status)) {
          this.off('status', handler);
          resolve(this.instances.get(id)!); // Non-null because we checked at start and map persists
        }
      };
      this.on('status', handler);
    });
  }

  /**
   * Prunes old terminal instance records to keep memory bounded.
   */
  private pruneTerminalInstances(): void {
    const now = Date.now();
    const terminalEntries = Array.from(this.instances.entries())
      .filter(([, instance]) => ['completed', 'failed', 'killed'].includes(instance.status));

    for (const [id, instance] of terminalEntries) {
      const endedAt = instance.endedAt ?? instance.startTime;
      if (now - endedAt > HarnessSpawner.TERMINAL_RETENTION_TTL_MS) {
        this.instances.delete(id);
      }
    }

    const retainedTerminal = Array.from(this.instances.entries())
      .filter(([, instance]) => ['completed', 'failed', 'killed'].includes(instance.status))
      .sort((a, b) => (a[1].endedAt ?? a[1].startTime) - (b[1].endedAt ?? b[1].startTime));

    if (retainedTerminal.length <= HarnessSpawner.MAX_TERMINAL_INSTANCES) {
      return;
    }

    const overflow = retainedTerminal.length - HarnessSpawner.MAX_TERMINAL_INSTANCES;
    for (const [id] of retainedTerminal.slice(0, overflow)) {
      this.instances.delete(id);
    }
  }
}
