/**
 * Instincts - Hardwired, deterministic behaviors that bypass LLM processing
 * 
 * Instincts are checked BEFORE intent classification. If matched, they return
 * a deterministic response without any LLM call. This ensures:
 * - Consistency: /help always returns the SAME response
 * - Speed: No LLM call for simple commands
 * - Reliability: Emergency stop ALWAYS works
 * - Token efficiency: Don't waste context on "help"
 */

import type { Session } from '../session/types.js';
import type { TaskStatus } from '../task/types.js';
import { FetchMode } from '../modes/types.js';

export { FetchMode };

/**
 * Context available to instinct handlers
 */
export interface InstinctContext {
  /** The user's message (normalized to lowercase, trimmed) */
  message: string;
  /** The original unmodified message */
  originalMessage: string;
  /** Current session state */
  session: Session;
  /** Current active task, if any */
  activeTask?: {
    id: string;
    status: TaskStatus;
    description: string;
    goal?: string;
    harness?: string;
    startedAt?: string;
  };
  /** Current mode (ALERT, WORKING, WAITING, etc.) */
  mode: FetchMode;
  /** Workspace path if set */
  workspace?: string;
}

/**
 * Response from a instinct handler
 */
export interface InstinctResponse {
  /** Whether this instinct matched the input */
  matched: boolean;
  /** The response message to send (if matched) */
  response?: string;
  /** Action to perform (if any) */
  action?: InstinctAction;
  /** Should we continue to intent classification after this? (default: false if matched) */
  continueProcessing?: boolean;
  /** Metadata about the match */
  metadata?: {
    instinctName: string;
    matchedTrigger?: string;
    matchedPattern?: string;
  };
}

/**
 * Actions a instinct can trigger
 */
export type InstinctAction = 
  | { type: 'stop' }           // Halt current task
  | { type: 'undo' }           // Revert last change
  | { type: 'clear' }          // Clear session state
  | { type: 'pause' }          // Pause current task
  | { type: 'resume' }         // Resume paused task
  | { type: 'set_mode'; mode: FetchMode };  // Change mode

/**
 * Definition of a instinct
 */
export interface Instinct {
  /** Unique name for this instinct */
  name: string;
  /** Human-readable description */
  description: string;
  /** Exact string triggers (case-insensitive, trimmed) */
  triggers: string[];
  /** Regex patterns for more complex matching */
  patterns?: RegExp[];
  /** Priority - higher values are checked first (default: 0) */
  priority: number;
  /** Handler function */
  handler: (ctx: InstinctContext) => InstinctResponse | Promise<InstinctResponse>;
  /** Whether this instinct is enabled */
  enabled: boolean;
  /** Category for organization */
  category: InstinctCategory;
}

/**
 * Instinct categories for organization
 */
export type InstinctCategory = 'safety' | 'info' | 'system' | 'flow' | 'personality' | 'control' | 'meta';

/**
 * Configuration for the Instinct Registry
 */
export interface InstinctRegistryConfig {
  /** Default priority for new instincts */
  defaultPriority: number;
  /** Whether to log instinct matches */
  logMatches: boolean;
  /** Whether to allow custom instincts from workspace */
  allowCustomInstincts: boolean;
  /** Whether to log debug info on register/match */
  debug: boolean;
  /** Master switch to enable/disable all instincts */
  enabled: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_INSTINCT_CONFIG: InstinctRegistryConfig = {
  defaultPriority: 0,
  logMatches: true,
  allowCustomInstincts: false,
  debug: false,
  enabled: true,
};

/**
 * Result of checking all instincts
 */
export interface InstinctCheckResult {
  /** Whether any instinct matched */
  matched: boolean;
  /** The matched instinct (if any) */
  instinct?: Instinct;
  /** The response from the handler (if any) */
  response?: InstinctResponse;
  /** Time taken to check instincts in milliseconds */
  durationMs?: number;
}
