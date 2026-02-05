/**
 * @fileoverview Proactive System Module
 * 
 * Exports components for proactive behavior:
 * - PollingService: Interval-based checks (pull)
 * - CronService: Schedule-based tasks (time)
 * - FileWatcher: Event-based triggers (push)
 */

export * from './types.js';
export * from './polling.js';
export * from './watcher.js';

import { getPollingService } from './polling.js';
import { createWatcher } from './watcher.js';
import { loadPollingConfig } from './loader.js';
import { logger } from '../utils/logger.js';

export class ProactiveSystem {
  private static instance: ProactiveSystem | undefined;
  
  public polling = getPollingService();
  public watcher = createWatcher({ type: 'file', path: '.' }); // Default config

  public static getInstance(): ProactiveSystem {
    if (!ProactiveSystem.instance) {
      ProactiveSystem.instance = new ProactiveSystem();
    }
    return ProactiveSystem.instance as ProactiveSystem;
  }

  public async start(): Promise<void> {
    logger.info('Starting proactive systems...');
    
    // Load configurations
    await loadPollingConfig();

    await this.polling.start();
    await this.watcher.start();
    logger.success('Proactive systems active');
  }

  public async stop(): Promise<void> {
    logger.info('Stopping proactive systems...');
    this.polling.stop();
    await this.watcher.stop();
  }
}

export const getProactiveSystem = () => ProactiveSystem.getInstance();
