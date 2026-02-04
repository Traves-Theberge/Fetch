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
// Agent Task
// ============================================================================

export type TaskStatus =
  | 'planning'           // Creating execution plan
  | 'executing'          // Running a tool
  | 'awaiting_approval'  // Waiting for user yes/no
  | 'paused'             // User said "pause"
  | 'completed'          // Goal achieved
  | 'failed'             // Unrecoverable error
  | 'aborted';           // User said "stop"

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface PlanStep {
  /** Step number */
  id: number;
  /** Human-readable description */
  description: string;
  /** Tool to execute */
  tool: string;
  /** Tool arguments */
  args?: Record<string, unknown>;
  /** Execution status */
  status: PlanStepStatus;
  /** Result or error message */
  result?: string;
}

export interface ApprovalRequest {
  /** Tool requesting approval */
  tool: string;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** What the tool will do */
  description: string;
  /** Diff preview for file edits */
  diff?: string;
  /** Tool call ID for message pairing */
  toolCallId?: string;
  /** When approval was requested */
  createdAt: string;
}

export interface AgentTask {
  /** Unique task ID */
  id: string;
  /** Original user goal */
  goal: string;
  /** Current status */
  status: TaskStatus;
  
  // Planning
  /** Execution plan steps */
  plan: PlanStep[];
  /** Current step index */
  currentStepIndex: number;
  
  // Execution tracking
  /** Number of agent loop iterations */
  iterations: number;
  /** Maximum allowed iterations */
  maxIterations: number;
  
  // Pending approval
  /** Current approval request (if awaiting) */
  pendingApproval: ApprovalRequest | null;
  
  // Results
  /** Files modified during task */
  filesModified: string[];
  /** Git commits created */
  commitsCreated: string[];
  /** Final output/summary */
  output: string;
  /** Error message if failed */
  error?: string;
  
  // Timing
  /** When task started */
  startedAt: string;
  /** When task completed/failed */
  completedAt: string | null;
}

// ============================================================================
// Session
// ============================================================================

export interface Session {
  /** Unique session ID */
  id: string;
  /** User's phone number (WhatsApp JID) */
  userId: string;
  
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
  
  // Current task
  /** Active agent task (null if idle) */
  currentTask: AgentTask | null;
  
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
// Database Schema
// ============================================================================

export interface Database {
  sessions: Session[];
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
    messages: [],
    currentProject: null,
    availableProjects: [],
    activeFiles: [],
    repoMap: null,
    repoMapUpdatedAt: null,
    preferences: { ...DEFAULT_PREFERENCES },
    currentTask: null,
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

/**
 * Create a new agent task
 */
export function createTask(goal: string, maxIterations: number = 25): AgentTask {
  return {
    id: generateId(),
    goal,
    status: 'planning',
    plan: [],
    currentStepIndex: 0,
    iterations: 0,
    maxIterations,
    pendingApproval: null,
    filesModified: [],
    commitsCreated: [],
    output: '',
    startedAt: new Date().toISOString(),
    completedAt: null
  };
}
