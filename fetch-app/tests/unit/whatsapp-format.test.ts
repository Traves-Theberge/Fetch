import { describe, expect, it } from 'vitest';

import {
  formatAndChunkForWhatsApp,
  formatForWhatsApp,
  getWhatsAppFormatMetrics,
  resetWhatsAppFormatMetrics,
} from '../../src/agent/whatsapp-format.js';

describe('formatForWhatsApp', () => {
  it('tracks normalization metrics', () => {
    resetWhatsAppFormatMetrics();
    formatForWhatsApp('## Header');
    expect(getWhatsAppFormatMetrics().normalizedCount).toBe(1);
  });

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

  it('chunks long tool inventory style messages into multiple payloads', () => {
    resetWhatsAppFormatMetrics();
    const input = [
      '*Tool Inventory*',
      '',
      ...Array.from({ length: 320 }, (_, i) => `• tool_${i + 1}`),
      '',
      'Ask "show full tool list" if you want every command name.',
    ].join('\n');

    const chunks = formatAndChunkForWhatsApp(input, 'tool_inventory');

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toContain('*Tool Inventory*');
    expect(chunks.join('\n')).toContain('show full tool list');
    expect(getWhatsAppFormatMetrics().chunkedCount).toBe(1);
  });
});
