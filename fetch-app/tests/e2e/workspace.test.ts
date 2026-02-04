/**
 * @fileoverview E2E Workspace Management Tests
 */

import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../../src/agent/intent.js';
import { createMockSession, createMockProject } from '../helpers/mock-session.js';

describe('E2E: Workspace Management', () => {
  describe('Workspace Listing', () => {
    it('should classify workspace listing requests', () => {
      const session = createMockSession();
      
      const listRequests = [
        'list projects',
        'show workspaces',
        'which projects',
        'what workspaces',
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
        currentProject: createMockProject('my-project'),
      });
      
      const statusRequests = [
        'status',
        'git status',
        'show me the status',
        'get status',
      ];

      for (const request of statusRequests) {
        const intent = classifyIntent(request, session);
        expect(intent.type).toBe('workspace');
      }
    });

    it('should handle status with active workspace', () => {
      const session = createMockSession({
        currentProject: createMockProject('active-project'),
      });

      const intent = classifyIntent('show status', session);
      expect(intent.type).toBe('workspace');
    });
  });

  describe('Current Workspace Context', () => {
    it('should preserve workspace context in session', () => {
      const currentProject = createMockProject('test-project');
      const session = createMockSession({ currentProject });

      expect(session.currentProject).toBeDefined();
      expect(session.currentProject?.name).toBe('test-project');
      expect(session.currentProject?.path).toBe('/workspace/test-project');
    });
  });
});
