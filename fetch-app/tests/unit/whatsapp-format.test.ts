import { describe, expect, it } from 'vitest';

import { formatForWhatsApp } from '../../src/agent/whatsapp-format.js';

describe('formatForWhatsApp', () => {
  it('converts collapsed markdown bullets and bold markers into WhatsApp-friendly output', () => {
    const input = [
      'I can assist with:',
      '- **Workspace Management**: Create and manage projects. - **Task Delegation**: Assign coding tasks.',
    ].join('\n');

    const output = formatForWhatsApp(input);

    expect(output).toContain('• *Workspace Management*:');
    expect(output).toContain('• *Task Delegation*:');
    expect(output).not.toContain('**Workspace Management**');
    expect(output).not.toContain('**Task Delegation**');
  });

  it('normalizes markdown headers and numbered lists', () => {
    const input = [
      '## Capabilities',
      '1. First item',
      '2. Second item',
    ].join('\n');

    const output = formatForWhatsApp(input);

    expect(output).toContain('📋 *Capabilities*');
    expect(output).toContain('• First item');
    expect(output).toContain('• Second item');
  });
});
