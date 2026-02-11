/**
 * @fileoverview Tests for browser tools (browser_open, browser_snapshot, browser_action, browser_screenshot)
 *
 * Browser tools call dockerExec() to run a browser-agent.mjs script in the kennel container.
 * We mock dockerExec to test the tool handlers in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must be before handler imports) ──────────────────────────

const mockDockerExec = vi.fn();
vi.mock('../../src/utils/docker.js', () => ({
  dockerExec: (...args: unknown[]) => mockDockerExec(...args),
  isKennelRunning: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../src/config/pipeline.js', () => ({
  pipeline: { browserTimeout: 30000 },
}));

// ── Imports (after mocks) ───────────────────────────────────────────

import {
  handleBrowserOpen,
  handleBrowserSnapshot,
  handleBrowserAction,
  handleBrowserScreenshot,
} from '../../src/tools/browser.js';

// ── Test Suite ──────────────────────────────────────────────────────

describe('Browser Tools', () => {
  beforeEach(() => {
    mockDockerExec.mockReset();
  });

  // ─── browser_open ─────────────────────────────────────────────

  describe('browser_open', () => {
    it('should call dockerExec with correct args for a valid URL', async () => {
      mockDockerExec.mockResolvedValue({
        exitCode: 0,
        stdout: '<snapshot>Page content</snapshot>',
        stderr: '',
        timedOut: false,
      });

      const result = await handleBrowserOpen({ url: 'https://example.com' });

      expect(result.success).toBe(true);
      expect(result.output).toBe('<snapshot>Page content</snapshot>');
      expect(result.metadata?.tool).toBe('browser_open');
      expect(result.metadata?.url).toBe('https://example.com');

      // Verify dockerExec was called with node, the script path, and a base64 payload
      expect(mockDockerExec).toHaveBeenCalledOnce();
      const [cmd, args, opts] = mockDockerExec.mock.calls[0];
      expect(cmd).toBe('node');
      expect(args[0]).toBe('/usr/local/lib/fetch-browser/browser-agent.mjs');
      expect(args[1]).toBe('--payload');

      // Decode the base64 payload and verify it contains the URL
      const payload = JSON.parse(Buffer.from(args[2], 'base64').toString());
      expect(payload.action).toBe('open');
      expect(payload.url).toBe('https://example.com');
      expect(payload.waitUntil).toBe('load'); // default
    });

    it('should return validation error for missing URL', async () => {
      const result = await handleBrowserOpen({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
      expect(mockDockerExec).not.toHaveBeenCalled();
    });

    it('should return validation error for invalid URL format', async () => {
      const result = await handleBrowserOpen({ url: 'not-a-url' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
      expect(mockDockerExec).not.toHaveBeenCalled();
    });

    it('should pass waitUntil option through to the payload', async () => {
      mockDockerExec.mockResolvedValue({
        exitCode: 0,
        stdout: 'snapshot',
        stderr: '',
        timedOut: false,
      });

      await handleBrowserOpen({ url: 'https://example.com', waitUntil: 'networkidle' });

      const [, args] = mockDockerExec.mock.calls[0];
      const payload = JSON.parse(Buffer.from(args[2], 'base64').toString());
      expect(payload.waitUntil).toBe('networkidle');
    });
  });

  // ─── browser_snapshot ─────────────────────────────────────────

  describe('browser_snapshot', () => {
    it('should call dockerExec and return the snapshot', async () => {
      const snapshotContent = '[1] heading "Page Title"\n[2] link "Home"\n[3] button "Submit"';
      mockDockerExec.mockResolvedValue({
        exitCode: 0,
        stdout: snapshotContent,
        stderr: '',
        timedOut: false,
      });

      const result = await handleBrowserSnapshot({});

      expect(result.success).toBe(true);
      expect(result.output).toBe(snapshotContent);
      expect(result.metadata?.tool).toBe('browser_snapshot');
      expect(result.duration).toBeGreaterThanOrEqual(0);

      // Verify the payload action is 'snapshot'
      const [, args] = mockDockerExec.mock.calls[0];
      const payload = JSON.parse(Buffer.from(args[2], 'base64').toString());
      expect(payload.action).toBe('snapshot');
    });
  });

  // ─── browser_action ───────────────────────────────────────────

  describe('browser_action', () => {
    it('should pass click action payload correctly', async () => {
      mockDockerExec.mockResolvedValue({
        exitCode: 0,
        stdout: 'Clicked element [5]',
        stderr: '',
        timedOut: false,
      });

      const result = await handleBrowserAction({ action: 'click', ref: 5 });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Clicked element [5]');
      expect(result.metadata?.tool).toBe('browser_action');
      expect(result.metadata?.action).toBe('click');
      expect(result.metadata?.ref).toBe(5);

      // runBrowserCommand('action', { action, ref, ... }) spreads params over
      // the initial { action: 'action' } key, so payload.action === the inner action value
      const [, args] = mockDockerExec.mock.calls[0];
      const payload = JSON.parse(Buffer.from(args[2], 'base64').toString());
      expect(payload.action).toBe('click');
      expect(payload.ref).toBe(5);
    });

    it('should pass type action with text payload', async () => {
      mockDockerExec.mockResolvedValue({
        exitCode: 0,
        stdout: 'Typed text into element [3]',
        stderr: '',
        timedOut: false,
      });

      const result = await handleBrowserAction({ action: 'type', ref: 3, text: 'Hello world' });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Typed text into element [3]');

      const [, args] = mockDockerExec.mock.calls[0];
      const payload = JSON.parse(Buffer.from(args[2], 'base64').toString());
      expect(payload.action).toBe('type');
      expect(payload.text).toBe('Hello world');
      expect(payload.ref).toBe(3);
    });

    it('should return validation error for missing action field', async () => {
      const result = await handleBrowserAction({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
      expect(mockDockerExec).not.toHaveBeenCalled();
    });

    it('should accept scroll_down action without ref', async () => {
      mockDockerExec.mockResolvedValue({
        exitCode: 0,
        stdout: 'Scrolled down',
        stderr: '',
        timedOut: false,
      });

      const result = await handleBrowserAction({ action: 'scroll_down' });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Scrolled down');
    });
  });

  // ─── browser_screenshot ───────────────────────────────────────

  describe('browser_screenshot', () => {
    it('should return base64 screenshot data', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUg==';
      mockDockerExec.mockResolvedValue({
        exitCode: 0,
        stdout: base64Data,
        stderr: '',
        timedOut: false,
      });

      const result = await handleBrowserScreenshot({});

      expect(result.success).toBe(true);
      expect(result.output).toBe(base64Data);
      expect(result.metadata?.tool).toBe('browser_screenshot');
      expect(result.duration).toBeGreaterThanOrEqual(0);

      const [, args] = mockDockerExec.mock.calls[0];
      const payload = JSON.parse(Buffer.from(args[2], 'base64').toString());
      expect(payload.action).toBe('screenshot');
    });
  });

  // ─── Error handling ───────────────────────────────────────────

  describe('error handling', () => {
    it('should return error result when dockerExec returns non-zero exit code', async () => {
      mockDockerExec.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Browser process crashed',
        timedOut: false,
      });

      const result = await handleBrowserOpen({ url: 'https://example.com' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Browser process crashed');
      expect(result.output).toBe('');
    });

    it('should return generic error when stderr is empty on failure', async () => {
      mockDockerExec.mockResolvedValue({
        exitCode: 2,
        stdout: '',
        stderr: '',
        timedOut: false,
      });

      const result = await handleBrowserSnapshot({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Browser command failed with exit code 2');
    });

    it('should handle dockerExec timeout (exit code 124)', async () => {
      mockDockerExec.mockResolvedValue({
        exitCode: 124,
        stdout: '',
        stderr: '',
        timedOut: true,
      });

      const result = await handleBrowserAction({ action: 'click', ref: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Browser command failed with exit code 124');
    });

    it('should handle dockerExec rejection (thrown error)', async () => {
      mockDockerExec.mockRejectedValue(new Error('Container not found'));

      const result = await handleBrowserScreenshot({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Container not found');
    });
  });
});
