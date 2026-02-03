/**
 * @fileoverview Mock Session for Testing
 *
 * Provides mock session creation utilities for testing.
 */

import type { Session, Message, Workspace } from '../../src/session/types.js';

interface MockSessionOptions {
  userId?: string;
  workspace?: Workspace | null;
  messages?: Message[];
  mode?: 'conversation' | 'action' | 'task';
}

/**
 * Create a mock session for testing
 */
export function createMockSession(options: MockSessionOptions = {}): Session {
  const now = new Date().toISOString();
  const userId = options.userId ?? `test_user_${Date.now()}`;

  return {
    id: `ses_${Date.now()}`,
    platform: 'test',
    userId,
    createdAt: now,
    lastActivityAt: now,
    mode: options.mode ?? 'conversation',
    workspace: options.workspace ?? null,
    pendingApproval: null,
    messages: options.messages ?? [],
    activeTasks: [],
    context: {
      lastCommand: null,
      lastError: null,
      consecutiveErrors: 0,
    },
  };
}

/**
 * Create a mock workspace
 */
export function createMockWorkspace(name: string = 'test-project'): Workspace {
  return {
    name,
    path: `/workspace/${name}`,
    gitBranch: 'main',
    lastModified: new Date().toISOString(),
  };
}

/**
 * Create a mock message
 */
export function createMockMessage(
  role: 'user' | 'assistant',
  content: string
): Message {
  return {
    id: `msg_${Date.now()}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}
