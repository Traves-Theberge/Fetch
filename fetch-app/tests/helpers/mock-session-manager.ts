/**
 * @fileoverview Mock SessionManager for Testing
 *
 * Provides a pre-built mock and a factory for creating mock SessionManager
 * instances used across unit and integration tests.
 */

import { vi } from 'vitest';

/**
 * Create a fresh mock SessionManager with all methods stubbed.
 */
export function createMockSessionManager() {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn().mockResolvedValue(null),
    getOrCreateSession: vi.fn().mockResolvedValue(null),
    getSessionById: vi.fn().mockResolvedValue(null),
    updateSession: vi.fn().mockResolvedValue(undefined),
    listSessions: vi.fn().mockResolvedValue([]),
    deleteSession: vi.fn().mockResolvedValue(false),
    clearSession: vi.fn().mockResolvedValue(undefined),
    addUserMessage: vi.fn().mockResolvedValue({
      id: 'msg_user',
      role: 'user' as const,
      content: '',
      timestamp: new Date().toISOString(),
    }),
    addAssistantMessage: vi.fn().mockResolvedValue({
      id: 'msg_assistant',
      role: 'assistant' as const,
      content: '',
      timestamp: new Date().toISOString(),
    }),
    addAssistantToolCallMessage: vi.fn().mockResolvedValue({
      id: 'msg_tool_call',
      role: 'assistant' as const,
      content: '',
      timestamp: new Date().toISOString(),
    }),
    addToolMessage: vi.fn().mockResolvedValue({
      id: 'msg_tool',
      role: 'tool' as const,
      content: '',
      timestamp: new Date().toISOString(),
    }),
    acquireAgentRun: vi.fn().mockResolvedValue({
      acquired: true,
      run: {
        runId: 'run_test',
        phase: 'queued',
        promptMode: 'full',
        messagePreview: '',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      signal: new AbortController().signal,
    }),
    getActiveAgentRun: vi.fn().mockReturnValue(null),
    updateAgentRunPhase: vi.fn().mockResolvedValue(undefined),
    cancelAgentRun: vi.fn().mockResolvedValue({ cancelled: true, runId: 'run_test' }),
    completeAgentRun: vi.fn().mockResolvedValue(undefined),
    recordMemoryTiers: vi.fn().mockResolvedValue(undefined),
    compactIfNeeded: vi.fn().mockResolvedValue(undefined),
    updateRepoMap: vi.fn().mockResolvedValue(undefined),
    isRepoMapStale: vi.fn().mockReturnValue(false),
    addMemory: vi.fn().mockResolvedValue(undefined),
    recallMemories: vi.fn().mockResolvedValue([]),
    addToolMessages: vi.fn().mockResolvedValue(undefined),
    getMessages: vi.fn().mockResolvedValue([]),
  };
}

/**
 * Singleton mock session manager for tests that import it directly.
 */
export const mockSessionManager = createMockSessionManager();
