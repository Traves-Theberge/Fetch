/**
 * @fileoverview Command result type shared across all command handlers.
 *
 * @module commands/types
 */

/**
 * Result of command parsing.
 */
export type CommandResult = {
  /** Whether a command was found and executed */
  handled: boolean;
  /** Response messages (if handled) */
  responses?: string[];
  /** Continue to agent processing (if not handled) */
  shouldProcess?: boolean;
};
