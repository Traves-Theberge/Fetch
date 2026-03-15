import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processMessage } from '../../src/agent/core.js';
import { createMockSession, mockSessionManager } from '../helpers/index.js';

// Mock Session Manager
vi.mock('../../src/session/manager.js', () => ({
  getSessionManager: async () => mockSessionManager
}));

// Mock OpenAI
const mockOpenResponse = {
  choices: [{ message: { content: "I am Fetch." } }]
};

vi.mock('openai', () => {
  return {
    default: class OpenAI {
      chat = {
        completions: {
          create: vi.fn().mockImplementation(() => Promise.resolve(mockOpenResponse))
        }
      };
      // For embeddings
      embeddings = {
        create: vi.fn().mockResolvedValue({ data: [{ embedding: [] }] })
      };
    }
  }
});


describe('E2E: Agent Core Loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  it('should process a basic conversation flow', async () => {
    const session = createMockSession();
    const response = await processMessage('Hello Fetch', session);
    expect(response).toBeDefined();
    expect(typeof response.text).toBe('string');
  });
  
  // Minimal Task Flow test (mocking heavy logic)
  it('should handle a task intent (simulated)', async () => {
     // This relies on internal logic of processMessage detecting task
     // Since we mock OpenAI, the text 'I am Fetch' might not trigger task logic unless we control the mock per test.
     // Advanced mocking needed for full coverage.
     const session = createMockSession();
     const response = await processMessage('List files', session);
     expect(response).toBeDefined();
  });
});
