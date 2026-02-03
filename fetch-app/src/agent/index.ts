/**
 * @fileoverview Agent Module Barrel Exports
 * 
 * Re-exports all public APIs from the agent module for convenient importing.
 * 
 * @module agent
 * @see {@link module:agent/core} For the main orchestrator
 * @see {@link module:agent/format} For message formatting utilities
 * @see {@link module:agent/intent} For intent classification
 * 
 * @example
 * ```typescript
 * import { processMessage, classifyIntent } from './agent/index.js';
 * ```
 */

// Core exports
export { processMessage, frameTaskGoal, classifyIntent } from './core.js';
export type { AgentResponse, ToolCallRecord } from './core.js';
export type { IntentType, ClassifiedIntent } from './intent.js';
export {
  buildOrchestratorPrompt,
  buildIntentPrompt,
  buildTaskFramePrompt,
  buildSummarizePrompt,
  buildErrorRecoveryPrompt,
} from './prompts.js';

// Format utilities
export * from './format.js';
