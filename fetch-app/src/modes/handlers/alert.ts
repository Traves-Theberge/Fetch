import { FetchMode, ModeHandler } from '../types.js';
import { logger } from '../../utils/logger.js';

export class AlertMode implements ModeHandler {
  name = FetchMode.ALERT;

  async enter(_previous: FetchMode): Promise<void> {
    logger.debug(`[${this.name}] Initializing vigilance protocols...`);
    // Reset any temporary state if coming from WORKING
  }

  async exit(next: FetchMode): Promise<void> {
    logger.debug(`[${this.name}] Standing down, switching to ${next}...`);
  }

  async process(_input: string): Promise<boolean> {
    // In ALERT mode, we are ready to receive commands.
    // If we reach here, it means an Instinct didn't handle it.
    // We return false to signal "Pass this to the main LLM Loop".
    return false;
  }
}
