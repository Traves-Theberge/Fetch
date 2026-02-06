/**
 * @fileoverview E2E Conversation Flow Tests
 *
 * Tests conversation routing and handling.
 */

import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../../src/agent/intent.js';
import { createMockSession } from '../helpers/mock-session.js';

describe('E2E: Conversation Flow', () => {
  describe('Greeting Handling', () => {
    it('should route greetings to conversation handler', () => {
      const session = createMockSession();
      
      const greetings = [
        'hi',
        'hello',
        'hey there',
        'good morning',
        'hi fetch',
      ];

      for (const greeting of greetings) {
        const intent = classifyIntent(greeting, session);
        expect(intent.type).toBe('conversation');
        expect(intent.confidence).toBeGreaterThanOrEqual(0.6);
      }
    });
  });

  describe('Help Requests', () => {
    it('should handle help requests', () => {
      const session = createMockSession();
      
      const helpRequests = [
        'help',
        'what can you do',
        'show me commands',
      ];

      for (const request of helpRequests) {
        const intent = classifyIntent(request, session);
        expect(intent.type).toBe('conversation');
      }
    });
  });

  describe('Thank You Messages', () => {
    it('should handle thanks gracefully', () => {
      const session = createMockSession();
      
      const thanks = [
        'thanks',
        'thank you',
        'awesome, thanks!',
        'perfect',
        'great job',
      ];

      for (const thank of thanks) {
        const intent = classifyIntent(thank, session);
        expect(intent.type).toBe('conversation');
      }
    });
  });

  describe('Goodbye Messages', () => {
    it('should handle farewells', () => {
      const session = createMockSession();
      
      const farewells = ['bye', 'goodbye', 'see ya', 'later'];

      for (const farewell of farewells) {
        const intent = classifyIntent(farewell, session);
        expect(intent.type).toBe('conversation');
      }
    });
  });

  describe('Ambiguous Messages', () => {
    it('should handle short ambiguous messages as conversation', () => {
      const session = createMockSession();
      
      const ambiguous = ['ok', 'sure', 'yes', 'no', 'maybe'];

      for (const msg of ambiguous) {
        const intent = classifyIntent(msg, session);
        expect(intent.type).toBe('conversation');
        expect(['short_message', 'conversation_reactions']).toContain(intent.reason);
      }
    });
  });
});
