import { describe, expect, it } from 'vitest';

import {
  buildOutputConstraints,
  classifyIntent,
  shouldUseMinimalMode,
  wantsFullInventory,
} from '../../src/agent/response-policy.js';

describe('response policy', () => {
  it('classifies capability and inventory asks', () => {
    expect(classifyIntent('what can you do?')).toBe('capability_summary');
    expect(classifyIntent('what tools do you have?')).toBe('tool_inventory');
    expect(classifyIntent('show full tool list')).toBe('tool_inventory');
  });

  it('keeps action requests out of minimal mode', () => {
    const intent = classifyIntent('run tests and push');
    expect(intent).toBe('action_request');
    expect(shouldUseMinimalMode(intent)).toBe(false);
  });

  it('detects explicit full inventory requests', () => {
    expect(wantsFullInventory('show full tool list')).toBe(true);
    expect(wantsFullInventory('list all commands')).toBe(true);
    expect(wantsFullInventory('what tools do you have?')).toBe(false);
  });

  it('returns stable output constraints for key intents', () => {
    expect(buildOutputConstraints('capability_summary')).toContain('immediate action option');
    expect(buildOutputConstraints('tool_inventory')).toContain('Grouped bullet list');
  });
});
