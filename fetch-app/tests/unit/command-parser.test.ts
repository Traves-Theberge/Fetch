/**
 * @fileoverview Command Parser Tests
 *
 * Tests for the slash-command router and individual handler modules.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSession, createMockProject } from '../helpers/mock-session.js';
import type { Session } from '../../src/session/types.js';

// ---------- stubs for heavy dependencies that shouldn't run in unit tests ----------

// Stub the handler module (index.ts) so it doesn't try to boot the real agent
vi.mock('../../src/handler/index.js', () => ({
  initializeHandler: vi.fn(),
  handleMessage: vi.fn(),
  shutdown: vi.fn(),
}));

// Stub task manager / store (SQLite)
vi.mock('../../src/task/manager.js', () => ({
  getTaskManager: vi.fn(() => ({
    getRunningTask: vi.fn(() => null),
    hasRunningTask: vi.fn(() => false),
  })),
}));

// Stub identity manager
vi.mock('../../src/identity/manager.js', () => ({
  getIdentityManager: vi.fn(() => ({
    getIdentity: vi.fn(() => ({ name: 'Fetch', personality: {} })),
    getSkills: vi.fn(() => []),
  })),
}));

// Stub proactive commands (no scheduler in unit tests)
vi.mock('../../src/proactive/commands.js', () => ({
  handleRemindCommand: vi.fn(async (args: string) => `Remind: ${args}`),
  handleScheduleCommand: vi.fn(async () => 'Schedule list'),
  handleCronList: vi.fn(async () => 'No scheduled jobs active.'),
  handleCronRemove: vi.fn(async (id: string) => `Removed ${id}`),
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

describe('Command Parser — Router', () => {
  let session: Session;
  let sm: ReturnType<typeof mockSessionManager>;

  beforeEach(() => {
    session = createMockSession();
    sm = mockSessionManager();
  });

  // Non-command messages pass through
  it('should pass non-slash messages through', async () => {
    const result = await parseCommand('hello world', session, sm);
    expect(result.handled).toBe(false);
    expect(result.shouldProcess).toBe(true);
  });

  // Unknown command
  it('should return error for unknown command', async () => {
    const result = await parseCommand('/foobar', session, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('Unknown command');
  });

  // Help
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

  // Status
  it('should handle /status', async () => {
    const result = await parseCommand('/status', session, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.length).toBeGreaterThan(0);
  });

  // Version
  it('should handle /version', async () => {
    const result = await parseCommand('/version', session, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('Fetch');
  });

  // Settings
  it('should handle /verbose toggle', async () => {
    const result = await parseCommand('/verbose', session, sm);
    expect(result.handled).toBe(true);
    expect(sm.updatePreferences).toHaveBeenCalled();
  });

  it('should handle /autocommit toggle', async () => {
    const result = await parseCommand('/autocommit', session, sm);
    expect(result.handled).toBe(true);
    expect(sm.updatePreferences).toHaveBeenCalled();
  });

  it('should handle /auto toggle', async () => {
    const result = await parseCommand('/auto', session, sm);
    expect(result.handled).toBe(true);
    expect(sm.setAutonomyLevel).toHaveBeenCalled();
  });

  // Mode
  it('should show current mode when /mode has no args', async () => {
    const result = await parseCommand('/mode', session, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('Current mode');
  });

  it('should set mode when /mode has arg', async () => {
    const result = await parseCommand('/mode autonomous', session, sm);
    expect(result.handled).toBe(true);
    expect(sm.setAutonomyLevel).toHaveBeenCalled();
  });

  // Project — no project selected
  it('should show "no project" when /project with no selection', async () => {
    const result = await parseCommand('/project', session, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('No project selected');
  });

  // Project — with project selected
  it('should show project info when /project with selection', async () => {
    session.currentProject = createMockProject('my-proj');
    const result = await parseCommand('/project', session, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('my-proj');
  });

  // Context management
  it('should handle /files', async () => {
    const result = await parseCommand('/files', session, sm);
    expect(result.handled).toBe(true);
  });

  it('should handle /clear', async () => {
    const result = await parseCommand('/clear', session, sm);
    expect(result.handled).toBe(true);
  });

  // Proactive commands
  it('should handle /remind', async () => {
    const result = await parseCommand('/remind deploy in 10m', session, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('Remind');
  });

  it('should handle /schedule', async () => {
    const result = await parseCommand('/schedule list', session, sm);
    expect(result.handled).toBe(true);
  });

  it('should handle /cron list', async () => {
    const result = await parseCommand('/cron list', session, sm);
    expect(result.handled).toBe(true);
  });

  it('should handle /cron remove', async () => {
    const result = await parseCommand('/cron remove job_123', session, sm);
    expect(result.handled).toBe(true);
    expect(result.responses?.[0]).toContain('Removed');
  });

  // Task control (no running task)
  it('should handle /stop with no running task', async () => {
    const result = await parseCommand('/stop', session, sm);
    expect(result.handled).toBe(true);
  });

  it('should handle /pause with no running task', async () => {
    const result = await parseCommand('/pause', session, sm);
    expect(result.handled).toBe(true);
  });

  it('should handle /resume with no running task', async () => {
    const result = await parseCommand('/resume', session, sm);
    expect(result.handled).toBe(true);
  });

  // Aliases
  it('should handle /cancel as /stop alias', async () => {
    const result = await parseCommand('/cancel', session, sm);
    expect(result.handled).toBe(true);
  });

  it('should handle /continue as /resume alias', async () => {
    const result = await parseCommand('/continue', session, sm);
    expect(result.handled).toBe(true);
  });

  it('should handle /st as /status alias', async () => {
    const result = await parseCommand('/st', session, sm);
    expect(result.handled).toBe(true);
  });

  it('should handle /ls as /projects alias', async () => {
    const result = await parseCommand('/ls', session, sm);
    expect(result.handled).toBe(true);
  });
});
