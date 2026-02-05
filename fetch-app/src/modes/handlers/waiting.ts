import { FetchMode, ModeHandler } from '../types.js';
import { logger } from '../../utils/logger.js';

export class WaitingMode implements ModeHandler {
  name = FetchMode.WAITING;

  async enter(_previous: FetchMode): Promise<void> {
    logger.debug(`[${this.name}] Pausing execution, awaiting input...`);
  }

  async exit(_next: FetchMode): Promise<void> {
    logger.debug(`[${this.name}] Input received, resuming...`);
  }

  async process(_input: string): Promise<boolean> {
    // In WAITING mode, the input IS the thing we were waiting for.
    // The main loop should handle this by resolving the pending promise.
    // So we return false to let it bubble up.
    return false;
  }
}
