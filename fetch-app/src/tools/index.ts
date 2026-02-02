/**
 * @fileoverview Tools Module Barrel Exports
 * 
 * Re-exports all tool definitions, types, and the registry for convenient importing.
 * 
 * @module tools
 * @see {@link module:tools/types} For Tool and ToolResult type definitions
 * @see {@link module:tools/registry} For ToolRegistry class
 * @see {@link module:tools/file} For file system tools
 * @see {@link module:tools/code} For code intelligence tools
 * @see {@link module:tools/shell} For shell execution tools
 * @see {@link module:tools/git} For git version control tools
 * @see {@link module:tools/control} For agent control flow tools
 * 
 * @example
 * ```typescript
 * import { ToolRegistry, fileTools, gitTools, Tool } from './tools/index.js';
 * 
 * const registry = new ToolRegistry();
 * fileTools.forEach(t => registry.register(t));
 * ```
 */

export * from './types.js';
export * from './registry.js';
export { fileTools } from './file.js';
export { codeTools } from './code.js';
export { shellTools } from './shell.js';
export { gitTools, getCurrentCommit, resetToCommit } from './git.js';
export { controlTools } from './control.js';
