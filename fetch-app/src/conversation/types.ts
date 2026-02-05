/**
 * @fileoverview Conversation Domain Types
 * 
 * Defines types related to conversation flow, mode detection, and context tracking.
 */

/**
 * Conversation Modes
 * 
 * - CHAT: Casual conversation, Q&A, personality-driven interaction.
 * - EXPLORATION: User is asking about the codebase or system capabilities.
 * - TASK: User has requested specific work (coding, changes, actions).
 * - COLLABORATION: User and Agent are working together on a complex problem.
 * - TEACHING: Agent is explaining a concept to the user.
 */
export type ConversationMode = 
  | 'CHAT'
  | 'EXPLORATION'
  | 'TASK'
  | 'COLLABORATION'
  | 'TEACHING';

/**
 * Result of analyzing a user message for mode signals
 */
export interface ModeDetectionResult {
  mode: ConversationMode;
  confidence: number;
  signals: string[]; // List of signals that triggered this detection
}

/**
 * Context Thread
 * 
 * Represents a continuous stream of related messages.
 */
export interface ConversationThread {
  id: string;
  projectId?: string;
  mode: ConversationMode;
  startedAt: string;
  topic?: string;
  lastActive: string;
  messageCount: number;
}
