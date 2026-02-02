/**
 * @fileoverview Session Module Barrel Exports
 * 
 * Re-exports all session management APIs, types, and storage utilities.
 * 
 * @module session
 * @see {@link module:session/types} For Session and related type definitions
 * @see {@link module:session/store} For SessionStore persistence layer
 * @see {@link module:session/manager} For SessionManager high-level API
 * @see {@link module:session/project} For project scanning utilities
 * 
 * @example
 * ```typescript
 * import { SessionManager, Session, SessionStore } from './session/index.js';
 * 
 * const manager = new SessionManager();
 * const session = await manager.getSession(userId);
 * ```
 */

export * from './types.js';
export * from './store.js';
export * from './manager.js';
