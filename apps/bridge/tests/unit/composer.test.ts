import { describe, expect, it } from 'vitest';
import { composeWhatsAppResponse } from '../../src/agent/composer.js';

describe('composer', () => {
  it('renders summary with severity emoji', () => {
    const out = composeWhatsAppResponse({
      kind: 'status',
      severity: 'success',
      mode: 'conversational',
      emojiLevel: 'normal',
      summary: 'Workspace is clean on main',
    });
    expect(out).toContain('✅');
    expect(out).toContain('Workspace is clean on main');
  });

  it('renders facts and ask text', () => {
    const out = composeWhatsAppResponse({
      kind: 'action_result',
      severity: 'warning',
      mode: 'conversational',
      emojiLevel: 'normal',
      title: 'Git Sync',
      summary: 'No remote configured.',
      facts: [{ label: 'Workspace', value: 'test-project' }],
      ask: 'Want me to configure publish first?',
    });
    expect(out).toContain('*Git Sync*');
    expect(out).toContain('*Workspace*: test-project');
    expect(out).toContain('Want me to configure publish first?');
  });
});

