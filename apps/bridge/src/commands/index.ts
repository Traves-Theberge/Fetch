/**
 * @fileoverview Public exports for deterministic slash-command handling.
 *
 * This module exposes:
 * - `parseCommand`: pre-LLM command gate
 * - `CommandResult`: shared result contract for command handlers
 *
 * @module commands
 * @see {@link module:commands/parser} Command router implementation
 * @see {@link module:commands/types} Shared command types
 */

export { parseCommand } from './parser.js';
export type { CommandResult } from './types.js';
