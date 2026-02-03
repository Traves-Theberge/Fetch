/**
 * @fileoverview Task Module Exports
 *
 * @module task
 * @see {@link TaskManager} - Task lifecycle management
 * @see {@link TaskQueue} - Task queue
 * @see {@link TaskIntegration} - Harness integration
 */

// Types
export * from './types.js';

// Manager
export { TaskManager, taskManager } from './manager.js';

// Queue
export { TaskQueue, taskQueue } from './queue.js';

// Integration
export {
  TaskIntegration,
  getTaskIntegration,
  initializeTaskIntegration,
  type TaskExecutionResult,
  type ProgressCallback,
} from './integration.js';
