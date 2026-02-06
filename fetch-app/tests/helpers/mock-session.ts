/**
 * @fileoverview Mock Session for Testing
 *
 * Provides mock session creation utilities for testing.
 */

import type { Session, Message, ProjectContext } from '../../src/session/types.js';

interface MockSessionOptions {
  userId?: string;
  currentProject?: ProjectContext | null;
  messages?: Message[];
}

/**
 * Create a mock session for testing
 */
export function createMockSession(options: MockSessionOptions = {}): Session {
  const now = new Date().toISOString();
  const userId = options.userId ?? `test_user_${Date.now()}`;

  return {
    id: `ses_${Date.now()}`,
    userId,
    messages: options.messages ?? [],
    currentProject: options.currentProject ?? null,
    availableProjects: [],
    activeFiles: [],
    repoMap: null,
    repoMapUpdatedAt: null,
    preferences: {
      autonomyLevel: 'cautious',
      autoCommit: true,
      verboseMode: false,
      maxIterations: 25,
    },
    activeTaskId: null,
    gitStartCommit: null,
    createdAt: now,
    lastActivityAt: now,
  };
}

/**
 * Create a mock project context
 */
export function createMockProject(name: string = 'test-project'): ProjectContext {
  return {
    name,
    path: `/workspace/${name}`,
    type: 'node',
    mainFiles: ['index.ts'],
    gitBranch: 'main',
    lastCommit: 'initial commit',
    hasUncommitted: false,
    refreshedAt: new Date().toISOString(),
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
