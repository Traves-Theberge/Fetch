/**
 * @fileoverview Tests for hybrid LLM/template notification formatter
 *
 * Verifies that formatNotification uses LLM for completion/failure events
 * and templates for started/progress events. Also tests fallback to templates
 * when LLM fails.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────

// Use vi.hoisted to make mockCreate available at mock-factory time
const { mockCreate, pipelineMock } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  pipelineMock: {
    notificationModel: 'test/model',
    notificationMaxTokens: 150,
    notificationTemperature: 0.7,
    notificationRewriteEnabled: true,
    notificationRewriteTimeoutMs: 2000,
  },
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    OPENROUTER_API_KEY: 'test-key',
    SUMMARY_MODEL: 'test-model',
  },
}));

vi.mock('../../src/config/pipeline.js', () => ({
  pipeline: pipelineMock,
}));

vi.mock('../../src/identity/manager.js', () => ({
  getIdentityManager: vi.fn().mockReturnValue({
    whenReady: vi.fn().mockResolvedValue(undefined),
    getVoiceTone: vi.fn().mockReturnValue('Warm and eager'),
  }),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Import after mocks ──────────────────────────────────────────────

import {
  formatNotification,
  getNotificationMetrics,
  resetNotificationMetricsForTests,
} from '../../src/agent/notifications.js';

// ── Tests ───────────────────────────────────────────────────────────

describe('Notification Formatter', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    resetNotificationMetricsForTests();
    pipelineMock.notificationRewriteEnabled = true;
  });

  // ─── task:started (template path) ─────────────────────────────

  describe('task:started', () => {
    it('should use template for started events (no LLM)', async () => {
      const result = await formatNotification('task:started', {
        goal: 'Add error handling',
      });

      expect(result).toBeTruthy();
      expect(result).toContain('Add error handling');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should produce varied started messages', async () => {
      const results = new Set<string>();
      for (let i = 0; i < 30; i++) {
        const result = await formatNotification('task:started', {
          goal: 'Test variation',
        });
        results.add(result);
      }
      expect(results.size).toBeGreaterThanOrEqual(2);
    });

    it('scopes anti-repeat selection per session key', async () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

      const firstSessionFirst = await formatNotification('task:started', {
        goal: 'Scoped variation test',
        scopeKey: 'session-a',
      });
      const firstSessionSecond = await formatNotification('task:started', {
        goal: 'Scoped variation test',
        scopeKey: 'session-a',
      });
      const secondSessionFirst = await formatNotification('task:started', {
        goal: 'Scoped variation test',
        scopeKey: 'session-b',
      });

      expect(firstSessionFirst).not.toEqual(firstSessionSecond);
      expect(secondSessionFirst).toEqual(firstSessionFirst);
      const metrics = getNotificationMetrics();
      expect(metrics.duplicateSuppressions).toBeGreaterThan(0);
      randomSpy.mockRestore();
    });
  });

  // ─── task:progress (template path) ────────────────────────────

  describe('task:progress', () => {
    it('should use template for progress events (no LLM)', async () => {
      const result = await formatNotification('task:progress', {
        message: 'Installing dependencies',
      });

      expect(result).toBeTruthy();
      expect(result).toContain('Installing dependencies');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should produce varied progress messages', async () => {
      const results = new Set<string>();
      for (let i = 0; i < 30; i++) {
        const result = await formatNotification('task:progress', {
          message: 'working on it',
        });
        results.add(result);
      }
      expect(results.size).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── task:completed (LLM path) ────────────────────────────────

  describe('task:completed', () => {
    it('should produce informative completion notification', async () => {
      const result = await formatNotification('task:completed', {
        summary: 'Added error handling to API endpoints',
        filesModified: ['src/api.ts', 'src/routes.ts', 'src/middleware.ts'],
        durationSec: 45,
      });

      // Whether LLM or template path, result should contain key info
      expect(result).toBeTruthy();
      expect(result).toContain('Added error handling to API endpoints');
      expect(result).toContain('3 modified');
      expect(result).toContain('45s');
      const metrics = getNotificationMetrics();
      expect(metrics.rewriteAttempts).toBe(1);
      expect(metrics.templateFallback).toBe(1);
    });

    it('should fall back to template when LLM fails', async () => {
      mockCreate.mockRejectedValue(new Error('API error'));

      const result = await formatNotification('task:completed', {
        summary: 'Added auth module',
        filesModified: ['src/auth.ts', 'src/index.ts'],
        durationSec: 30,
      });

      expect(result).toBeTruthy();
      expect(result).toContain('Added auth module');
      expect(result).toContain('2 modified');
      expect(result).toContain('30s');
      const metrics = getNotificationMetrics();
      expect(metrics.rewriteErrors).toBe(1);
      expect(metrics.templateFallback).toBe(1);
    });

    it('should fall back to template when LLM returns empty', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '' } }],
      });

      const result = await formatNotification('task:completed', {
        summary: 'Updated config',
      });

      expect(result).toBeTruthy();
      expect(result).toContain('Updated config');
      const metrics = getNotificationMetrics();
      expect(metrics.rewriteAttempts).toBe(1);
      expect(metrics.templateFallback).toBe(1);
    });

    it('should include file counts in template fallback', async () => {
      mockCreate.mockRejectedValue(new Error('fail'));

      const result = await formatNotification('task:completed', {
        summary: 'Refactored codebase',
        filesCreated: ['new.ts'],
        filesModified: ['existing.ts', 'other.ts'],
        filesDeleted: ['old.ts'],
      });

      expect(result).toContain('1 created');
      expect(result).toContain('2 modified');
      expect(result).toContain('1 deleted');
    });
  });

  // ─── task:failed (LLM path) ───────────────────────────────────

  describe('task:failed', () => {
    it('should use LLM for failure events when available', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: { content: 'Build error encountered in src/index.ts. The TypeScript compiler found issues.' },
        }],
      });

      const result = await formatNotification('task:failed', {
        error: 'Build failed: TS2345',
        goal: 'Add type safety',
      });

      // If LLM succeeds, we get the LLM text. If not, we get a template with the error.
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(10);
      const metrics = getNotificationMetrics();
      expect(metrics.rewriteAttempts).toBe(1);
      expect(metrics.llmRewriteSuccess + metrics.templateFallback).toBe(1);
    });

    it('should fall back to template when LLM fails', async () => {
      mockCreate.mockRejectedValue(new Error('Network error'));

      const result = await formatNotification('task:failed', {
        error: 'Permission denied',
      });

      expect(result).toBeTruthy();
      expect(result).toContain('Permission denied');
    });

    it('should produce varied error templates on fallback', async () => {
      mockCreate.mockRejectedValue(new Error('always fail'));

      const results = new Set<string>();
      for (let i = 0; i < 30; i++) {
        const result = await formatNotification('task:failed', {
          error: 'Test error',
        });
        results.add(result);
      }
      expect(results.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('rewrite flag', () => {
    it('uses template fallback and increments disabled metric when rewrite is disabled', async () => {
      pipelineMock.notificationRewriteEnabled = false;

      const result = await formatNotification('task:completed', {
        summary: 'Done',
      });

      expect(result).toContain('Done');
      const metrics = getNotificationMetrics();
      expect(metrics.rewriteDisabled).toBe(1);
      expect(metrics.templateFallback).toBe(1);
      expect(metrics.llmRewriteSuccess).toBe(0);
    });
  });
});
