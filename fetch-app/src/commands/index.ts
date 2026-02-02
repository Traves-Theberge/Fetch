/**
 * @fileoverview Commands Module Barrel Exports
 * 
 * Re-exports command parsing utilities for slash command handling.
 * 
 * @module commands
 * @see {@link module:commands/parser} For parseCommand function and types
 * 
 * @example
 * ```typescript
 * import { parseCommand, CommandResult } from './commands/index.js';
 * 
 * const result: CommandResult = parseCommand('/status');
 * if (result.isCommand) {
 *   console.log(`Command: ${result.command}, Args: ${result.args}`);
 * }
 * ```
 */

export { parseCommand } from './parser.js';
export type { CommandResult } from './parser.js';
