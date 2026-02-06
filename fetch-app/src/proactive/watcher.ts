/**
 * @fileoverview Default Watcher Implementation
 * 
 * Provides concrete implementations for File and Git watching.
 * Emits typed events via an EventEmitter so consumers (skills,
 * proactive system) can react to file or repository changes.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import chokidar, { FSWatcher } from 'chokidar';

const execAsync = promisify(exec);

export type WatcherType = 'file' | 'git' | 'external';

export interface WatcherConfig {
  type: WatcherType;
  path: string; // File path or URL
  intervalMs?: number; // For polling-based watchers (git/external)
  recursive?: boolean; // For file watching
}

/** Events emitted by the WatcherService */
export interface WatcherEvents {
  'file:add': { path: string };
  'file:change': { path: string };
  'file:remove': { path: string };
  'git:behind': { repoPath: string; message: string };
}

export class WatcherService extends EventEmitter {
  private static instance: WatcherService | undefined;
  private watchers: Map<string, NodeJS.Timeout | FSWatcher> = new Map();
  private active: boolean = false;

  public static getInstance(): WatcherService {
    if (!WatcherService.instance) {
      WatcherService.instance = new WatcherService();
    }
    return WatcherService.instance;
  }

  public async start(): Promise<void> {
    this.active = true;
    logger.info('Watcher service started');
  }

  public async stop(): Promise<void> {
    this.active = false;
    this.watchers.forEach((watcher) => {
      if (typeof watcher === 'object' && 'close' in watcher) {
        (watcher as FSWatcher).close();
      } else {
        clearTimeout(watcher as NodeJS.Timeout);
      }
    });
    this.watchers.clear();
    logger.info('Watcher service stopped');
  }

  /**
   * Watch a git repository for changes
   */
  public watchGit(repoPath: string, intervalMs: number = 60000): void {
    const id = `git:${repoPath}`;
    if (this.watchers.has(id)) return;

    logger.info(`Started watching git repo: ${repoPath}`);
    
    const check = async () => {
      if (!this.active) return;
      try {
        const { stdout } = await execAsync('git fetch && git status -uno', { cwd: repoPath });
        if (stdout.includes('Your branch is behind')) {
          logger.info(`Git watcher: Updates available for ${repoPath}`);
          this.emit('git:behind', { repoPath, message: stdout.trim() });
        }
      } catch (err) {
        logger.error(`Git watcher failed for ${repoPath}:`, err);
      }
      
      const timer = setTimeout(check, intervalMs);
      this.watchers.set(id, timer);
    };

    check();
  }

  /**
   * Watch local files using chokidar
   */
  public watchFiles(fullPath: string, options: { recursive?: boolean; debounce?: number } = {}): void {
    const id = `file:${fullPath}`;
    if (this.watchers.has(id)) return;

    logger.info(`Started watching files: ${fullPath}`);

    const watcher = chokidar.watch(fullPath, {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
      depth: options.recursive ? undefined : 0,
      ignoreInitial: true,
    });

    watcher
      .on('add', (p) => {
        logger.info(`File added: ${p}`);
        this.emit('file:add', { path: p });
      })
      .on('change', (p) => {
        logger.info(`File changed: ${p}`);
        this.emit('file:change', { path: p });
      })
      .on('unlink', (p) => {
        logger.info(`File removed: ${p}`);
        this.emit('file:remove', { path: p });
      })
      .on('error', (error) => logger.error(`Watcher error: ${error}`));

    this.watchers.set(id, watcher);
  }

  public stopWatching(id: string): void {
    const watcher = this.watchers.get(id);
    if (!watcher) return;

    if ('close' in watcher) {
       (watcher as FSWatcher).close();
    } else {
       clearTimeout(watcher as NodeJS.Timeout);
    }
    
    this.watchers.delete(id);
    logger.info(`Stopped watcher: ${id}`);
  }
}

export const createWatcher = (_config: WatcherConfig) => WatcherService.getInstance();
export const getWatcherService = () => WatcherService.getInstance();
