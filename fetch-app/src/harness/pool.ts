/**
 * @fileoverview Harness Pool
 *
 * Manages concurrent harness executions with queueing and limits.
 */

import { EventEmitter } from 'events';
import { HarnessSpawner } from './spawner.js';
import { 
  SpawnConfig, 
  HarnessInstance, 
  PoolConfig,
  HarnessId,
  DEFAULT_HARNESS_TIMEOUT_MS 
} from './types.js';
import { logger } from '../utils/logger.js';

interface QueueItem {
  config: SpawnConfig;
  resolve: (value: HarnessInstance) => void;
  reject: (reason?: unknown) => void;
}

export class HarnessPool extends EventEmitter {
  private static instance: HarnessPool | undefined;
  private spawner: HarnessSpawner;
  private config: PoolConfig;
  private queue: QueueItem[] = [];
  
  private constructor(config: Partial<PoolConfig> = {}) {
    super();
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 2, // Default to 2 parallel agents
      defaultTimeoutMs: config.defaultTimeoutMs ?? DEFAULT_HARNESS_TIMEOUT_MS
    };
    
    this.spawner = new HarnessSpawner();
    this.setupSpawnerListeners();
  }

  public static getInstance(): HarnessPool {
    if (!HarnessPool.instance) {
      HarnessPool.instance = new HarnessPool();
    }
    return HarnessPool.instance as HarnessPool;
  }

  private setupSpawnerListeners(): void {
    // Forward events
    this.spawner.on('status', (event) => {
      this.emit('status', event);
      
      // If a slot opened up, process queue
      if (['completed', 'failed', 'killed'].includes(event.status)) {
        this.processQueue();
      }
    });

    this.spawner.on('output', (event) => this.emit('output', event));
  }

  /**
   * Acquire a harness instance (spawns or queues)
   */
  public async acquire(spawnConfig: Omit<SpawnConfig, 'timeoutMs'> & { timeoutMs?: number }): Promise<HarnessInstance> {
    const config: SpawnConfig = {
      ...spawnConfig,
      timeoutMs: spawnConfig.timeoutMs ?? this.config.defaultTimeoutMs
    };

    // Check concurrency
    const running = this.spawner.listRunning().length;
    
    if (running >= this.config.maxConcurrent) {
      logger.info(`Pool full (${running}/${this.config.maxConcurrent}), queuing request...`);
      return new Promise((resolve, reject) => {
        this.queue.push({ config, resolve, reject });
      });
    }

    return this.spawner.spawn(config);
  }

  /**
   * Process the next item in the queue
   */
  private async processQueue(): Promise<void> {
    const running = this.spawner.listRunning().length;
    
    if (running < this.config.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        logger.info('Processing queued harness request...');
        try {
          const instance = await this.spawner.spawn(item.config);
          item.resolve(instance);
        } catch (error) {
          item.reject(error);
          this.processQueue(); // Try next if this one failed synchronously
        }
      }
    }
  }

  /**
   * Get pool statistics
   */
  public getStats() {
    return {
      running: this.spawner.listRunning().length,
      queued: this.queue.length,
      maxConcurrent: this.config.maxConcurrent
    };
  }

  /**
   * Set concurrency limit
   */
  public setMaxConcurrent(max: number): void {
    this.config.maxConcurrent = max;
    this.processQueue(); // We might have opened slots
  }

  // Delegate methods
  public kill(id: HarnessId) { return this.spawner.kill(id); }
  public waitFor(id: HarnessId) { return this.spawner.waitFor(id); }
  public getSpawner() { return this.spawner; }
}

export const getHarnessPool = () => HarnessPool.getInstance();
