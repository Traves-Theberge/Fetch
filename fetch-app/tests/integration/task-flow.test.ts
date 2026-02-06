/**
 * @fileoverview E2E Task Flow Tests
 *
 * Tests the full task lifecycle from user message to completion.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockSession, createMockProject } from '../helpers/mock-session.js';
import { MockHarnessExecutor } from '../helpers/mock-harness.js';

// Mock the harness executor
vi.mock('../../src/harness/executor.js', () => ({
  HarnessExecutor: vi.fn().mockImplementation(() => new MockHarnessExecutor()),
}));

describe('E2E: Task Flow', () => {
  let mockExecutor: MockHarnessExecutor;

  beforeEach(() => {
    mockExecutor = new MockHarnessExecutor();
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockExecutor.cleanup();
  });

  describe('Happy Path', () => {
    it('should complete a coding task successfully', async () => {
      const _session = createMockSession({
        currentProject: createMockProject('my-project'),
      });

      // Queue successful response
      mockExecutor.queueResponse({
        status: 'completed',
        output: 'Created src/dark-mode.ts\nDone.',
        exitCode: 0,
        filesModified: ['src/dark-mode.ts'],
      });

      // Execute task
      const result = await mockExecutor.execute(
        'claude',
        'Add dark mode toggle',
        '/workspace/my-project'
      );

      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
      expect(mockExecutor.callCount).toBe(1);
      expect(mockExecutor.lastCall?.goal).toBe('Add dark mode toggle');
    });

    it('should handle task with file modifications', async () => {
      mockExecutor.queueResponse({
        status: 'completed',
        output: 'Modified 3 files',
        exitCode: 0,
        filesModified: ['src/app.ts', 'src/styles.css', 'src/config.ts'],
      });

      const result = await mockExecutor.execute(
        'claude',
        'Refactor app module',
        '/workspace/project'
      );

      expect(result.status).toBe('completed');
      expect(result.filesModified).toHaveLength(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle harness failure', async () => {
      mockExecutor.queueResponse({
        status: 'failed',
        output: 'Error: Could not parse file',
        exitCode: 1,
      });

      const result = await mockExecutor.execute(
        'claude',
        'Fix broken code',
        '/workspace/project'
      );

      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(1);
    });

    it('should handle thrown errors', async () => {
      mockExecutor.queueError(new Error('Connection timeout'));

      await expect(
        mockExecutor.execute('claude', 'Do something', '/workspace')
      ).rejects.toThrow('Connection timeout');
    });

    it('should track multiple consecutive errors', async () => {
      // Queue 3 errors
      for (let i = 0; i < 3; i++) {
        mockExecutor.queueError(new Error(`Error ${i + 1}`));
      }

      for (let i = 0; i < 3; i++) {
        await expect(
          mockExecutor.execute('claude', `Task ${i}`, '/workspace')
        ).rejects.toThrow();
      }

      expect(mockExecutor.callCount).toBe(3);
    });
  });

  describe('Task Timeout', () => {
    it('should handle delayed responses', async () => {
      mockExecutor.queueResponse({
        status: 'completed',
        output: 'Done after delay',
        exitCode: 0,
        delay: 100, // 100ms delay
      });

      const start = Date.now();
      const result = await mockExecutor.execute(
        'claude',
        'Slow task',
        '/workspace'
      );
      const duration = Date.now() - start;

      expect(result.status).toBe('completed');
      expect(duration).toBeGreaterThanOrEqual(90); // allow ~10ms timer jitter
    });
  });

  describe('Multiple Harnesses', () => {
    it('should track calls to different harnesses', async () => {
      mockExecutor.queueResponse({
        status: 'completed',
        output: 'Claude done',
        exitCode: 0,
      });
      mockExecutor.queueResponse({
        status: 'completed',
        output: 'Gemini done',
        exitCode: 0,
      });

      await mockExecutor.execute('claude', 'Task 1', '/workspace');
      await mockExecutor.execute('gemini', 'Task 2', '/workspace');

      expect(mockExecutor.callCount).toBe(2);
      expect(mockExecutor.calls[0].agent).toBe('claude');
      expect(mockExecutor.calls[1].agent).toBe('gemini');
    });
  });
});
