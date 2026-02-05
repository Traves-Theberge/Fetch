/**
 * Fetch Mode System Types
 * 
 * Defines the state machine for the agent's behavior modes.
 */

export enum FetchMode {
  ALERT = 'ALERT',       // Active, listening for commands (Default)
  WORKING = 'WORKING',   // Actively executing a task
  WAITING = 'WAITING',   // Waiting for user input or external event
  GUARDING = 'GUARDING', // Passive monitoring (future)
  RESTING = 'RESTING',   // Low-power/idle state (future)
}

export interface ModeState {
  mode: FetchMode;
  since: number;       // Timestamp when mode started
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;          // Mode-specific data
  previousMode?: FetchMode;
}

export interface ModeTransition {
  from: FetchMode;
  to: FetchMode;
  reason: string;
  timestamp: number;
}

export interface ModeHandler {
  name: FetchMode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enter(previous: FetchMode, data?: any): Promise<void>;
  exit(next: FetchMode): Promise<void>;
  process(input: string): Promise<boolean>; // Returns true if handled
}
