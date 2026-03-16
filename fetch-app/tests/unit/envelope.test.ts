import { describe, it, expect } from 'vitest';
import { envelopeFromToolResult } from '../../src/agent/envelope.js';
import type { ToolResult } from '../../src/tools/types.js';

describe('envelopeFromToolResult', () => {
  const baseOptions = {
    kind: 'action_result' as const,
    title: 'Test Action',
  };

  function makeResult(overrides: Partial<ToolResult> & Pick<ToolResult, 'success' | 'output'>): ToolResult {
    return { duration: 0, ...overrides };
  }

  it('produces a success envelope from a successful tool result', () => {
    const result = makeResult({
      success: true,
      output: 'Files committed.',
      summary: 'Committed 3 files',
    });

    const envelope = envelopeFromToolResult(result, {
      ...baseOptions,
      successAsk: 'Want to push?',
    });

    expect(envelope.kind).toBe('action_result');
    expect(envelope.severity).toBe('success');
    expect(envelope.summary).toBe('Committed 3 files');
    expect(envelope.ask).toBe('Want to push?');
    expect(envelope.mode).toBe('conversational');
    expect(envelope.emojiLevel).toBe('normal');
    expect(envelope.title).toBe('Test Action');
  });

  it('produces an error envelope from a failed tool result', () => {
    const result = makeResult({
      success: false,
      output: '',
      error: 'Permission denied',
    });

    const envelope = envelopeFromToolResult(result, {
      ...baseOptions,
      failureAsk: 'Try again?',
    });

    expect(envelope.kind).toBe('error');
    expect(envelope.severity).toBe('warning');
    expect(envelope.summary).toBe('Permission denied');
    expect(envelope.ask).toBe('Try again?');
  });

  it('falls back to output when summary is absent on success', () => {
    const result = makeResult({ success: true, output: 'Fallback output' });
    const envelope = envelopeFromToolResult(result, baseOptions);
    expect(envelope.summary).toBe('Fallback output');
  });

  it('falls back to output when error is absent on failure', () => {
    const result = makeResult({ success: false, output: 'Fallback error output' });
    const envelope = envelopeFromToolResult(result, baseOptions);
    expect(envelope.summary).toBe('Fallback error output');
  });

  it('falls back to default text when all fields are empty', () => {
    const successResult = makeResult({ success: true, output: '' });
    const failResult = makeResult({ success: false, output: '' });

    expect(envelopeFromToolResult(successResult, baseOptions).summary).toBe('Done.');
    expect(envelopeFromToolResult(failResult, baseOptions).summary).toBe('Operation failed.');
  });

  it('respects explicit mode override', () => {
    const result = makeResult({ success: true, output: 'ok' });
    const envelope = envelopeFromToolResult(result, {
      ...baseOptions,
      mode: 'direct',
    });
    expect(envelope.mode).toBe('direct');
  });

  it('includes rawToolRefs when rawToolRef is provided', () => {
    const result = makeResult({ success: true, output: 'ok' });
    const envelope = envelopeFromToolResult(result, {
      ...baseOptions,
      rawToolRef: 'workspace_status',
    });
    expect(envelope.rawToolRefs).toEqual(['workspace_status']);
  });

  it('omits rawToolRefs when rawToolRef is not provided', () => {
    const result = makeResult({ success: true, output: 'ok' });
    const envelope = envelopeFromToolResult(result, baseOptions);
    expect(envelope.rawToolRefs).toBeUndefined();
  });
});
