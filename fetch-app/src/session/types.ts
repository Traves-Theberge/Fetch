/**
 * @fileoverview Session domain types and factories.
 *
 * Defines persisted session shape, message/tool call payloads, memory records,
 * and helpers for creating session/message entities.
 *
 * @module session/types
 */

// =============================================================================
// AUTONOMY & PREFERENCES
// =============================================================================

/**
 * User autonomy preference level.
 */
export type AutonomyLevel = 'supervised' | 'cautious' | 'autonomous';

/** Per-user runtime behavior preferences stored in session state. */
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

/** Default preferences used for new sessions. */
export const DEFAULT_PREFERENCES: UserPreferences = {
  autonomyLevel: 'cautious',
  autoCommit: true,
  verboseMode: false,
  maxIterations: 25
};

// ============================================================================
// Project Context
// ============================================================================

/** Supported project type labels for session project context. */
export type ProjectType = 'node' | 'typescript' | 'python' | 'rust' | 'go' | 'java' | 'ruby' | 'php' | 'dotnet' | 'unknown';

import type { ProjectProfile } from '../workspace/types.js';

/** Project context snapshot stored in session state. */
export interface ProjectContext {
  /** Project directory name */
  name: string;
  /** Full path to project */
  path: string;
  /** Detected project type */
  type: ProjectType;
  /** Main/entry files detected */
  mainFiles: string[];
  /** Rich project profile with framework, package manager, etc. */
  profile?: ProjectProfile;
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

/** Structured tool result metadata stored on tool-role messages. */
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
 * Tool call request emitted by assistant messages.
 */
export interface ToolCallRequest {
  /** Unique ID for this tool call (used to match with response) */
  id: string;
  /** Tool name */
  name: string;
  /** Arguments as JSON string */
  arguments: string;
}

/** Canonical message shape stored in session history. */
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
// Memory
// ============================================================================

/** Category of a memory entry */
export type MemoryCategory = 'fact' | 'preference' | 'decision' | 'file_operation' | 'compaction_summary';

/** A structured memory entry for cross-session recall */
export interface MemoryEntry {
  id: string;
  sessionId: string;
  category: MemoryCategory;
  content: string;
  keywords: string;
  importance: number;
  createdAt: string;
  lastRecalledAt: string | null;
  recallCount: number;
}

// ============================================================================
// Task Reference (TaskManager is sole authority, session holds ID only)
// ============================================================================

import type { TaskId } from '../task/types.js';

// ============================================================================
// Session
// ============================================================================

/** Persisted session aggregate used by session manager/store. */
export interface Session {
  /** Unique session ID */
  id: string;
  /** User's phone number (WhatsApp JID) */
  userId: string;
  /** Flexible metadata storage */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
  
  // Conversation
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
  
  // Task tracking (TaskManager is sole authority)
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
 * Generates a short random identifier.
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
 * Creates a new session object with default values.
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
 * Creates a message object with current timestamp.
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
