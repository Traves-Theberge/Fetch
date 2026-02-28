/**
 * @fileoverview Shared types for pre-LLM command parsing and handling.
 *
 * @module commands/types
 */
import type { ResponseEnvelope } from '../agent/envelope.js';

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
  /** Structured envelopes (preferred over plain responses when present) */
  envelopes?: ResponseEnvelope[];
  /** Continue to agent processing (if not handled) */
  shouldProcess?: boolean;
};
