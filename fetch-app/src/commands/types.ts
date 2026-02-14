/**
 * @fileoverview Shared types for pre-LLM command parsing and handling.
 *
 * @module commands/types
 */

/**
 * Result returned by command parser/handlers.
 *
 * `handled=true` means the caller should send `responses` and stop.
 * `handled=false` means the message should continue through agent processing.
 */
export type CommandResult = {
  /** Whether a command was found and executed */
  handled: boolean;
  /** Response messages (if handled) */
  responses?: string[];
  /** Continue to agent processing (if not handled) */
  shouldProcess?: boolean;
};
