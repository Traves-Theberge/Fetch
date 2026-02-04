/**
 * @fileoverview Intent Classification Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../../src/agent/intent.js';
import { createMockSession } from '../helpers/mock-session.js';

describe('Intent Classification', () => {
  describe('Conversation Intent', () => {
    it('should classify greetings as conversation', () => {
      const session = createMockSession();
      
      const greetings = ['hi', 'hello', 'hey', 'good morning', 'howdy'];
      
      for (const greeting of greetings) {
        const result = classifyIntent(greeting, session);
        expect(result.type).toBe('conversation');
        expect(result.confidence).toBeGreaterThanOrEqual(0.6);
      }
    });

    it('should classify thanks as conversation', () => {
      const session = createMockSession();
      
      const thanks = ['thanks', 'thank you', 'ty', 'cheers', 'appreciate it'];
      
      for (const thank of thanks) {
        const result = classifyIntent(thank, session);
        expect(result.type).toBe('conversation');
      }
    });

    it('should classify short ambiguous messages as conversation', () => {
      const session = createMockSession();
      
      const result = classifyIntent('ok', session);
      expect(result.type).toBe('conversation');
      expect(result.reason).toBe('conversation_reactions');
    });
  });

  describe('Workspace Intent', () => {
    it('should classify project listing requests', () => {
      const session = createMockSession();
      
      const requests = [
        'list projects',
        'show workspaces',
        'what projects',
        'which workspaces',
      ];
      
      for (const request of requests) {
        const result = classifyIntent(request, session);
        expect(result.type).toBe('workspace');
      }
    });

    it('should classify workspace selection', () => {
      const session = createMockSession();
      
      const selections = [
        'switch to my-project',
        'use the fetch workspace',
        'work on api-server',
      ];
      
      for (const selection of selections) {
        const result = classifyIntent(selection, session);
        expect(result.type).toBe('workspace');
      }
    });

    it('should classify status requests', () => {
      const session = createMockSession();
      
      const result = classifyIntent('show me the status', session);
      expect(result.type).toBe('workspace');
    });
  });

  describe('Task Intent', () => {
    it('should classify coding requests as task', () => {
      const session = createMockSession();
      
      const tasks = [
        'add dark mode toggle',
        'fix the login bug',
        'create a new component',
        'refactor the auth module',
        'implement user registration',
      ];
      
      for (const task of tasks) {
        const result = classifyIntent(task, session);
        expect(result.type).toBe('task');
      }
    });

    it('should classify file operations as task', () => {
      const session = createMockSession();
      
      const result = classifyIntent('update the config.ts file', session);
      expect(result.type).toBe('task');
    });

    it('should fall back to conversation for ambiguous long messages', () => {
      const session = createMockSession();
      
      const result = classifyIntent(
        'I need you to look at the authentication flow and make improvements',
        session
      );
      expect(result.type).toBe('conversation');
      expect(result.reason).toBe('fallback_will_clarify');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty messages', () => {
      const session = createMockSession();
      
      const result = classifyIntent('', session);
      expect(result.type).toBe('conversation');
    });

    it('should handle whitespace-only messages', () => {
      const session = createMockSession();
      
      const result = classifyIntent('   ', session);
      expect(result.type).toBe('conversation');
    });

    it('should be case insensitive', () => {
      const session = createMockSession();
      
      const result1 = classifyIntent('HELLO', session);
      const result2 = classifyIntent('hello', session);
      
      expect(result1.type).toBe(result2.type);
    });
  });
});
