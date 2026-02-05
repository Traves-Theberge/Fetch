import { FetchMode, ModeHandler } from '../types.js';
import { logger } from '../../utils/logger.js';

export class WorkingMode implements ModeHandler {
  name = FetchMode.WORKING;
  private currentTaskId: string | null = null;

  async enter(previous: FetchMode, data?: { taskId: string }): Promise<void> {
    this.currentTaskId = data?.taskId || null;
    logger.info(`[${this.name}] Engaging task execution (Task ID: ${this.currentTaskId})...`);
  }

  async exit(_next: FetchMode): Promise<void> {
    logger.info(`[${this.name}] Task execution suspended/completed.`);
    this.currentTaskId = null;
  }

  async process(_input: string): Promise<boolean> {
    // In WORKING mode, input is treated as context/feedback for the running task.
    // If the user tries to start a new task, we might want to warn them.
    // However, for V3, let's keep it simple: return false so the LLM can decide
    // if it needs to update the current task or switch tasks.
    
    // Future: Check if input is "status" or "update"
    return false;
  }
}
