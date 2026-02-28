import { describe, expect, it } from 'vitest';

import {
  formatAndChunkForDiscord,
  formatForDiscord,
  getDiscordFormatMetrics,
  resetDiscordFormatMetrics,
} from '../../src/agent/discord-format.js';

describe('formatForDiscord', () => {
  it('tracks normalization metrics', () => {
    resetDiscordFormatMetrics();
    formatForDiscord('some text  with  extra  spaces');
    expect(getDiscordFormatMetrics().normalizedCount).toBe(1);
  });

  it('preserves markdown bold (no conversion needed)', () => {
    const input = 'This is **bold** text and __underline__ text';
    const output = formatForDiscord(input);

    // Discord renders markdown natively — bold should stay as-is
    expect(output).toContain('**bold**');
    expect(output).toContain('__underline__');
  });

  it('preserves markdown headers', () => {
    const input = [
      '## Capabilities',
      '### Details',
      '# Top Level',
    ].join('\n');

    const output = formatForDiscord(input);

    // Headers should remain unchanged (Discord renders them)
    expect(output).toContain('## Capabilities');
    expect(output).toContain('### Details');
    expect(output).toContain('# Top Level');
  });

  it('strips structured runtime event traces from output', () => {
    const input = [
      '{"type":"thread.started","thread_id":"abc"}',
      '{"type":"item.completed","item":{"type":"reasoning","text":"x"}}',
      'Implemented the fix and updated docs.',
    ].join('\n');

    const output = formatForDiscord(input);

    expect(output).toContain('Implemented the fix and updated docs.');
    expect(output).not.toContain('thread.started');
    expect(output).not.toContain('"item.completed"');
  });

  it('cleans excessive whitespace', () => {
    const input = 'line1\n\n\n\n\nline2';
    const output = formatForDiscord(input);
    expect(output).toBe('line1\n\nline2');
  });

  it('truncates messages beyond the Discord limit', () => {
    const input = 'x'.repeat(2100);
    const output = formatForDiscord(input);
    expect(output.length).toBeLessThanOrEqual(2000);
    expect(output).toContain('truncated');
  });

  it('chunks long messages into multiple payloads', () => {
    resetDiscordFormatMetrics();
    const input = Array.from({ length: 100 }, (_, i) => `Item ${i + 1}: description goes here`)
      .join('\n\n');

    const chunks = formatAndChunkForDiscord(input);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
    expect(getDiscordFormatMetrics().chunkedCount).toBe(1);
  });

  it('chunks tool inventory at a smaller limit', () => {
    resetDiscordFormatMetrics();
    const input = Array.from({ length: 200 }, (_, i) => `- tool_${i + 1}`)
      .join('\n\n');

    const chunks = formatAndChunkForDiscord(input, 'tool_inventory');

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1200);
    }
  });
});
