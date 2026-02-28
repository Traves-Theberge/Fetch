/**
 * @fileoverview Public exports for the task subsystem.
 *
 * Exposes task domain types, lifecycle manager, and harness integration entry points.
 *
 * @module task
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
} from './integration.js';
