/**
 * @fileoverview Mock Harness for Testing
 *
 * Provides a mock harness executor for testing without actual CLI calls.
 */

import type { HarnessResult, HarnessStatus } from '../../src/harness/types.js';

interface MockResponse {
  status: HarnessStatus;
  output: string;
  exitCode: number;
  delay?: number;
  filesModified?: string[];
}

/**
 * Mock harness executor for testing
 */
export class MockHarnessExecutor {
  public calls: Array<{ goal: string; workspace: string; agent: string }> = [];
  private responseQueue: Array<MockResponse | Error> = [];
  private questionHandler?: (question: string) => string;

  /**
   * Queue a successful response
   */
  queueResponse(response: MockResponse): void {
    this.responseQueue.push(response);
  }

  /**
   * Queue an error response
   */
  queueError(error: Error): void {
    this.responseQueue.push(error);
  }

  /**
   * Set handler for questions
   */
  onQuestion(handler: (question: string) => string): void {
    this.questionHandler = handler;
  }

  /**
   * Mock execute method
   */
  async execute(
    agent: string,
    goal: string,
    workspace: string
  ): Promise<HarnessResult> {
    this.calls.push({ goal, workspace, agent });

    const response = this.responseQueue.shift();
    if (!response) {
      throw new Error('No mock response queued');
    }

    if (response instanceof Error) {
      throw response;
    }

    if (response.delay) {
      await new Promise((r) => setTimeout(r, response.delay));
    }

    return {
      id: `hrn_mock${Date.now()}` as `hrn_${string}`,
      taskId: `tsk_mock${Date.now()}` as `tsk_${string}`,
      agent: agent as 'claude' | 'gemini' | 'copilot',
      status: response.status,
      output: response.output,
      exitCode: response.exitCode,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: response.delay ?? 100,
      filesModified: response.filesModified ?? [],
    };
  }

  /**
   * Reset mock state
   */
  cleanup(): void {
    this.calls = [];
    this.responseQueue = [];
    this.questionHandler = undefined;
  }

  /**
   * Get call count
   */
  get callCount(): number {
    return this.calls.length;
  }

  /**
   * Get last call
   */
  get lastCall(): { goal: string; workspace: string; agent: string } | undefined {
    return this.calls[this.calls.length - 1];
  }
}

/**
 * Create a mock harness with pre-configured responses
 */
export function createMockHarness(): MockHarnessExecutor {
  return new MockHarnessExecutor();
}
