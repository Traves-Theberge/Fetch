/**
 * Instinct Registry - Routes messages through instinct handlers
 * 
 * The registry maintains a sorted list of instincts by priority and
 * checks each one against incoming messages. The first match wins.
 */

import type { 
  Instinct, 
  InstinctContext, 
  InstinctCheckResult,
  InstinctRegistryConfig 
} from './types.js';
import { DEFAULT_INSTINCT_CONFIG } from './types.js';
import { helpInstinct } from './help.js';
import { statusInstinct } from './status.js';
import { commandsInstinct } from './commands.js';
import { skillsInstinct } from './skills.js';
import { toolsInstinct } from './tools.js';
import { schedulingInstinct } from './scheduling.js';
import { stopInstinct, undoInstinct, clearInstinct } from './safety.js';
import { whoamiInstinct } from './whoami.js';
import { identityInstinct } from './identity.js';
import { threadInstinct } from './thread.js';
import { logger } from '../utils/logger.js';

/**
 * Registry that manages and routes instincts
 */
class InstinctRegistry {
  private instincts: Instinct[] = [];
  private config: InstinctRegistryConfig;

  constructor(config: Partial<InstinctRegistryConfig> = {}) {
    this.config = { ...DEFAULT_INSTINCT_CONFIG, ...config };
    this.registerBuiltins();
  }

  /**
   * Register all built-in instincts
   */
  private registerBuiltins(): void {
    // Safety instincts (highest priority)
    this.register(stopInstinct);
    this.register(undoInstinct);
    this.register(clearInstinct);

    // Info instincts
    this.register(helpInstinct);
    this.register(statusInstinct);
    this.register(commandsInstinct);

    // Meta instincts
    this.register(whoamiInstinct);
    this.register(identityInstinct);
    this.register(threadInstinct);
    this.register(skillsInstinct);
    this.register(toolsInstinct);
    this.register(schedulingInstinct);

    // Sort by priority (highest first)
    this.sortByPriority();
  }

  /**
   * Register a new instinct
   */
  register(instinct: Instinct): void {
    // Check for duplicate names
    const existing = this.instincts.find(i => i.name === instinct.name);
    if (existing) {
      logger.warn(`Instinct '${instinct.name}' already registered, replacing`);
      this.instincts = this.instincts.filter(i => i.name !== instinct.name);
    }

    this.instincts.push(instinct);
    this.sortByPriority();

    if (this.config.debug) {
      logger.debug(`Registered instinct: ${instinct.name} (priority: ${instinct.priority})`);
    }
  }

  /**
   * Unregister an instinct by name
   */
  unregister(name: string): boolean {
    const before = this.instincts.length;
    this.instincts = this.instincts.filter(i => i.name !== name);
    return this.instincts.length < before;
  }

  /**
   * Sort instincts by priority (highest first)
   */
  private sortByPriority(): void {
    this.instincts.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Normalize a message for matching
   */
  private normalizeMessage(message: string): string {
    return message.toLowerCase().trim();
  }

  /**
   * Check if a message matches an instinct's triggers or patterns
   */
  private matchInstinct(instinct: Instinct, normalized: string): { matched: boolean; trigger?: string; pattern?: string } {
    // Check exact triggers first
    for (const trigger of instinct.triggers) {
      if (normalized === trigger.toLowerCase()) {
        return { matched: true, trigger };
      }
    }

    // Check patterns
    if (instinct.patterns) {
      for (const pattern of instinct.patterns) {
        if (pattern.test(normalized)) {
          return { matched: true, pattern: pattern.source };
        }
      }
    }

    return { matched: false };
  }

  /**
   * Check all instincts against a message
   * Returns the first match (highest priority wins)
   */
  async check(ctx: InstinctContext): Promise<InstinctCheckResult> {
    const startTime = Date.now();

    if (!this.config.enabled) {
      return {
        matched: false,
        durationMs: Date.now() - startTime,
      };
    }

    const normalized = this.normalizeMessage(ctx.message);

    for (const instinct of this.instincts) {
      if (!instinct.enabled) continue;

      const match = this.matchInstinct(instinct, normalized);
      
      if (match.matched) {
        if (this.config.debug) {
          logger.debug(`Instinct matched: ${instinct.name}`, { 
            trigger: match.trigger, 
            pattern: match.pattern 
          });
        }

        try {
          const response = await instinct.handler(ctx);
          
          // Add metadata if matched
          if (response.matched) {
            response.metadata = {
              instinctName: instinct.name,
              matchedTrigger: match.trigger,
              matchedPattern: match.pattern,
            };
          }

          return {
            matched: response.matched,
            instinct: instinct,
            response,
            durationMs: Date.now() - startTime,
          };
        } catch (error) {
          logger.error(`Instinct handler error: ${instinct.name}`, error);
          // Continue to next instinct on error
        }
      }
    }

    return {
      matched: false,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Get all registered instincts
   */
  list(): Instinct[] {
    return [...this.instincts];
  }

  /**
   * Get instinct by name
   */
  get(name: string): Instinct | undefined {
    return this.instincts.find(i => i.name === name);
  }

  /**
   * Enable/disable an instinct
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const instinct = this.get(name);
    if (instinct) {
      instinct.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Update registry config
   */
  configure(config: Partial<InstinctRegistryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton instance
let registryInstance: InstinctRegistry | null = null;

/**
 * Get the instinct registry singleton
 */
export function getInstinctRegistry(): InstinctRegistry {
  if (!registryInstance) {
    registryInstance = new InstinctRegistry();
  }
  return registryInstance;
}

/**
 * Check instincts for a message (convenience function)
 */
export async function checkInstincts(ctx: InstinctContext): Promise<InstinctCheckResult> {
  return getInstinctRegistry().check(ctx);
}

// Export types
export * from './types.js';
