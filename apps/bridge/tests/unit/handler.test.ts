/**
 * @fileoverview Handler Module Tests
 *
 * Tests for the main message handler entry point. Verifies the message flow:
 * validation -> command parsing -> agent core -> response formatting.
 *
 * All external dependencies are mocked to isolate handler logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// MOCKS — must be declared before importing the handler
// =============================================================================

const mockSession = {
  id: 'ses_1',
  userId: 'user1',
  messages: [],
  metadata: {},
  currentProject: null,
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
  createdAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
};

const mockSessionManager = {
  getOrCreateSession: vi.fn().mockResolvedValue(mockSession),
  getSessionById: vi.fn().mockResolvedValue(mockSession),
  addUserMessage: vi.fn().mockResolvedValue({
    id: 'msg_1',
    role: 'user',
    content: '',
    timestamp: new Date().toISOString(),
  }),
  addAssistantMessage: vi.fn().mockResolvedValue({
    id: 'msg_2',
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString(),
  }),
  updateSession: vi.fn(),
  cancelAgentRun: vi.fn().mockResolvedValue({ cancelled: false }),
  acquireAgentRun: vi.fn().mockResolvedValue({
    acquired: true,
    run: { runId: 'run_1', phase: 'queued', promptMode: 'full' },
    signal: new AbortController().signal,
  }),
  updateAgentRunPhase: vi.fn().mockResolvedValue(undefined),
  completeAgentRun: vi.fn().mockResolvedValue(undefined),
  getActiveAgentRun: vi.fn().mockReturnValue(undefined),
};

const mockTaskManager = {
  on: vi.fn(),
  removeAllListeners: vi.fn(),
  getCurrentTask: vi.fn().mockReturnValue(null),
  getTask: vi.fn().mockReturnValue(null),
};

const mockTaskIntegration = {
  on: vi.fn(),
  removeAllListeners: vi.fn(),
};

vi.mock('../../src/session/manager.js', () => ({
  getSessionManager: vi.fn().mockResolvedValue(mockSessionManager),
}));

vi.mock('../../src/agent/core.js', () => ({
  processMessage: vi.fn().mockResolvedValue({ text: 'LLM response', toolCalls: [] }),
  generateProgressMessage: vi.fn().mockReturnValue('Thinking...'),
  selectPromptMode: vi.fn().mockReturnValue('full'),
}));

vi.mock('../../src/commands/parser.js', () => ({
  parseCommand: vi.fn().mockResolvedValue({ handled: false, shouldProcess: true }),
}));

vi.mock('../../src/agent/whatsapp-format.js', () => ({
  formatForWhatsApp: vi.fn((text: string) => text),
  formatAndChunkForWhatsApp: vi.fn((text: string) => [text]),
}));

vi.mock('../../src/agent/discord-format.js', () => ({
  formatForDiscord: vi.fn((text: string) => text),
  formatAndChunkForDiscord: vi.fn((text: string) => [text]),
}));

vi.mock('../../src/task/manager.js', () => ({
  getTaskManager: vi.fn().mockResolvedValue(mockTaskManager),
}));

vi.mock('../../src/task/integration.js', () => ({
  initializeTaskIntegration: vi.fn(),
  getTaskIntegration: vi.fn().mockReturnValue(mockTaskIntegration),
}));

vi.mock('../../src/agent/notifications.js', () => ({
  formatNotification: vi.fn().mockResolvedValue('Working on it'),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    section: vi.fn(),
    divider: vi.fn(),
  },
}));

// =============================================================================
// IMPORT AFTER MOCKS
// =============================================================================

const { handleMessage, initializeHandler, registerWhatsAppSender, shutdown } = await import(
  '../../src/handler/index.js'
);
const { parseCommand } = await import('../../src/commands/parser.js');
const { processMessage } = await import('../../src/agent/core.js');
const { formatForWhatsApp } = await import('../../src/agent/whatsapp-format.js');
const { formatAndChunkForWhatsApp } = await import('../../src/agent/whatsapp-format.js');
const { formatNotification } = await import('../../src/agent/notifications.js');

// =============================================================================
// TESTS
// =============================================================================

describe('Handler — Message Flow', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await shutdown();

    // Reset default mock behaviors
    vi.mocked(parseCommand).mockResolvedValue({ handled: false, shouldProcess: true });
    vi.mocked(processMessage).mockResolvedValue({ text: 'LLM response', toolCalls: [] });
    vi.mocked(formatForWhatsApp).mockImplementation((text: string) => text);
    vi.mocked(formatAndChunkForWhatsApp).mockImplementation((text: string) => [text]);
    vi.mocked(formatNotification).mockResolvedValue('Working on it');
  });

  // ─── Normal message flow ─────────────────────────────────────────

  it('should return LLM response for a normal message', async () => {
    const responses = await handleMessage('user1', 'Hello there');

    expect(responses).toHaveLength(1);
    // buildResponses strips leading dog emoji from LLM output and prepends its own
    expect(responses[0]).toContain('LLM response');
    expect(processMessage).toHaveBeenCalledOnce();
  });

  it('should pass the message text to processMessage', async () => {
    await handleMessage('user1', 'build a REST API');

    expect(processMessage).toHaveBeenCalledWith(
      'build a REST API',
      expect.any(Object), // session
      expect.any(Function), // onProgress wrapper
      expect.objectContaining({
        runId: expect.any(String),
        promptMode: expect.any(String),
      })
    );
  });

  it('should persist user and assistant messages to the session', async () => {
    vi.mocked(processMessage).mockResolvedValue({ text: 'Done!', toolCalls: [] });

    await handleMessage('user1', 'fix the bug');

    expect(mockSessionManager.addUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ses_1' }),
      'fix the bug'
    );
    expect(mockSessionManager.addAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ses_1' }),
      'Done!'
    );
  });

  // ─── Empty / whitespace validation ───────────────────────────────

  it('should return error for an empty message without calling agent', async () => {
    const responses = await handleMessage('user1', '');

    expect(responses).toHaveLength(1);
    expect(responses[0]).toContain("didn't catch that");
    expect(processMessage).not.toHaveBeenCalled();
  });

  it('should return error for a whitespace-only message', async () => {
    const responses = await handleMessage('user1', '   \t\n  ');

    expect(responses).toHaveLength(1);
    expect(responses[0]).toContain("didn't catch that");
    expect(processMessage).not.toHaveBeenCalled();
  });

  // ─── Slash command handling ──────────────────────────────────────

  it('should return command response for a handled slash command (/help)', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      handled: true,
      responses: ['Help text here'],
    });

    const responses = await handleMessage('user1', '/help');

    expect(responses).toEqual(['Help text here']);
    expect(processMessage).not.toHaveBeenCalled();
  });

  it('should fall through to agent for an unknown slash command', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      handled: false,
      shouldProcess: true,
    });

    const responses = await handleMessage('user1', '/unknown-command');

    expect(processMessage).toHaveBeenCalledOnce();
    expect(responses[0]).toContain('LLM response');
  });

  it('should return busy message when a run is already active', async () => {
    mockSessionManager.acquireAgentRun.mockResolvedValueOnce({
      acquired: false,
      activeRun: { runId: 'run_busy', phase: 'planning', promptMode: 'full' },
    });

    const responses = await handleMessage('user1', 'new request while busy');

    expect(processMessage).not.toHaveBeenCalled();
    expect(responses[0]).toContain('still working on your previous request');
  });

  it('should trigger runtime cancellation before handling /stop', async () => {
    vi.mocked(parseCommand).mockResolvedValueOnce({
      handled: true,
      responses: ['Stopped'],
    });

    await handleMessage('user1', '/stop');

    expect(mockSessionManager.cancelAgentRun).toHaveBeenCalledOnce();
    expect(mockSessionManager.cancelAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ses_1' }),
      'Cancelled by /stop'
    );
  });

  // ─── Response formatting ─────────────────────────────────────────

  it('should call formatAndChunkForWhatsApp on agent response text', async () => {
    vi.mocked(processMessage).mockResolvedValue({
      text: 'Some markdown **bold** text',
      toolCalls: [],
    });

    await handleMessage('user1', 'format this');

    expect(formatAndChunkForWhatsApp).toHaveBeenCalled();
  });

  it('should render envelope responses via composer path', async () => {
    vi.mocked(processMessage).mockResolvedValue({
      text: 'fallback text',
      envelope: {
        kind: 'status',
        severity: 'success',
        mode: 'conversational',
        emojiLevel: 'normal',
        title: 'Workspace Status',
        summary: 'Workspace is clean on main',
      },
      toolCalls: [],
    });

    const responses = await handleMessage('user1', 'status');

    expect(responses).toHaveLength(1);
    expect(responses[0]).toContain('Workspace Status');
    expect(responses[0]).toContain('Workspace is clean on main');
  });

  it('should call formatForWhatsApp on command responses', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      handled: true,
      responses: ['Status: all good'],
    });

    const responses = await handleMessage('user1', '/status');

    // Command responses are mapped through formatForWhatsApp
    expect(formatForWhatsApp).toHaveBeenCalledWith('Status: all good');
    expect(responses).toEqual(['Status: all good']);
  });

  it('should return multiple command response chunks when command returns several', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      handled: true,
      responses: ['Part 1 of help', 'Part 2 of help', 'Part 3 of help'],
    });

    const responses = await handleMessage('user1', '/help');

    expect(responses).toHaveLength(3);
    expect(responses[0]).toBe('Part 1 of help');
    expect(responses[1]).toBe('Part 2 of help');
    expect(responses[2]).toBe('Part 3 of help');
  });

  it('should compose envelope command responses when provided by parser', async () => {
    vi.mocked(parseCommand).mockResolvedValue({
      handled: true,
      envelopes: [{
        kind: 'status',
        severity: 'success',
        mode: 'conversational',
        emojiLevel: 'normal',
        title: 'Workspace Status',
        summary: 'test-project on main',
      }],
    });

    const responses = await handleMessage('user1', 'status');

    expect(responses).toHaveLength(1);
    expect(responses[0]).toContain('Workspace Status');
    expect(responses[0]).toContain('test-project on main');
  });

  // ─── Error handling ──────────────────────────────────────────────

  it('should return a friendly error message when processMessage throws', async () => {
    vi.mocked(processMessage).mockRejectedValue(new Error('API timeout'));

    const responses = await handleMessage('user1', 'do something');

    expect(responses).toHaveLength(1);
    expect(responses[0]).toContain('API timeout');
    expect(responses[0]).toContain('/help');
  });

  it('clears the delayed thinking timer when processMessage throws', async () => {
    vi.useFakeTimers();
    try {
      const onProgress = vi.fn().mockResolvedValue(undefined);
      vi.mocked(processMessage).mockRejectedValueOnce(new Error('API timeout'));

      await handleMessage('user1', 'do something', onProgress);
      vi.advanceTimersByTime(4000);
      await Promise.resolve();

      expect(onProgress).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // ─── Session lifecycle ───────────────────────────────────────────

  it('should get or create a session for the user', async () => {
    await handleMessage('user1', 'hello');

    expect(mockSessionManager.getOrCreateSession).toHaveBeenCalledWith('user1');
  });

  it('should update session lastActivityAt timestamp', async () => {
    await handleMessage('user1', 'hello');

    expect(mockSessionManager.updateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        lastActivityAt: expect.any(String),
      })
    );
  });

  it('should send task started notification via envelope composer', async () => {
    const sendWhatsApp = vi.fn().mockResolvedValue(undefined);
    registerWhatsAppSender(sendWhatsApp);
    await initializeHandler();

    const startedHandler = mockTaskIntegration.on.mock.calls.find(([event]) => event === 'task:started')?.[1];
    expect(startedHandler).toBeTypeOf('function');
    if (typeof startedHandler !== 'function') {
      throw new Error('task:started handler not registered');
    }

    vi.mocked(formatNotification).mockResolvedValueOnce('Starting implementation now');
    await startedHandler({ taskId: 'task_1', sessionId: 'ses_1', goal: 'Implement feature X' });

    expect(sendWhatsApp).toHaveBeenCalledWith(
      'user1',
      expect.stringContaining('Task Started')
    );
    expect(sendWhatsApp).toHaveBeenCalledWith(
      'user1',
      expect.stringContaining('Starting implementation now')
    );
  });

  it('should persist and send task completed notification using the same envelope rendering path', async () => {
    const sendWhatsApp = vi.fn().mockResolvedValue(undefined);
    registerWhatsAppSender(sendWhatsApp);
    await initializeHandler();

    const completedHandler = mockTaskIntegration.on.mock.calls.find(([event]) => event === 'task:completed')?.[1];
    expect(completedHandler).toBeTypeOf('function');
    if (typeof completedHandler !== 'function') {
      throw new Error('task:completed handler not registered');
    }

    mockTaskManager.getTask.mockReturnValueOnce({
      id: 'task_1',
      result: { summary: 'Implemented feature X' },
      startedAt: new Date(Date.now() - 5000).toISOString(),
      completedAt: new Date().toISOString(),
    });
    vi.mocked(formatNotification).mockResolvedValueOnce('Done and verified');

    await completedHandler({ taskId: 'task_1', sessionId: 'ses_1' });

    expect(mockSessionManager.addAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ses_1' }),
      expect.stringContaining('Task Completed')
    );
    expect(sendWhatsApp).toHaveBeenCalledWith(
      'user1',
      expect.stringContaining('Task Completed')
    );
    expect(sendWhatsApp).toHaveBeenCalledWith(
      'user1',
      expect.stringContaining('Done and verified')
    );
  });
});
