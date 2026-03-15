import { describe, expect, it } from 'vitest';
import { formatForChannel, formatTextForChannel } from '../../src/agent/channel-format.js';
import type { ResponseEnvelope } from '../../src/agent/envelope.js';

const baseEnvelope: ResponseEnvelope = {
  kind: 'status',
  severity: 'success',
  mode: 'conversational',
  emojiLevel: 'normal',
  summary: 'Task completed successfully',
};

describe('channel-format', () => {
  describe('formatForChannel', () => {
    it('formats WhatsApp response via existing composer', () => {
      const chunks = formatForChannel(baseEnvelope, 'whatsapp');
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toContain('Task completed successfully');
    });

    it('formats Slack response with mrkdwn-style bold', () => {
      const envelope: ResponseEnvelope = {
        ...baseEnvelope,
        title: 'Deploy Status',
        facts: [{ label: 'Branch', value: 'main' }],
      };
      const chunks = formatForChannel(envelope, 'slack');
      expect(chunks[0]).toContain('*Deploy Status*');
      expect(chunks[0]).toContain('*Branch*: main');
    });

    it('formats Telegram response with HTML tags', () => {
      const envelope: ResponseEnvelope = {
        ...baseEnvelope,
        title: 'Build Result',
      };
      const chunks = formatForChannel(envelope, 'telegram');
      expect(chunks[0]).toContain('<b>Build Result</b>');
    });

    it('formats Discord response with markdown bold', () => {
      const envelope: ResponseEnvelope = {
        ...baseEnvelope,
        title: 'Status Update',
      };
      const chunks = formatForChannel(envelope, 'discord');
      expect(chunks[0]).toContain('**Status Update**');
    });

    it('includes ask text in all channels', () => {
      const envelope: ResponseEnvelope = {
        ...baseEnvelope,
        ask: 'Want me to continue?',
      };
      for (const channel of ['whatsapp', 'slack', 'telegram', 'discord'] as const) {
        const chunks = formatForChannel(envelope, channel);
        expect(chunks[0]).toContain('continue');
      }
    });
  });

  describe('formatTextForChannel', () => {
    it('formats plain text for Slack', () => {
      const result = formatTextForChannel('## Hello\n\nThis is **bold** text.', 'slack');
      expect(result).toContain('*Hello*');
      expect(result).toContain('*bold*');
    });

    it('formats plain text for Telegram with HTML', () => {
      const result = formatTextForChannel('## Hello\n\nUse `code` here.', 'telegram');
      expect(result).toContain('<b>Hello</b>');
      expect(result).toContain('<code>code</code>');
    });

    it('passes Discord text through with minimal changes', () => {
      const input = '## Hello\n\nThis is **bold** text.';
      const result = formatTextForChannel(input, 'discord');
      // Discord supports markdown natively, so most formatting is preserved
      expect(result).toContain('Hello');
      expect(result).toContain('bold');
    });

    it('truncates Telegram messages over 4000 chars', () => {
      const longText = 'A'.repeat(5000);
      const result = formatTextForChannel(longText, 'telegram');
      expect(result.length).toBeLessThanOrEqual(4100);
      expect(result).toContain('truncated');
    });

    it('truncates Discord messages over 2000 chars', () => {
      const longText = 'B'.repeat(3000);
      const result = formatTextForChannel(longText, 'discord');
      expect(result.length).toBeLessThanOrEqual(2050);
      expect(result).toContain('truncated');
    });

    it('escapes HTML entities in Telegram output', () => {
      const envelope: ResponseEnvelope = {
        ...baseEnvelope,
        summary: 'Use <div> and & symbols',
      };
      const chunks = formatForChannel(envelope, 'telegram');
      expect(chunks[0]).toContain('&lt;div&gt;');
      expect(chunks[0]).toContain('&amp;');
    });
  });
});
