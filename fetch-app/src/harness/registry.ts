/**
 * @fileoverview Harness Registry
 *
 * Central registry for managing harness adapters.
 * Provides access to Claude, Gemini, Copilot, and OpenCode adapters.
 *
 * @module harness/registry
 * @see {@link HarnessAdapter} - Adapter interface
 * @see {@link ClaudeAdapter} - Claude Code adapter
 * @see {@link GeminiAdapter} - Gemini CLI adapter
 * @see {@link CopilotAdapter} - GitHub Copilot CLI adapter
 * @see {@link OpenCodeAdapter} - OpenCode CLI adapter
 */

import type { AgentType } from '../task/types.js';
import type { HarnessAdapter } from './types.js';
import { claudeAdapter, ClaudeAdapter } from './claude.js';
import { geminiAdapter, GeminiAdapter } from './gemini.js';
import { copilotAdapter, CopilotAdapter } from './copilot.js';
import { opencodeAdapter, OpenCodeAdapter } from './opencode.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Registry Map
// ============================================================================

/**
 * Map of agent types to their adapters
 */
const adapters = new Map<AgentType, HarnessAdapter>();
adapters.set('claude', claudeAdapter);
adapters.set('gemini', geminiAdapter);
adapters.set('copilot', copilotAdapter);
adapters.set('opencode', opencodeAdapter);

// ============================================================================
// Registry Functions
// ============================================================================

/**
 * Get adapter for a specific agent type
 *
 * @param agent - Agent type
 * @returns Harness adapter
 * @throws Error if no adapter found for agent type
 *
 * @example
 * ```typescript
 * const adapter = getAdapter('claude');
 * const config = adapter.buildConfig('Add dark mode', '/workspace/project', 300000);
 * ```
 */
export function getAdapter(agent: AgentType): HarnessAdapter {
  const adapter = adapters.get(agent);
  if (!adapter) {
    throw new Error(`No harness adapter found for agent: ${agent}`);
  }
  return adapter;
}

/**
 * Check if an adapter exists for an agent type
 *
 * @param agent - Agent type to check
 * @returns True if adapter exists
 */
export function hasAdapter(agent: AgentType): boolean {
  return adapters.has(agent);
}

/**
 * List all available agent types
 *
 * @returns Array of available agent types
 */
export function listAgents(): AgentType[] {
  return Array.from(adapters.keys());
}

/**
 * Get all adapters
 *
 * @returns Array of all harness adapters
 */
export function getAllAdapters(): HarnessAdapter[] {
  return Array.from(adapters.values());
}

/**
 * Register a custom adapter
 *
 * Allows registering additional adapters at runtime.
 *
 * @param adapter - Harness adapter to register
 */
export function registerAdapter(adapter: HarnessAdapter): void {
  if (adapters.has(adapter.agent)) {
    logger.warn(`Overwriting existing adapter for: ${adapter.agent}`);
  }
  adapters.set(adapter.agent, adapter);
  logger.debug(`Registered harness adapter: ${adapter.agent}`);
}

/**
 * Get default agent type
 *
 * Returns 'claude' as the default, as it's the most capable
 * for direct code modification tasks.
 *
 * @returns Default agent type
 */
export function getDefaultAgent(): AgentType {
  return 'claude';
}

// ============================================================================
// Re-exports
// ============================================================================

export {
  ClaudeAdapter,
  GeminiAdapter,
  CopilotAdapter,
  OpenCodeAdapter,
  claudeAdapter,
  geminiAdapter,
  copilotAdapter,
  opencodeAdapter,
};
