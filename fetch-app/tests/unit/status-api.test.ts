import { describe, expect, it } from 'vitest';
import { getStatus, isValidSessionId } from '../../src/api/status.js';

describe('Status API Session ID Validation', () => {
  it('accepts alphanumeric, underscore, and hyphen ids', () => {
    expect(isValidSessionId('abc123')).toBe(true);
    expect(isValidSessionId('ses_abc-123')).toBe(true);
    expect(isValidSessionId('A_B-C_9')).toBe(true);
  });

  it('rejects invalid or unsafe ids', () => {
    expect(isValidSessionId('')).toBe(false);
    expect(isValidSessionId('abc/123')).toBe(false);
    expect(isValidSessionId('abc..123')).toBe(false);
    expect(isValidSessionId('abc 123')).toBe(false);
  });

  it('includes notification telemetry in status payload', () => {
    const status = getStatus();
    expect(status.notificationMetrics).toBeDefined();
    expect(typeof status.notificationMetrics.total).toBe('number');
    expect(status.responseFormattingMetrics).toBeDefined();
    expect(typeof status.responseFormattingMetrics.normalizedCount).toBe('number');
  });
});
