import { describe, expect, it } from 'vitest';
import { validateRuntimeEnvUpdates } from '../../src/config/env.js';

describe('validateRuntimeEnvUpdates', () => {
  it('accepts valid known keys', () => {
    const result = validateRuntimeEnvUpdates({
      LOG_LEVEL: 'info',
      ENABLE_BROWSER: 'true',
      AGENT_MODEL: 'openai/gpt-4o-mini',
    });
    expect(result.valid).toBe(true);
    expect(result.invalid).toEqual([]);
  });

  it('rejects unknown keys', () => {
    const result = validateRuntimeEnvUpdates({
      NOT_A_REAL_KEY: '1',
    });
    expect(result.valid).toBe(false);
    expect(result.invalid[0]?.key).toBe('NOT_A_REAL_KEY');
  });

  it('rejects invalid values for known keys', () => {
    const result = validateRuntimeEnvUpdates({
      LOG_LEVEL: 'trace',
    });
    expect(result.valid).toBe(false);
    expect(result.invalid[0]?.key).toBe('LOG_LEVEL');
  });
});
