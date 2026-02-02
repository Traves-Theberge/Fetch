/**
 * @fileoverview Agent Module Barrel Exports
 * 
 * Re-exports all public APIs from the agent module for convenient importing.
 * 
 * @module agent
 * @see {@link module:agent/core} For the main AgentCore orchestrator
 * @see {@link module:agent/format} For message formatting utilities
 * @see {@link module:agent/intent} For intent classification
 * @see {@link module:agent/conversation} For conversation mode
 * @see {@link module:agent/inquiry} For inquiry mode
 * @see {@link module:agent/action} For action mode
 * 
 * @example
 * ```typescript
 * import { AgentCore, formatApprovalRequest } from './agent/index.js';
 * ```
 */

export { AgentCore } from './core.js';
export * from './format.js';
