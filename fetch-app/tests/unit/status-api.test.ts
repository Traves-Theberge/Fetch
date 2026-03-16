import { describe, expect, it, beforeEach } from 'vitest';
import {
  getStatus,
  incrementMessageCount,
  isValidSessionId,
  setLogoutCallback,
  setWhatsAppControlCallbacks,
  triggerLogout,
  triggerWhatsAppRestart,
  triggerWhatsAppStart,
  updateStatus,
} from '../../src/api/status.js';

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

  it('rejects ids with special characters', () => {
    expect(isValidSessionId('abc@123')).toBe(false);
    expect(isValidSessionId('abc#123')).toBe(false);
    expect(isValidSessionId('../etc/passwd')).toBe(false);
    expect(isValidSessionId('abc\n123')).toBe(false);
  });
});

describe('Status API status state', () => {
  it('includes notification telemetry in status payload', () => {
    const status = getStatus();
    expect(status.notificationMetrics).toBeDefined();
    expect(typeof status.notificationMetrics.total).toBe('number');
    expect(status.responseFormattingMetrics).toBeDefined();
    expect(typeof status.responseFormattingMetrics.normalizedCount).toBe('number');
  });

  it('returns computed uptime in status', () => {
    const status = getStatus();
    expect(typeof status.uptime).toBe('number');
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });

  it('returns version in status', () => {
    const status = getStatus();
    expect(typeof status.version).toBe('string');
    expect(status.version.length).toBeGreaterThan(0);
  });

  it('updateStatus merges partial fields into status', () => {
    updateStatus({ state: 'authenticated', lastError: null });
    const status = getStatus();
    expect(status.state).toBe('authenticated');
    expect(status.lastError).toBeNull();
  });

  it('updateStatus preserves unmodified fields', () => {
    updateStatus({ state: 'error', lastError: 'something broke' });
    const before = getStatus();
    updateStatus({ lastError: null });
    const after = getStatus();
    expect(after.state).toBe(before.state);
    expect(after.lastError).toBeNull();
  });

  it('incrementMessageCount increases the counter', () => {
    const before = getStatus().messageCount;
    incrementMessageCount();
    incrementMessageCount();
    const after = getStatus().messageCount;
    expect(after).toBe(before + 2);
  });
});

describe('Status API callbacks', () => {
  it('executes registered WhatsApp start/restart callbacks', async () => {
    let started = false;
    let restarted = false;
    setWhatsAppControlCallbacks({
      start: async () => { started = true; },
      restart: async () => { restarted = true; },
    });

    const startOk = await triggerWhatsAppStart();
    const restartOk = await triggerWhatsAppRestart();
    expect(startOk).toBe(true);
    expect(restartOk).toBe(true);
    expect(started).toBe(true);
    expect(restarted).toBe(true);
  });

  it('triggerWhatsAppStart returns false when no callback registered', async () => {
    setWhatsAppControlCallbacks({});
    const result = await triggerWhatsAppStart();
    expect(result).toBe(false);
  });

  it('triggerWhatsAppRestart returns false when no callback registered', async () => {
    setWhatsAppControlCallbacks({});
    const result = await triggerWhatsAppRestart();
    expect(result).toBe(false);
  });

  it('triggerWhatsAppStart returns false when callback throws', async () => {
    setWhatsAppControlCallbacks({
      start: async () => { throw new Error('start failed'); },
    });
    const result = await triggerWhatsAppStart();
    expect(result).toBe(false);
  });

  it('triggerWhatsAppRestart returns false when callback throws', async () => {
    setWhatsAppControlCallbacks({
      restart: async () => { throw new Error('restart failed'); },
    });
    const result = await triggerWhatsAppRestart();
    expect(result).toBe(false);
  });

  it('triggerLogout executes registered callback', async () => {
    let loggedOut = false;
    setLogoutCallback(async () => { loggedOut = true; });
    const result = await triggerLogout();
    expect(result).toBe(true);
    expect(loggedOut).toBe(true);
  });

  it('triggerLogout returns false when callback throws', async () => {
    setLogoutCallback(async () => { throw new Error('logout failed'); });
    const result = await triggerLogout();
    expect(result).toBe(false);
  });
});
