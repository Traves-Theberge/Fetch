import { describe, it, expect, vi } from 'vitest';
import { handlePM } from '../../src/commands/pm.js';
import type { Session } from '../../src/session/types.js';

vi.mock('../../src/tools/pm.js', () => ({
  handlePMList: vi.fn().mockResolvedValue({ output: 'task-1\ntask-2' }),
  handlePMView: vi.fn().mockResolvedValue({ output: 'Task detail' }),
  handlePMComment: vi.fn().mockResolvedValue({ output: 'Comment added' }),
  handlePMUpdate: vi.fn().mockResolvedValue({ output: 'Status updated' }),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

const stubSession = {} as Session;

describe('handlePM', () => {
  it('returns usage when no subcommand given', async () => {
    const result = await handlePM('', stubSession);
    expect(result.handled).toBe(true);
    expect(result.responses[0]).toContain('Usage');
  });

  it('rejects missing provider', async () => {
    const result = await handlePM('list', stubSession);
    expect(result.responses[0]).toContain('specify a provider');
  });

  it('rejects invalid provider', async () => {
    const result = await handlePM('list foobar', stubSession);
    expect(result.responses[0]).toContain('specify a provider');
  });

  it('handles list subcommand', async () => {
    const result = await handlePM('list linear', stubSession);
    expect(result.handled).toBe(true);
    expect(result.responses[0]).toBe('task-1\ntask-2');
  });

  it('handles ls alias', async () => {
    const result = await handlePM('ls github', stubSession);
    expect(result.handled).toBe(true);
    expect(result.responses[0]).toBe('task-1\ntask-2');
  });

  it('handles view subcommand', async () => {
    const result = await handlePM('view jira PROJ-1', stubSession);
    expect(result.handled).toBe(true);
    expect(result.responses[0]).toBe('Task detail');
  });

  it('returns usage when view missing taskId', async () => {
    const result = await handlePM('view linear', stubSession);
    expect(result.responses[0]).toContain('Usage');
  });

  it('handles comment subcommand', async () => {
    const result = await handlePM('comment github ISSUE-5 looks good', stubSession);
    expect(result.handled).toBe(true);
    expect(result.responses[0]).toBe('Comment added');
  });

  it('returns usage when comment missing body', async () => {
    const result = await handlePM('comment linear PROJ-1', stubSession);
    expect(result.responses[0]).toContain('Usage');
  });

  it('handles update subcommand', async () => {
    const result = await handlePM('update jira PROJ-1 done', stubSession);
    expect(result.handled).toBe(true);
    expect(result.responses[0]).toBe('Status updated');
  });

  it('returns usage when update missing status', async () => {
    const result = await handlePM('update linear PROJ-1', stubSession);
    expect(result.responses[0]).toContain('Usage');
  });

  it('returns error for unknown subcommand', async () => {
    const result = await handlePM('destroy github', stubSession);
    expect(result.responses[0]).toContain('Unknown subcommand');
  });
});
