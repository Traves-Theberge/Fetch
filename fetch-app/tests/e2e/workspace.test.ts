/**
 * @fileoverview E2E Workspace Management Tests
 */

import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../../src/agent/intent.js';
import { createMockSession, createMockWorkspace } from '../helpers/mock-session.js';

describe('E2E: Workspace Management', () => {
  describe('Workspace Listing', () => {
    it('should classify workspace listing requests', () => {
      const session = createMockSession();
      
      const listRequests = [
        'list projects',
        'show workspaces',
        'what projects do I have',
        'my projects',
      ];

      for (const request of listRequests) {
        const intent = classifyIntent(request, session);
        expect(intent.type).toBe('workspace');
      }
    });
  });

  describe('Workspace Selection', () => {
    it('should classify workspace selection requests', () => {
      const session = createMockSession();
      
      const selectRequests = [
        'switch to my-project',
        'use fetch',
        'work on api-server',
        'select the web-app project',
      ];

      for (const request of selectRequests) {
        const intent = classifyIntent(request, session);
        expect(intent.type).toBe('workspace');
      }
    });
  });

  describe('Workspace Status', () => {
    it('should classify status requests', () => {
      const session = createMockSession({
        workspace: createMockWorkspace('my-project'),
      });
      
      const statusRequests = [
        'status',
        'git status',
        'what changes',
        'current branch',
      ];

      for (const request of statusRequests) {
        const intent = classifyIntent(request, session);
        expect(intent.type).toBe('workspace');
      }
    });

    it('should handle status with active workspace', () => {
      const session = createMockSession({
        workspace: createMockWorkspace('active-project'),
      });

      const intent = classifyIntent('show status', session);
      expect(intent.type).toBe('workspace');
    });
  });

  describe('Current Workspace Context', () => {
    it('should preserve workspace context in session', () => {
      const workspace = createMockWorkspace('test-project');
      const session = createMockSession({ workspace });

      expect(session.workspace).toBeDefined();
      expect(session.workspace?.name).toBe('test-project');
      expect(session.workspace?.path).toBe('/workspace/test-project');
    });
  });
});
