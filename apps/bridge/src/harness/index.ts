/**
 * @fileoverview Public exports for harness execution modules.
 *
 * @module harness
 */

// Types
export * from './types.js';

// Registry
export {
  getAdapter,
  hasAdapter,
  listAgents,
  getAllAdapters,
  registerAdapter,
  getDefaultAgent,
} from './registry.js';

// Adapters
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
} from './registry.js';

// Executor
export { HarnessExecutor } from './executor.js';

// Output Parser
export { OutputParser } from './output-parser.js';

// Spawning & Pooling
export { HarnessSpawner } from './spawner.js';
export { HarnessPool, getHarnessPool } from './pool.js';
