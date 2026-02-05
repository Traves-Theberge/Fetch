import { getModeManager } from './manager.js';
import { AlertMode } from './handlers/alert.js';
import { WorkingMode } from './handlers/working.js';
import { WaitingMode } from './handlers/waiting.js';
import { GuardingMode } from './handlers/guarding.js';

export * from './types.js';
export * from './manager.js';

/**
 * Initialize the Mode System
 * Registers default handlers and sets initial state
 */
export async function initModes(): Promise<void> {
  const manager = getModeManager();
  
  // Register Handlers
  manager.registerHandler(new AlertMode());
  manager.registerHandler(new WorkingMode());
  manager.registerHandler(new WaitingMode());
  manager.registerHandler(new GuardingMode());
  
  // Future: Resting
}
