/**
 * @fileoverview Commands Module — Barrel Exports
 *
 * Re-exports the safety-gate parser and shared types.
 * In v4.0, only 5 deterministic escape commands are intercepted here;
 * everything else passes through to the LLM agent.
 *
 * @module commands
 * @see {@link module:commands/parser} — parseCommand (safety gate)
 * @see {@link module:commands/types}  — CommandResult type
 *
 * @example
 * ```typescript
 * import { parseCommand } from './commands/index.js';
 *
 * const result = await parseCommand('/status', session, sessionManager);
 * if (result.handled) {
 *   // Safety escape matched — send result.responses to the user
 * } else {
 *   // Not a safety escape — forward to the LLM agent
 * }
 * ```
 */

export { parseCommand } from './parser.js';
export type { CommandResult } from './types.js';
