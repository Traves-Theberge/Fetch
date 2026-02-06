/**
 * @fileoverview Task Module Exports
 *
 * @module task
 * @see {@link TaskManager} - Task lifecycle management
 * @see {@link TaskIntegration} - Harness integration
 */

// Types
export * from './types.js';

// Manager
export { TaskManager, getTaskManager } from './manager.js';

// Integration
export {
  TaskIntegration,
  getTaskIntegration,
  initializeTaskIntegration,
  type TaskExecutionResult,
  type ProgressCallback,
} from './integration.js';
