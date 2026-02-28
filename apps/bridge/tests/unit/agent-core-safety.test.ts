import { describe, expect, it } from 'vitest';
import { __testing } from '../../src/agent/core.js';

describe('agent core safety helpers', () => {
  it('redacts sensitive keys recursively before persistence', () => {
    const input = {
      token: 'abc123',
      apiKey: 'key123',
      nested: {
        password: 'pw',
        keep: 'ok',
      },
      arr: [
        { clientSecret: 'secret', safe: 'value' },
        'plain',
      ],
    };

    const result = __testing.sanitizeForPersistence(input) as Record<string, unknown>;
    expect(result.token).toBe('[REDACTED]');
    expect(result.apiKey).toBe('[REDACTED]');
    expect((result.nested as Record<string, unknown>).password).toBe('[REDACTED]');
    expect((result.nested as Record<string, unknown>).keep).toBe('ok');
    expect(((result.arr as unknown[])[0] as Record<string, unknown>).clientSecret).toBe('[REDACTED]');
    expect(((result.arr as unknown[])[0] as Record<string, unknown>).safe).toBe('value');
    expect((result.arr as unknown[])[1]).toBe('plain');
  });

  it('bounds tool call budget by session maxIterations with sane floor', () => {
    const fromInvalid = __testing.resolveMaxToolCallsForTurn(undefined);
    expect(fromInvalid).toBeGreaterThan(0);

    expect(__testing.resolveMaxToolCallsForTurn(1)).toBe(1);
    expect(__testing.resolveMaxToolCallsForTurn(0)).toBe(1);
    expect(__testing.resolveMaxToolCallsForTurn(-3)).toBe(1);
    expect(__testing.resolveMaxToolCallsForTurn(9999)).toBeLessThanOrEqual(fromInvalid);
  });

  it('sanitizes user-facing errors by redacting secrets, paths, and stack frames', () => {
    const raw = [
      'Request failed token=sk_test_123456789012345678901234567890',
      ' at /workspace/private/secret/file.ts:12',
      '\n    at doThing (/workspace/private/secret/file.ts:12:1)',
    ].join('');

    const out = __testing.sanitizeErrorForUser(new Error(raw));
    expect(out).toContain('[redacted]');
    expect(out).toContain('[path]');
    expect(out).not.toContain('at doThing');
    expect(out.length).toBeLessThanOrEqual(203);
  });

  it('classifies retriable vs non-retriable errors with HTTP/network semantics', () => {
    const e429 = Object.assign(new Error('rate limited'), { status: 429 });
    const e400 = Object.assign(new Error('bad request'), { status: 400 });
    const e401 = Object.assign(new Error('unauthorized'), { status: 401 });
    const e500 = Object.assign(new Error('server'), { status: 500 });
    const eNet = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });

    expect(__testing.isRetriableError(e429, 1)).toBe(true);
    expect(__testing.isRetriableError(e400, 1)).toBe(true);
    expect(__testing.isRetriableError(e400, 2)).toBe(false);
    expect(__testing.isRetriableError(e401, 1)).toBe(false);
    expect(__testing.isRetriableError(e500, 1)).toBe(true);
    expect(__testing.isRetriableError(eNet, 1)).toBe(true);
  });

  it('sanitizes rewritten progress text and falls back on invalid outputs', () => {
    const fallback = 'Working on it';
    expect(__testing.sanitizeProgressRewrite('  "Nice work"  ', fallback)).toBe('Nice work');
    expect(__testing.sanitizeProgressRewrite('first. second.', fallback)).toBe(fallback);
    expect(__testing.sanitizeProgressRewrite('', fallback)).toBe(fallback);
    expect(__testing.sanitizeProgressRewrite('x'.repeat(121), fallback)).toBe(fallback);
  });

  it('selects minimal prompt mode for short conversational messages', () => {
    expect(__testing.selectPromptMode('hi')).toBe('minimal');
    expect(__testing.selectPromptMode('what can you do?')).toBe('minimal');
    expect(__testing.selectPromptMode('create a new api project')).toBe('full');
  });

  it('derives durable notes from preferences and workflow actions', () => {
    const notes = __testing.deriveDurableNotes(
      'I prefer fast responses. remember this.',
      'Completed setup',
      ['workflow_create', 'cron_create']
    );
    expect(notes.some((n: string) => n.includes('User prefers'))).toBe(true);
    expect(notes.some((n: string) => n.includes('automate a repeatable flow'))).toBe(true);
    expect(notes.some((n: string) => n.includes('schedule workflow automation'))).toBe(true);
  });
});
