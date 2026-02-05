import { FetchMode, ModeState, ModeTransition, ModeHandler } from './types.js';
import { logger } from '../utils/logger.js';
import { getSessionStore } from '../session/store.js';

export class ModeManager {
  private static instance: ModeManager | undefined;
  private currentState: ModeState;
  private history: ModeTransition[] = [];
  private handlers: Map<FetchMode, ModeHandler> = new Map();

  private constructor() {
    // Basic init
    this.currentState = {
      mode: FetchMode.ALERT,
      since: Date.now()
    };
  }
  
  public async init() {
      // Restore from DB
      try {
          const store = getSessionStore();
          
          const savedMode = store.getMeta('FETCH_MODE');
          if (savedMode) {
              const parsed = JSON.parse(savedMode);
              // Validate mode before restoring
              if (Object.values(FetchMode).includes(parsed.mode)) {
                  this.currentState = parsed;
                  
                  // Safety check: Revert stuck modes
                  if (this.currentState.mode === FetchMode.GUARDING || 
                      this.currentState.mode === FetchMode.WAITING ||
                      this.currentState.mode === FetchMode.WORKING) {
                        logger.info(`Resetting stuck mode ${this.currentState.mode} to ALERT`);
                        this.currentState.mode = FetchMode.ALERT;
                        this.currentState.since = Date.now();
                        this.persistState();
                  } else {
                        logger.info(`Restored mode from DB: ${this.currentState.mode}`);
                  }
              }
          }
      } catch (e) {
          logger.warn('Failed to restore mode persistence', e);
      }
  }

  public static getInstance(): ModeManager {
    if (!ModeManager.instance) {
      ModeManager.instance = new ModeManager();
    }
    return ModeManager.instance;
  }

  /**
   * Register a handler for a specific mode
   */
  public registerHandler(handler: ModeHandler): void {
    this.handlers.set(handler.name, handler);
    logger.info(`Registered mode handler: ${handler.name}`);
  }

  /**
   * Get the current mode state
   */
  public getState(): ModeState {
    return { ...this.currentState }; // Return copy
  }

  /**
   * Transition to a new mode
   */
  public async transitionTo(mode: FetchMode, reason: string, data?: unknown): Promise<boolean> {
    if (this.currentState.mode === mode) {
      logger.debug(`Already in mode: ${mode}`);
      return true;
    }

    const previousMode = this.currentState.mode;
    const currentHandler = this.handlers.get(previousMode);
    const nextHandler = this.handlers.get(mode);

    logger.info(`Transitioning: ${previousMode} -> ${mode} (${reason})`);

    // record transition
    this.history.push({
      from: previousMode,
      to: mode,
      reason,
      timestamp: Date.now()
    });

    try {
      // 1. Exit current mode
      if (currentHandler) {
        await currentHandler.exit(mode);
      }

      // 2. Update state
      this.currentState = {
        mode,
        since: Date.now(),
        data,
        previousMode
      };
      
      this.persistState();

      // 3. Enter new mode
      if (nextHandler) {
        await nextHandler.enter(previousMode, data);
      } else {
        logger.warn(`No handler registered for mode: ${mode}`);
      }

      return true;
    } catch (error) {
      logger.error(`Failed during mode transition: ${(error as Error).message}`);
      // Revert state if critical failure? For now, just log.
      return false;
    }
  }

  private persistState() {
      try {
          const store = getSessionStore();
          store.setMeta('FETCH_MODE', JSON.stringify(this.currentState));
      } catch (e) {
          logger.warn('Failed to persist mode state', e);
      }
  }

  /**
   * Get transition history
   */
  public getHistory(): ModeTransition[] {
    return [...this.history];
  }
}

export const getModeManager = () => ModeManager.getInstance();
