import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processMessage } from '../../src/agent/core.js';
import { createMockSession } from '../helpers/mock-session.js';
// import { TaskStatus } from '../../src/task/types.js';

// Mock OpenAI
vi.mock('openai', () => {
  return {
    default: class OpenAI {
      chat = {
        completions: {
          create: vi.fn()
           // First call: Request Tool Call
           .mockResolvedValueOnce({
              choices: [{
                message: {
                  content: null,
                  tool_calls: [{
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'task_create',
                      arguments: JSON.stringify({ goal: 'Create test.txt' })
                    }
                  }]
                }
              }]
           })
           // Second call: Final response
           .mockResolvedValueOnce({
              choices: [{ message: { content: "Task created successfully." } }]
           })
        }
      };
      embeddings = {
        create: vi.fn().mockResolvedValue({ data: [{ embedding: [] }] })
      };
    }
  }
});

// Mock Task Manager
const mockTask = {
  id: 'task-123',
  status: 'completed',
  goal: 'Create test.txt',
  steps: []
};

const mockTaskManager = {
  createTask: vi.fn().mockResolvedValue(mockTask),
  getTask: vi.fn().mockReturnValue(mockTask),
  updateTask: vi.fn(),
  listTasks: vi.fn().mockReturnValue([mockTask]),
  getTaskQueue: vi.fn().mockReturnValue([])
};

vi.mock('../../src/task/manager.js', () => ({
  getTaskManager: () => mockTaskManager
}));

// Mock Tools
const mockTaskCreateHandler = vi.fn().mockImplementation(async (args) => {
    await mockTaskManager.createTask(args);
    return { success: true, metadata: { taskId: 'task-123' } };
});

vi.mock('../../src/tools/registry.js', () => ({
    getToolRegistry: () => ({
        matchTools: () => [],
        getToolsPayload: () => [],
        toOpenAIFormat: () => [],
        get: (name: string) => {
            if (name === 'task_create') {
                return {
                    name: 'task_create',
                    handler: mockTaskCreateHandler
                };
            }
            return undefined;
        },
        execute: async (name: string, args: Record<string, unknown>) => {
             if (name === 'task_create') {
                 const result = await mockTaskCreateHandler(args);
                 return { success: true, output: JSON.stringify(result), ...result };
             }
             return { success: false, output: "Tool not found" };
        }
    })
}));


// Mock Session Manager
const mockSessionManager = {
  init: vi.fn(),
  getSession: vi.fn(),
  updateSession: vi.fn(),
  saveMessage: vi.fn(),
  getRecentMessages: vi.fn().mockResolvedValue([]),
};

vi.mock('../../src/session/manager.js', () => ({
  getSessionManager: () => mockSessionManager
}));

// Mock Intent Classifier to force TASK intent
vi.mock('../../src/agent/intent.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as Record<string, unknown>,
    classifyIntent: vi.fn().mockReturnValue({
      type: 'action',
      confidence: 0.95,
      metadata: { goal: 'Create test.txt' }
    })
  };
});

describe('E2E: Task Execution Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  afterEach(() => {
      delete process.env.OPENROUTER_API_KEY;
  });

  it('should initiate a task when task intent is detected', async () => {
    const session = createMockSession();
    const result = await processMessage('Create a file named test.txt', session);
    console.log('Test Result:', JSON.stringify(result, null, 2));

    // Verify TaskManager was called
    expect(mockTaskManager.createTask).toHaveBeenCalled();
    expect(result.text).toContain('Task created successfully');
  });
});
