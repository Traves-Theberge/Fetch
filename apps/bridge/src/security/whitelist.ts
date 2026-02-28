/**
 * @fileoverview Persistent trusted-number store used by security gate checks.
 *
 * Sources:
 * - `TRUSTED_PHONE_NUMBERS` env var
 * - `data/whitelist.json` for runtime persisted entries
 *
 * @module security/whitelist
 */

import { promises as fs } from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { DATA_DIR } from '../config/paths.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const WHITELIST_FILE = path.join(DATA_DIR, 'whitelist.json');

// =============================================================================
// TYPES
// =============================================================================

interface WhitelistData {
  /** Trusted phone numbers (normalized, digits only) */
  trustedNumbers: string[];
  /** Last updated timestamp */
  updatedAt: string;
  /** Version for future migrations */
  version: number;
}

// =============================================================================
// WHITELIST STORE CLASS
// =============================================================================

/**
 * In-memory + persisted store of trusted phone numbers.
 */
export class WhitelistStore {
  /** In-memory set of trusted numbers */
  private trustedNumbers: Set<string> = new Set();

  /** Initialization flag */
  private initialized = false;

  /** Serialize concurrent persist calls */
  private persistLock: Promise<void> = Promise.resolve();

  /** File watcher for hot-reload */
  private watcher: ReturnType<typeof chokidar.watch> | null = null;

  /** Suppress reload during our own persist writes */
  private suppressReload = false;

  /**
   * Initializes store by loading env/file data and starting file watcher.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.section('🔐 Whitelist Store Initializing');

    // Load from environment variable first
    this.loadFromEnv();

    // Then load from persistent file (adds to existing)
    await this.loadFromFile();

    // Watch for external changes (e.g. TUI adding numbers)
    this.setupWatcher();

    this.initialized = true;
    logger.info(`Loaded ${this.trustedNumbers.size} trusted number(s)`);
    logger.divider();
  }

  /**
   * Loads trusted numbers from `TRUSTED_PHONE_NUMBERS`.
   */
  private loadFromEnv(): void {
    const envNumbers = env.TRUSTED_PHONE_NUMBERS;
    
    if (!envNumbers || envNumbers.trim() === '') {
      logger.debug('No TRUSTED_PHONE_NUMBERS in environment');
      return;
    }

    const numbers = envNumbers.split(',')
      .map(n => this.normalizeNumber(n))
      .filter(n => n.length > 0);

    for (const num of numbers) {
      this.trustedNumbers.add(num);
    }

    logger.info(`Loaded ${numbers.length} number(s) from environment`);
  }

  /**
   * Loads trusted numbers from persistent JSON file.
   */
  private async loadFromFile(): Promise<void> {
    try {
      const content = await fs.readFile(WHITELIST_FILE, 'utf-8');
      const data: WhitelistData = JSON.parse(content);

      if (data.trustedNumbers && Array.isArray(data.trustedNumbers)) {
        for (const num of data.trustedNumbers) {
          const normalized = this.normalizeNumber(num);
          if (normalized.length > 0) {
            this.trustedNumbers.add(normalized);
          }
        }
        logger.info(`Loaded ${data.trustedNumbers.length} number(s) from file`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.debug('No whitelist file found (will create on first add)');
      } else {
        logger.warn('Failed to load whitelist file', error);
      }
    }
  }

  /**
   * Watches whitelist file and reloads in-memory data on external updates.
   */
  private setupWatcher(): void {
    try {
      this.watcher = chokidar.watch(WHITELIST_FILE, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      });

      this.watcher.on('change', async () => {
        if (this.suppressReload) return;

        logger.info('Whitelist file changed externally, reloading...');

        // Preserve env-sourced numbers, reload file-sourced numbers
        this.trustedNumbers.clear();
        this.loadFromEnv();
        await this.loadFromFile();

        logger.success(`Whitelist reloaded: ${this.trustedNumbers.size} trusted number(s)`);
      });

      this.watcher.on('add', async () => {
        if (this.suppressReload) return;

        logger.info('Whitelist file created, loading...');
        await this.loadFromFile();
        logger.success(`Whitelist loaded: ${this.trustedNumbers.size} trusted number(s)`);
      });
    } catch (error) {
      logger.warn('Failed to watch whitelist file (changes will require restart)', error);
    }
  }

  /**
   * Persists current whitelist state to disk.
   * Writes are serialized via `persistLock`.
   */
  private async persist(): Promise<void> {
    this.persistLock = this.persistLock
      .catch(() => {
        // Recover chain after previous write failure so future writes still run.
      })
      .then(() => this.doPersist());
    return this.persistLock;
  }

  /**
   * Internal write implementation for serialized persistence.
   */
  private async doPersist(): Promise<void> {
    try {
      // Suppress watcher reload for our own writes
      this.suppressReload = true;

      // Ensure data directory exists
      await fs.mkdir(DATA_DIR, { recursive: true });

      const data: WhitelistData = {
        trustedNumbers: Array.from(this.trustedNumbers),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      await fs.writeFile(WHITELIST_FILE, JSON.stringify(data, null, 2), 'utf-8');
      logger.debug('Whitelist persisted to file');

      // Re-enable watcher after a short delay to let chokidar settle
      setTimeout(() => { this.suppressReload = false; }, 500);
    } catch (error) {
      this.suppressReload = false;
      logger.error('Failed to persist whitelist', error);
      throw error;
    }
  }

  /**
   * Normalizes phone number input to digits only.
   * 
   * @param phoneNumber - Raw phone number input
   * @returns Normalized digits-only string
   */
  normalizeNumber(phoneNumber: string): string {
    return phoneNumber.replace(/\D/g, '');
  }

  /**
   * Adds a phone number to trusted list and persists change.
   * 
   * @param phoneNumber - Phone number to add
   * @returns true if added, false if already existed
   */
  async add(phoneNumber: string): Promise<boolean> {
    const normalized = this.normalizeNumber(phoneNumber);
    
    if (normalized.length < 10) {
      logger.warn(`Invalid phone number (too short): ${phoneNumber}`);
      return false;
    }

    if (this.trustedNumbers.has(normalized)) {
      logger.debug(`Number already in whitelist: ${normalized}`);
      return false;
    }

    this.trustedNumbers.add(normalized);
    await this.persist();
    
    logger.success(`Added to whitelist: +${normalized}`);
    return true;
  }

  /**
   * Removes a phone number from trusted list and persists change.
   * 
   * @param phoneNumber - Phone number to remove
   * @returns true if removed, false if not found
   */
  async remove(phoneNumber: string): Promise<boolean> {
    const normalized = this.normalizeNumber(phoneNumber);

    if (!this.trustedNumbers.has(normalized)) {
      logger.debug(`Number not in whitelist: ${normalized}`);
      return false;
    }

    this.trustedNumbers.delete(normalized);
    await this.persist();
    
    logger.success(`Removed from whitelist: +${normalized}`);
    return true;
  }

  /**
   * Returns true when a phone number is trusted.
   * 
   * @param phoneNumber - Phone number to check
   * @returns true if trusted
   */
  has(phoneNumber: string): boolean {
    const normalized = this.normalizeNumber(phoneNumber);
    return this.trustedNumbers.has(normalized);
  }

  /**
   * Returns sorted trusted numbers.
   * 
   * @returns Array of trusted phone numbers (normalized)
   */
  list(): string[] {
    return Array.from(this.trustedNumbers).sort();
  }

  /**
   * Returns trusted-number count.
   */
  count(): number {
    return this.trustedNumbers.size;
  }

  /**
   * Clears trusted numbers and persists change.
   */
  async clear(): Promise<void> {
    this.trustedNumbers.clear();
    await this.persist();
    logger.warn('Whitelist cleared');
  }

  /**
   * Closes watcher and waits for pending writes to settle.
   */
  async shutdown(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    await this.persistLock.catch(() => undefined);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let whitelistStore: WhitelistStore | null = null;
let whitelistInitPromise: Promise<WhitelistStore> | null = null;

/**
 * Returns whitelist singleton, initializing on first access.
 */
export async function getWhitelistStore(): Promise<WhitelistStore> {
  if (whitelistStore) return whitelistStore;
  if (whitelistInitPromise) return whitelistInitPromise;

  whitelistInitPromise = (async () => {
    const instance = new WhitelistStore();
    await instance.initialize();
    whitelistStore = instance;
    return instance;
  })().catch((error) => {
    whitelistInitPromise = null;
    throw error;
  });

  return whitelistInitPromise;
}

/**
 * Returns whitelist singleton without initialization side effects.
 */
export function getWhitelistStoreSync(): WhitelistStore | null {
  return whitelistStore;
}
