/**
 * @fileoverview Command Parser Tests — Safety Gate
 *
 * Tests for the safety-gate parser. Only deterministic slash commands
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

const mockHandleWorkspaceList = vi.fn();
const mockHandleWorkspaceStatus = vi.fn();
const mockHandleWorkspaceSync = vi.fn();

vi.mock('../../src/tools/workspace.js', () => ({
  handleWorkspaceList: (...args: unknown[]) => mockHandleWorkspaceList(...args),
  handleWorkspaceStatus: (...args: unknown[]) => mockHandleWorkspaceStatus(...args),
  handleWorkspaceSync: (...args: unknown[]) => mockHandleWorkspaceSync(...args),
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
    mockHandleWorkspaceList.mockReset();
    mockHandleWorkspaceStatus.mockReset();
    mockHandleWorkspaceSync.mockReset();
  });

  // ─── Pass-through behaviour ────────────────────────────────────────

  it('should pass non-slash messages through to LLM', async () => {
    const result = await parseCommand('hello world', session, sm);
    expect(result.handled).toBe(false);
    expect(result.shouldProcess).toBe(true);
  });

  it('should pass natural-language capability questions through to LLM', async () => {
    const result = await parseCommand('what can you do?', session, sm);
    expect(result.handled).toBe(false);
    expect(result.shouldProcess).toBe(true);
  });

  it('should deterministically handle natural-language status', async () => {
    mockHandleWorkspaceStatus.mockResolvedValue({ success: true, output: 'test-project - on main', duration: 1 });
    const result = await parseCommand('status', session, sm);
    expect(result.handled).toBe(true);
    expect(result.envelopes?.[0]?.summary).toContain('test-project');
    expect(mockHandleWorkspaceStatus).toHaveBeenCalledWith({});
  });

  it('should deterministically handle natural-language workspace listing', async () => {
    mockHandleWorkspaceList.mockResolvedValue({ success: true, output: '1 workspace: test-project', duration: 1 });
    const result = await parseCommand('what workspaces do i have', session, sm);
    expect(result.handled).toBe(true);
    expect(result.envelopes?.[0]?.summary).toContain('1 workspace');
    expect(mockHandleWorkspaceList).toHaveBeenCalledWith({});
  });

  it('should deterministically handle natural-language commit/push requests', async () => {
    mockHandleWorkspaceSync.mockResolvedValue({ success: true, output: 'Pushed changes to GitHub', duration: 1 });
    const result = await parseCommand('lets commit the changes and push', session, sm);
    expect(result.handled).toBe(true);
    expect(result.envelopes?.[0]?.summary).toContain('Pushed changes');
    expect(mockHandleWorkspaceSync).toHaveBeenCalledWith({ message: 'chore: sync changes via fetch' });
  });

  it('should pass unknown /commands through to LLM (not error)', async () => {
    const result = await parseCommand('/foobar', session, sm);
    expect(result.handled).toBe(false);
    expect(result.shouldProcess).toBe(true);
  });

  it('should pass former legacy commands through to LLM', async () => {
    for (const cmd of ['/verbose', '/autocommit', '/mode', '/project', '/files', '/add foo', '/remind test', '/schedule list', '/cron list', '/identity', '/skill', '/clone repo', '/diff', '/log']) {
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
    expect(result.responses?.[0]).toMatch(/v\d+\.\d+\.\d+/);
    expect(result.responses?.[0]).not.toContain('vv');
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

  // ─── Usage ─────────────────────────────────────────────────────────

  it('should handle /usage', async () => {
    const result = await parseCommand('/usage', session, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.length).toBeGreaterThan(0);
  });

  it('should handle /u alias', async () => {
    const result = await parseCommand('/u', session, sm);
    expect(result.handled).toBe(true);
  });

  // ─── Trust (owner only) ────────────────────────────────────────────

  it('should handle /trust list for owner', async () => {
    const ownerSession = createMockSession({ userId: `${process.env.OWNER_PHONE_NUMBER}@c.us` });
    const result = await parseCommand('/trust list', ownerSession, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('Trusted Numbers');
  });

  it('should handle /trust add for owner', async () => {
    const ownerSession = createMockSession({ userId: `${process.env.OWNER_PHONE_NUMBER}@c.us` });
    const result = await parseCommand('/trust add 15551234567', ownerSession, sm);
    expect(result.handled).toBe(true);
  });

  it('should reject /trust from non-owner', async () => {
    const nonOwnerSession = createMockSession({ userId: '19999999999@c.us' });
    const result = await parseCommand('/trust list', nonOwnerSession, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('Only the owner');
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
