/**
 * @fileoverview Agent Module Barrel Exports
 * 
 * Re-exports all public APIs from the agent module for convenient importing.
 * 
 * @module agent
 * @see {@link module:agent/core} For the main AgentCore orchestrator (v1 - legacy)
 * @see {@link module:agent/core-v2} For the v2 orchestrator architecture
 * @see {@link module:agent/format} For message formatting utilities
 * @see {@link module:agent/intent} For intent classification (v1)
 * @see {@link module:agent/intent-v2} For intent classification (v2)
 * 
 * @example
 * ```typescript
 * // V1 (legacy)
 * import { AgentCore, formatApprovalRequest } from './agent/index.js';
 * 
 * // V2 (recommended)
 * import { processMessageV2, classifyIntentV2 } from './agent/index.js';
 * ```
 */

// V1 (legacy) exports
export { AgentCore } from './core.js';
export * from './format.js';

// V2 exports
export { processMessageV2, frameTaskGoal, classifyIntentV2 } from './core-v2.js';
export type { AgentResponse, ToolCallRecord } from './core-v2.js';
export type { IntentTypeV2, ClassifiedIntentV2 } from './intent-v2.js';
export {
  buildOrchestratorPrompt,
  buildIntentPrompt,
  buildTaskFramePrompt,
  buildSummarizePrompt,
  buildErrorRecoveryPrompt,
} from './prompts-v2.js';
