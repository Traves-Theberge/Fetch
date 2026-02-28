/**
 * @fileoverview In-memory registry for harness adapters.
 *
 * @module harness/registry
 */

import type { AgentType } from '../task/types.js';
import type { HarnessAdapter } from './types.js';
import { claudeAdapter, ClaudeAdapter } from './claude.js';
import { geminiAdapter, GeminiAdapter } from './gemini.js';
import { copilotAdapter, CopilotAdapter } from './copilot.js';
import { opencodeAdapter, OpenCodeAdapter } from './opencode.js';
import { codexAdapter, CodexAdapter } from './codex.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Registry Map
// ============================================================================

/**
 * Map of agent type to adapter instance.
 */
const adapters = new Map<AgentType, HarnessAdapter>();
adapters.set('claude', claudeAdapter);
adapters.set('gemini', geminiAdapter);
adapters.set('copilot', copilotAdapter);
adapters.set('opencode', opencodeAdapter);
adapters.set('codex', codexAdapter);

// ============================================================================
// Registry Functions
// ============================================================================

/**
 * Returns adapter for the requested agent.
 *
 * @param agent - Agent type
 * @returns Harness adapter
 * @throws Error when agent is not registered
 */
export function getAdapter(agent: AgentType): HarnessAdapter {
  const adapter = adapters.get(agent);
  if (!adapter) {
    throw new Error(`No harness adapter found for agent: ${agent}`);
  }
  return adapter;
}

/**
 * Returns true when an adapter is registered for the agent.
 *
 * @param agent - Agent type to check
 * @returns True if adapter exists
 */
export function hasAdapter(agent: AgentType): boolean {
  return adapters.has(agent);
}

/**
 * Lists registered agent types.
 *
 * @returns Array of available agent types
 */
export function listAgents(): AgentType[] {
  return Array.from(adapters.keys());
}

/**
 * Lists all registered adapters.
 *
 * @returns Array of all harness adapters
 */
export function getAllAdapters(): HarnessAdapter[] {
  return Array.from(adapters.values());
}

/**
 * Registers or replaces an adapter at runtime.
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
 * Returns the default agent used when no explicit selection is made.
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
  CodexAdapter,
  claudeAdapter,
  geminiAdapter,
  copilotAdapter,
  opencodeAdapter,
  codexAdapter,
};
