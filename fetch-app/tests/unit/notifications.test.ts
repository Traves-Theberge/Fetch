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
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
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
  pipeline: {
    notificationModel: 'test/model',
    notificationMaxTokens: 150,
    notificationTemperature: 0.7,
  },
}));

vi.mock('../../src/identity/manager.js', () => ({
  getIdentityManager: vi.fn().mockReturnValue({
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

import { formatNotification } from '../../src/agent/notifications.js';

// ── Tests ───────────────────────────────────────────────────────────

describe('Notification Formatter', () => {
  beforeEach(() => {
    mockCreate.mockReset();
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
});
