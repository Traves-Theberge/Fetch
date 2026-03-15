import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processMessage } from '../../src/agent/core.js';
import { createMockSession, mockSessionManager } from '../helpers/index.js';

vi.mock('openai', () => {
  return {
    default: class OpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'ok' } }],
          }),
        },
      };
      embeddings = {
        create: vi.fn().mockResolvedValue({ data: [{ embedding: [] }] }),
      };
    },
  };
});


// Mock Session Manager
vi.mock('../../src/session/manager.js', () => ({
  getSessionManager: async () => mockSessionManager
}));

describe('conversation contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  it('returns deterministic capability summary without tool loop', async () => {
    const session = createMockSession();
    const response = await processMessage('what can you do?', session);

    expect(response.intent).toBe('capability_summary');
    expect(response.text).toContain('*What I can do for you right now*');
    expect(response.telemetry?.totalToolCalls).toBe(0);
  });

  it('persists user response preference updates from natural language', async () => {
    const session = createMockSession();
    const response = await processMessage('be brief and direct with fewer emojis', session);

    expect(response.intent).toBe('status');
    expect(response.text).toContain('*Response preferences updated*');
    expect(session.metadata.responsePreferences).toEqual({
      detail: 'brief',
      tone: 'direct',
      emoji: 'low',
    });
    expect(mockSessionManager.updateSession).toHaveBeenCalled();
  });

  it('applies persisted preferences on subsequent capability responses', async () => {
    const session = createMockSession();
    session.metadata.responsePreferences = {
      detail: 'brief',
      tone: 'direct',
      emoji: 'low',
    };

    const response = await processMessage('what can you do?', session);
    expect(response.text).toContain('*Capabilities*');
    expect(response.text).not.toContain('Research docs/web content');
  });

  it('returns deterministic tool inventory with grouped categories', async () => {
    const session = createMockSession();
    const response = await processMessage('what tools do you have?', session);

    expect(response.intent).toBe('tool_inventory');
    expect(response.text).toContain('*Tool Inventory*');
    expect(response.text).toContain('*Workflow & Runtime*');
  });
});
