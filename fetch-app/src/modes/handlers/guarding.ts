import { FetchMode, ModeHandler } from '../types.js';
import { logger } from '../../utils/logger.js';
import { getTaskIntegration } from '../../task/integration.js';
import { getModeManager } from '../manager.js';
import type { TaskId } from '../../task/types.js';

export class GuardingMode implements ModeHandler {
  name = FetchMode.GUARDING;
  private pendingAction: string | null = null;
  private pendingTaskId: TaskId | null = null;

  async enter(previous: FetchMode, data?: { action: string, taskId?: string }): Promise<void> {
    this.pendingAction = data?.action || 'Unknown Action';
    this.pendingTaskId = (data?.taskId as TaskId) || null;
    logger.warn(`[${this.name}] SECURITY LOCK: Pending authorization for '${this.pendingAction}'`);
  }

  async exit(_next: FetchMode): Promise<void> {
    logger.info(`[${this.name}] Security lock released.`);
    this.pendingAction = null;
    this.pendingTaskId = null;
  }

  async process(input: string): Promise<boolean> {
    const response = input.trim().toLowerCase();
    const mm = getModeManager();
    
    if (['y', 'yes', 'confirm', 'ok'].includes(response)) {
        logger.info('Action confirmed by user.');
        
        if (this.pendingTaskId) {
            try {
                // Use integration to resume harness
                const integration = getTaskIntegration();
                await integration.respondToTask(this.pendingTaskId, "Confirmed");
            } catch (e) {
                logger.error('Failed to resume task', e);
            }
        }
        
        await mm.transitionTo(FetchMode.WORKING, 'User confirmed action');
        return true; 
    } 
    
    if (['n', 'no', 'cancel', 'stop'].includes(response)) {
        logger.info('Action cancelled by user.');
        
        if (this.pendingTaskId) {
            const integration = getTaskIntegration();
            await integration.respondToTask(this.pendingTaskId, "Denied");
            // Also explicitly cancel task via Manager if explicit stop?
        }

        await mm.transitionTo(FetchMode.ALERT, 'User denied action');
        return true;
    }

    // Default: Block execution
    // Maybe remind user?
    return true; 
  }
}
