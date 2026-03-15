import { describe, expect, it } from 'vitest';
import type { MessageBridge, InboundMessage, ChannelType } from '../../src/bridge/interface.js';

describe('bridge/interface types', () => {
  it('InboundMessage can represent a WhatsApp message', () => {
    const msg: InboundMessage = {
      id: 'msg-123',
      channel: 'whatsapp',
      senderId: '15551234567@c.us',
      body: '@fetch hello',
      fromMe: false,
    };
    expect(msg.channel).toBe('whatsapp');
    expect(msg.body).toBe('@fetch hello');
  });

  it('InboundMessage can represent a Slack message', () => {
    const msg: InboundMessage = {
      id: 'slack-msg-456',
      channel: 'slack',
      senderId: 'U12345678',
      body: 'hello fetch',
      fromMe: false,
      metadata: { threadTs: '1234567890.123456', channelId: 'C12345' },
    };
    expect(msg.channel).toBe('slack');
    expect(msg.metadata?.threadTs).toBe('1234567890.123456');
  });

  it('InboundMessage can represent a Telegram message', () => {
    const msg: InboundMessage = {
      id: 'tg-789',
      channel: 'telegram',
      senderId: '123456789',
      body: '/fetch status',
      fromMe: false,
    };
    expect(msg.channel).toBe('telegram');
  });

  it('InboundMessage can represent a Discord message', () => {
    const msg: InboundMessage = {
      id: 'discord-101',
      channel: 'discord',
      senderId: '98765432101234567',
      body: '@fetch deploy',
      fromMe: false,
      metadata: { guildId: '12345', channelId: '67890' },
    };
    expect(msg.channel).toBe('discord');
  });

  it('ChannelType covers all supported channels', () => {
    const channels: ChannelType[] = ['whatsapp', 'slack', 'telegram', 'discord'];
    expect(channels).toHaveLength(4);
  });

  it('MessageBridge interface can be satisfied by a mock', () => {
    const mock: MessageBridge = {
      channel: 'slack',
      initialize: async () => {},
      destroy: async () => {},
      sendMessage: async () => null,
      isReady: () => true,
    };
    expect(mock.channel).toBe('slack');
    expect(mock.isReady()).toBe(true);
  });
});
