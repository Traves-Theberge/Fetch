/**
 * @fileoverview Public exports for the skills subsystem.
 *
 * Re-exports runtime types and manager accessors used by prompt assembly
 * and message handling code.
 *
 * @module skills
 */

export * from './types.js';
export { SkillManager, getSkillManager } from './manager.js';
