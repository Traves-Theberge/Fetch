import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, validateEnv, validateRuntimeEnvUpdates } from '../../src/config/env.js';

describe('config/env', () => {
  const saved: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string | undefined) {
    if (!(key in saved)) saved[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    // Clear saved entries
    for (const key of Object.keys(saved)) delete saved[key];
  });

  // ─── env proxy ─────────────────────────────────────────────────────

  describe('env proxy', () => {
    it('reads live values from process.env', () => {
      setEnv('WORKSPACE_ROOT', '/custom/path');
      expect(env.WORKSPACE_ROOT).toBe('/custom/path');
    });

    it('falls back to defaults when env var is unset', () => {
      setEnv('WORKSPACE_ROOT', undefined);
      expect(env.WORKSPACE_ROOT).toBe('/workspace');
    });

    it('falls back to defaults when env var is empty string', () => {
      setEnv('LOG_LEVEL', '');
      expect(env.LOG_LEVEL).toBe('debug');
    });

    it('returns undefined for keys without defaults when unset', () => {
      setEnv('ADMIN_TOKEN', undefined);
      expect(env.ADMIN_TOKEN).toBeUndefined();
    });
  });

  // ─── validateEnv ──────────────────────────────────────────────────

  describe('validateEnv', () => {
    it('returns valid when required env vars are present', () => {
      setEnv('OPENROUTER_API_KEY', 'sk-test-key');
      setEnv('OWNER_PHONE_NUMBER', '+1234567890');
      const result = validateEnv();
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('returns invalid with missing keys when required vars are absent', () => {
      setEnv('OPENROUTER_API_KEY', undefined);
      setEnv('OWNER_PHONE_NUMBER', undefined);
      const result = validateEnv();
      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });
  });

  // ─── validateRuntimeEnvUpdates ────────────────────────────────────

  describe('validateRuntimeEnvUpdates', () => {
    it('accepts valid known keys', () => {
      const result = validateRuntimeEnvUpdates({
        LOG_LEVEL: 'info',
        WORKSPACE_ROOT: '/workspace/new',
      });
      expect(result.valid).toBe(true);
      expect(result.invalid).toEqual([]);
    });

    it('rejects unknown environment keys', () => {
      const result = validateRuntimeEnvUpdates({
        MADE_UP_KEY: 'value',
      });
      expect(result.valid).toBe(false);
      expect(result.invalid).toEqual([
        { key: 'MADE_UP_KEY', reason: 'Unknown environment key' },
      ]);
    });

    it('rejects invalid values for known keys', () => {
      const result = validateRuntimeEnvUpdates({
        LOG_LEVEL: 'verbose', // not in enum
      });
      expect(result.valid).toBe(false);
      expect(result.invalid.length).toBe(1);
      expect(result.invalid[0].key).toBe('LOG_LEVEL');
    });

    it('reports multiple invalid entries', () => {
      const result = validateRuntimeEnvUpdates({
        UNKNOWN_A: 'x',
        UNKNOWN_B: 'y',
      });
      expect(result.invalid.length).toBe(2);
    });
  });
});
