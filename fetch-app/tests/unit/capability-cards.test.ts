import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/tools/registry.js', () => ({
  getToolRegistry: () => ({
    getTpmjsToolNames: () => [],
  }),
}));

import { buildCapabilitySummary, buildToolInventory } from '../../src/agent/capability-cards.js';

describe('capability cards', () => {
  it('builds concise capability summary with an action-oriented ending', () => {
    const text = buildCapabilitySummary();
    expect(text).toContain('*What I can do for you right now*');
    expect(text).toContain('Give me one outcome and I will execute it step by step.');
  });

  it('builds grouped short tool inventory', () => {
    const text = buildToolInventory();
    expect(text).toContain('*Tool Inventory*');
    expect(text).toContain('*Workspace*');
    expect(text).toContain('*Workflow & Runtime*');
    expect(text).toContain('show full tool list');
  });

  it('builds full inventory with explicit command names', () => {
    const text = buildToolInventory({ full: true });
    expect(text).toContain('• workspace_list');
    expect(text).toContain('• task_create');
    expect(text).toContain('• browser_test');
  });

  it('adapts capability summary to brief/direct preferences', () => {
    const text = buildCapabilitySummary({ detail: 'brief', tone: 'direct', emoji: 'low' });
    expect(text).toContain('*Capabilities*');
    expect(text).not.toContain('Research docs/web content');
  });
});
