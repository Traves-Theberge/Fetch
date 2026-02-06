/**
 * @fileoverview Session and Task Type Definitions
 * @module session/types
 */

// =============================================================================
// AUTONOMY & PREFERENCES
// =============================================================================

/**
 * User's autonomy preference level.
 */
export type AutonomyLevel = 'supervised' | 'cautious' | 'autonomous';

export interface UserPreferences {
  /** How much freedom the agent has */
  autonomyLevel: AutonomyLevel;
  /** Auto-commit changes after approval */
  autoCommit: boolean;
  /** Show detailed progress updates */
  verboseMode: boolean;
  /** Max iterations before stopping */
  maxIterations: number;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autonomyLevel: 'cautious',
  autoCommit: true,
  verboseMode: false,
  maxIterations: 25
};

// ============================================================================
// Project Context
// ============================================================================

export type ProjectType = 'node' | 'python' | 'rust' | 'go' | 'java' | 'unknown';

export interface ProjectContext {
  /** Project directory name */
  name: string;
  /** Full path to project */
  path: string;
  /** Detected project type */
  type: ProjectType;
  /** Main/entry files detected */
  mainFiles: string[];
  /** Current git branch */
  gitBranch: string | null;
  /** Last commit message (short) */
  lastCommit: string | null;
  /** Has uncommitted changes */
  hasUncommitted: boolean;
  /** When project info was last refreshed */
  refreshedAt: string;
  /** Cached repository map string */
  repoMap?: string;
  /** Last time the repo map was updated */
  repoMapUpdatedAt?: string;
}

// ============================================================================
// Messages
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'tool';

export interface ToolCall {
  /** Tool name */
  name: string;
  /** Arguments passed to tool */
  args: Record<string, unknown>;
  /** Tool execution result */
  result?: string;
  /** Whether user approved (for tools requiring approval) */
  approved?: boolean;
  /** Execution duration in ms */
  duration?: number;
}

/**
 * Tool call request (in assistant message)
 */
export interface ToolCallRequest {
  /** Unique ID for this tool call (used to match with response) */
  id: string;
  /** Tool name */
  name: string;
  /** Arguments as JSON string */
  arguments: string;
}

export interface Message {
  /** Unique message ID */
  id: string;
  /** Who sent the message */
  role: MessageRole;
  /** Message content */
  content: string;
  /** Tool call details (for tool messages - the response) */
  toolCall?: ToolCall;
  /** Tool calls requested (for assistant messages requesting tools) */
  toolCalls?: ToolCallRequest[];
  /** ISO timestamp */
  timestamp: string;
}

// ============================================================================
// Task Reference (V3.3 — tasks tracked by TaskManager, session holds ID only)
// ============================================================================

import type { TaskId } from '../task/types.js';

// ============================================================================
// Session
// ============================================================================

export interface Session {
  /** Unique session ID */
  id: string;
  /** User's phone number (WhatsApp JID) */
  userId: string;
  /** Flexible metadata storage (V3.1) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
  
  // Conversation
  /** Current active thread ID (V3.1) */
  currentThreadId?: string;
  /** Full message history */
  messages: Message[];
  
  // Project Context
  /** Currently active project (null if none selected) */
  currentProject: ProjectContext | null;
  /** List of available project names in workspace */
  availableProjects: string[];
  
  // Context
  /** Files user is actively working with */
  activeFiles: string[];
  /** Cached repository structure map */
  repoMap: string | null;
  /** When repo map was last updated */
  repoMapUpdatedAt: string | null;
  
  // Preferences
  /** User's autonomy and behavior preferences */
  preferences: UserPreferences;
  
  // Task tracking (V3.3 — TaskManager is sole authority)
  /** Active task ID (null if idle). Task data lives in TaskManager. */
  activeTaskId: TaskId | null;
  
  // Git tracking
  /** Commit hash at session start (for undo all) */
  gitStartCommit: string | null;
  
  // Timestamps
  /** When session was created */
  createdAt: string;
  /** Last user activity */
  lastActivityAt: string;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Generate a short unique ID
 */
export function generateId(length: number = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Create a new session
 */
export function createSession(userId: string): Session {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    userId,
    metadata: {},
    messages: [],
    currentProject: null,
    availableProjects: [],
    activeFiles: [],
    repoMap: null,
    repoMapUpdatedAt: null,
    preferences: { ...DEFAULT_PREFERENCES },
    activeTaskId: null,
    gitStartCommit: null,
    createdAt: now,
    lastActivityAt: now
  };
}

/**
 * Create a new message
 */
export function createMessage(
  role: MessageRole,
  content: string,
  toolCall?: ToolCall,
  toolCalls?: ToolCallRequest[]
): Message {
  return {
    id: generateId(),
    role,
    content,
    toolCall,
    toolCalls,
    timestamp: new Date().toISOString()
  };
}
