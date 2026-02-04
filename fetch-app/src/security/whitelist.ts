/**
 * @fileoverview Whitelist Store - Zero Trust Bonding
 * 
 * Manages the list of trusted phone numbers that can interact with Fetch.
 * The owner is always exempt from whitelist checks (handled in SecurityGate).
 * 
 * @module security/whitelist
 * @see {@link WhitelistStore} - Main whitelist class
 * 
 * ## Data Sources
 * 
 * 1. Environment: TRUSTED_PHONE_NUMBERS (comma-separated, loaded at startup)
 * 2. File: data/whitelist.json (runtime additions, persisted)
 * 
 * ## Security Model
 * 
 * "Fetch is loyal to his owner and people his owner explicitly trusts."
 * - Owner is ALWAYS allowed (not stored here, checked in SecurityGate)
 * - Only explicitly whitelisted numbers can use @fetch
 * - Silent drops for unauthorized (no information leakage)
 * 
 * @example
 * ```typescript
 * const whitelist = await getWhitelistStore();
 * 
 * // Check if number is trusted
 * if (whitelist.has('15551234567')) {
 *   // Allow access
 * }
 * 
 * // Owner adds trusted number
 * whitelist.add('15559876543');
 * 
 * // Owner removes trusted number
 * whitelist.remove('15559876543');
 * ```
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const WHITELIST_FILE = join(DATA_DIR, 'whitelist.json');

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
 * Manages trusted phone numbers for Zero Trust Bonding.
 * 
 * Phone numbers are normalized (digits only) for consistent matching.
 * Data persists across restarts via JSON file.
 * 
 * @class
 */
export class WhitelistStore {
  /** In-memory set of trusted numbers */
  private trustedNumbers: Set<string> = new Set();
  
  /** Initialization flag */
  private initialized = false;

  /**
   * Initialize the whitelist store.
   * Loads from environment and file.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.section('🔐 Whitelist Store Initializing');

    // Load from environment variable first
    await this.loadFromEnv();

    // Then load from persistent file (adds to existing)
    await this.loadFromFile();

    this.initialized = true;
    logger.info(`Loaded ${this.trustedNumbers.size} trusted number(s)`);
    logger.divider();
  }

  /**
   * Load trusted numbers from TRUSTED_PHONE_NUMBERS environment variable.
   * Format: comma-separated phone numbers (e.g., "15551234567,15559876543")
   */
  private async loadFromEnv(): Promise<void> {
    const envNumbers = process.env.TRUSTED_PHONE_NUMBERS;
    
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
   * Load trusted numbers from persistent JSON file.
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
   * Persist current whitelist to JSON file.
   */
  private async persist(): Promise<void> {
    try {
      // Ensure data directory exists
      await fs.mkdir(DATA_DIR, { recursive: true });

      const data: WhitelistData = {
        trustedNumbers: Array.from(this.trustedNumbers),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      await fs.writeFile(WHITELIST_FILE, JSON.stringify(data, null, 2), 'utf-8');
      logger.debug('Whitelist persisted to file');
    } catch (error) {
      logger.error('Failed to persist whitelist', error);
      throw error;
    }
  }

  /**
   * Normalize a phone number (remove all non-digit characters).
   * 
   * @param phoneNumber - Raw phone number input
   * @returns Normalized digits-only string
   */
  normalizeNumber(phoneNumber: string): string {
    return phoneNumber.replace(/\D/g, '');
  }

  /**
   * Add a phone number to the whitelist.
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
   * Remove a phone number from the whitelist.
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
   * Check if a phone number is in the whitelist.
   * 
   * @param phoneNumber - Phone number to check
   * @returns true if trusted
   */
  has(phoneNumber: string): boolean {
    const normalized = this.normalizeNumber(phoneNumber);
    return this.trustedNumbers.has(normalized);
  }

  /**
   * Get all trusted numbers.
   * 
   * @returns Array of trusted phone numbers (normalized)
   */
  list(): string[] {
    return Array.from(this.trustedNumbers).sort();
  }

  /**
   * Get count of trusted numbers.
   */
  count(): number {
    return this.trustedNumbers.size;
  }

  /**
   * Clear all trusted numbers (use with caution!).
   * Owner is unaffected as they're checked separately.
   */
  async clear(): Promise<void> {
    this.trustedNumbers.clear();
    await this.persist();
    logger.warn('Whitelist cleared');
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let whitelistStore: WhitelistStore | null = null;

/**
 * Get the singleton whitelist store instance.
 * Initializes on first call.
 */
export async function getWhitelistStore(): Promise<WhitelistStore> {
  if (!whitelistStore) {
    whitelistStore = new WhitelistStore();
    await whitelistStore.initialize();
  }
  return whitelistStore;
}

/**
 * Get the whitelist store without initialization check.
 * Only use after initialization is guaranteed.
 */
export function getWhitelistStoreSync(): WhitelistStore | null {
  return whitelistStore;
}
