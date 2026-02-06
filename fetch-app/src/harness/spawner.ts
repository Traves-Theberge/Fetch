/**
 * @fileoverview Harness Spawner
 *
 * Manages the lifecycle of individual harness processes.
 * Responsible for spawning, monitoring, and killing processes.
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

export class HarnessSpawner extends EventEmitter {
  private instances: Map<HarnessId, HarnessInstance> = new Map();
  private processes: Map<HarnessId, ChildProcess> = new Map();

  /**
   * Spawn a new harness process
   */
  public async spawn(config: SpawnConfig): Promise<HarnessInstance> {
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
      logger.info(`Spawning harness ${id}: ${config.command} ${config.args.join(' ')}`);
      
      const child = spawn(config.command, config.args, {
        cwd: config.cwd,
        env: { ...process.env, ...config.env },
        stdio: ['pipe', 'pipe', 'pipe']
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
        setTimeout(() => this.timeout(id), config.timeoutMs);
      }

      return instance;
    } catch (error) {
      instance.status = 'failed';
      logger.error(`Failed to spawn harness ${id}:`, error);
      throw error;
    }
  }

  /**
   * Setup stdout/stderr listeners
   */
  private setupStreams(id: HarnessId, child: ChildProcess): void {
    const instance = this.instances.get(id);
    if (!instance) return;

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      instance.stdout.push(text);
      this.emit('output', { id, type: 'stdout', data: text });
      
      // Basic question detection (naive)
      if (text.includes('?')) {
        instance.status = 'waiting_input';
        this.emit('status', { id, status: 'waiting_input' });
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      instance.stderr.push(text);
      this.emit('output', { id, type: 'stderr', data: text });
    });

    child.on('close', (code) => {
      const finalStatus = code === 0 ? 'completed' : 'failed';
      instance.status = finalStatus;
      this.instances.set(id, { ...instance, status: finalStatus }); // trigger update if needed
      this.processes.delete(id);
      
      this.emit('status', { id, status: finalStatus, code });
      logger.info(`Harness ${id} exited with code ${code}`);
    });

    child.on('error', (err) => {
      logger.error(`Harness ${id} error:`, err);
      instance.status = 'failed';
      this.emit('status', { id, status: 'failed', error: err.message });
    });
  }

  /**
   * Send input to a running harness process stdin
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
   * Kill a specific instance
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
   * Handle timeout
   */
  private timeout(id: HarnessId): void {
    const instance = this.instances.get(id);
    if (instance && (instance.status === 'running' || instance.status === 'waiting_input')) {
      logger.warn(`Harness ${id} timed out after ${instance.config.timeoutMs}ms`);
      this.kill(id);
    }
  }

  /**
   * Get instance details
   */
  public getInstance(id: HarnessId): HarnessInstance | undefined {
    return this.instances.get(id);
  }

  /**
   * List all running instances
   */
  public listRunning(): HarnessInstance[] {
    return Array.from(this.instances.values())
      .filter(i => i.status === 'running' || i.status === 'waiting_input');
  }

  /**
   * Wait for an instance to complete
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
}
