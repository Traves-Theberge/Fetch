/**
 * @fileoverview Command Parser Tests — Safety Gate
 *
 * Tests for the v4.0 safety-gate parser. Only 5 escape-hatch commands
 * are intercepted; everything else passes through to the LLM.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSession } from '../helpers/mock-session.js';
import type { Session } from '../../src/session/types.js';

// ---------- stubs for heavy dependencies that shouldn't run in unit tests ----------

vi.mock('../../src/handler/index.js', () => ({
  initializeHandler: vi.fn(),
  handleMessage: vi.fn(),
  shutdown: vi.fn(),
}));

vi.mock('../../src/task/manager.js', () => ({
  getTaskManager: vi.fn(() => ({
    getRunningTask: vi.fn(() => null),
    hasRunningTask: vi.fn(() => false),
  })),
}));

// Import after mocks
const { parseCommand } = await import('../../src/commands/parser.js');

// ---------- helpers ----------

function mockSessionManager() {
  return {
    updateSession: vi.fn(),
    getSession: vi.fn(),
    createSession: vi.fn(),
    getAllSessions: vi.fn(() => []),
    setAutonomyLevel: vi.fn(),
    setPreference: vi.fn(),
    updatePreferences: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ---------- tests ----------

describe('Command Parser — Safety Gate', () => {
  let session: Session;
  let sm: ReturnType<typeof mockSessionManager>;

  beforeEach(() => {
    session = createMockSession();
    sm = mockSessionManager();
  });

  // ─── Pass-through behaviour ────────────────────────────────────────

  it('should pass non-slash messages through to LLM', async () => {
    const result = await parseCommand('hello world', session, sm);
    expect(result.handled).toBe(false);
    expect(result.shouldProcess).toBe(true);
  });

  it('should pass unknown /commands through to LLM (not error)', async () => {
    const result = await parseCommand('/foobar', session, sm);
    expect(result.handled).toBe(false);
    expect(result.shouldProcess).toBe(true);
  });

  it('should pass former legacy commands through to LLM', async () => {
    for (const cmd of ['/verbose', '/autocommit', '/mode', '/project', '/files', '/add foo', '/remind test', '/schedule list', '/cron list', '/trust', '/identity', '/skill', '/clone repo', '/diff', '/log']) {
      const result = await parseCommand(cmd, session, sm);
      expect(result.handled).toBe(false);
      expect(result.shouldProcess).toBe(true);
    }
  });

  // ─── Help ──────────────────────────────────────────────────────────

  it('should handle /help', async () => {
    const result = await parseCommand('/help', session, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.length).toBeGreaterThan(0);
  });

  it('should handle /h alias', async () => {
    const result = await parseCommand('/h', session, sm);
    expect(result.handled).toBe(true);
  });

  it('should handle /? alias', async () => {
    const result = await parseCommand('/?', session, sm);
    expect(result.handled).toBe(true);
  });

  // ─── Status ────────────────────────────────────────────────────────

  it('should handle /status', async () => {
    const result = await parseCommand('/status', session, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.length).toBeGreaterThan(0);
  });

  it('should handle /st alias', async () => {
    const result = await parseCommand('/st', session, sm);
    expect(result.handled).toBe(true);
  });

  // ─── Version ───────────────────────────────────────────────────────

  it('should handle /version', async () => {
    const result = await parseCommand('/version', session, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('Fetch');
    expect(result.responses?.[0]).toContain('v4.1.1');
  });

  // ─── Task Control ──────────────────────────────────────────────────

  it('should handle /stop with no running task', async () => {
    const result = await parseCommand('/stop', session, sm);
    expect(result.handled).toBe(true);
  });

  it('should handle /cancel as /stop alias', async () => {
    const result = await parseCommand('/cancel', session, sm);
    expect(result.handled).toBe(true);
  });

  // ─── Clear ─────────────────────────────────────────────────────────

  it('should handle /clear and wipe session state', async () => {
    session.messages = [{ id: 'msg_1', role: 'user', content: 'hello', timestamp: new Date().toISOString() }];
    session.activeFiles = ['foo.ts'];
    const result = await parseCommand('/clear', session, sm);
    expect(result.handled).toBe(true);
    expect(session.messages).toEqual([]);
    expect(session.activeFiles).toEqual([]);
    expect(sm.updateSession).toHaveBeenCalled();
  });

  it('should handle /reset as /clear alias', async () => {
    const result = await parseCommand('/reset', session, sm);
    expect(result.handled).toBe(true);
  });

  // ─── Undo ──────────────────────────────────────────────────────────

  it('should handle /undo', async () => {
    const result = await parseCommand('/undo', session, sm);
    expect(result.handled).toBe(true);
  });

  it('should handle /undo all', async () => {
    const result = await parseCommand('/undo all', session, sm);
    expect(result.handled).toBe(true);
  });
});
