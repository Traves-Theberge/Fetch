/**
 * @fileoverview Harness Module Exports
 *
 * Re-exports all harness-related types, adapters, and utilities.
 *
 * @module harness
 *
 * ## Available Adapters
 *
 * - **Claude Code** (`claude`) - Full code modification capabilities
 * - **Gemini CLI** (`gemini`) - Code generation and modification
 * - **GitHub Copilot CLI** (`copilot`) - Code suggestions and explanations
 *
 * ## Usage
 *
 * ```typescript
 * import { getAdapter, HarnessExecutor } from './harness/index.js';
 *
 * const adapter = getAdapter('claude');
 * const config = adapter.buildConfig('Add dark mode', '/workspace/project', 300000);
 *
 * const executor = new HarnessExecutor();
 * const result = await executor.execute(config);
 * ```
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
  getAdapterCapabilities,
  initializeHarnessRegistry,
} from './registry.js';

// Adapters
export {
  ClaudeAdapter,
  GeminiAdapter,
  CopilotAdapter,
  claudeAdapter,
  geminiAdapter,
  copilotAdapter,
} from './registry.js';

// Executor
export { HarnessExecutor } from './executor.js';

// Output Parser
export { OutputParser } from './output-parser.js';
