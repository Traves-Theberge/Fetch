import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  logger: { section: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../src/security/index.js', () => ({
  RateLimiter: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.isAllowed = vi.fn().mockResolvedValue(true);
    this.shutdown = vi.fn();
  }),
  validateInput: vi.fn((text: string) => ({ valid: true, sanitized: text })),
}));

vi.mock('../../src/handler/index.js', () => ({
  handleMessage: vi.fn().mockResolvedValue(['Test response']),
  registerChannelSender: vi.fn(),
}));

vi.mock('../../src/config/pipeline.js', () => ({
  pipeline: { rateLimitMax: 10, rateLimitWindow: 60000 },
}));

vi.mock('../../src/agent/channel-format.js', () => ({
  formatTextForChannel: vi.fn((text: string) => text),
}));

// Mock discord.js
const mockLogin = vi.fn().mockResolvedValue('token');
const mockClientDestroy = vi.fn().mockResolvedValue(undefined);
const mockChannelSend = vi.fn().mockResolvedValue({ id: 'msg-123' });
const mockChannelFetch = vi.fn().mockResolvedValue({ send: mockChannelSend });
const mockClientOn = vi.fn();
const mockClientOnce = vi.fn();

vi.mock('discord.js', () => ({
  Client: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.login = mockLogin;
    this.destroy = mockClientDestroy;
    this.on = mockClientOn;
    this.once = mockClientOnce;
    this.user = { id: 'bot-123', username: 'fetchbot', tag: 'fetchbot#0001' };
    this.channels = { fetch: mockChannelFetch };
  }),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    DirectMessages: 8,
  },
}));

const { DiscordBridge } = await import('../../src/bridge/discord/index.js');

describe('DiscordBridge', () => {
  let bridge: InstanceType<typeof DiscordBridge>;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new DiscordBridge({
      token: 'test-discord-token',
      allowedRoles: ['admin', 'dev'],
      allowedChannels: ['chan-1'],
    });
  });

  it('has channel type discord', () => {
    expect(bridge.channel).toBe('discord');
  });

  it('starts not ready', () => {
    expect(bridge.isReady()).toBe(false);
  });

  it('initializes and registers event handlers', async () => {
    await bridge.initialize();
    expect(mockLogin).toHaveBeenCalledWith('test-discord-token');
    expect(mockClientOnce).toHaveBeenCalledWith('ready', expect.any(Function));
    expect(mockClientOn).toHaveBeenCalledWith('messageCreate', expect.any(Function));
  });

  it('sends messages via Discord API', async () => {
    await bridge.initialize();
    const id = await bridge.sendMessage('chan-1', 'Hello');
    expect(id).toBe('msg-123');
    expect(mockChannelFetch).toHaveBeenCalledWith('chan-1');
    expect(mockChannelSend).toHaveBeenCalledWith('Hello');
  });

  it('returns null when sending before initialization', async () => {
    const result = await bridge.sendMessage('chan-1', 'Hello');
    expect(result).toBeNull();
  });

  it('chunks long messages over 2000 chars', async () => {
    await bridge.initialize();
    const longText = 'A'.repeat(3000);
    vi.mocked((await import('../../src/agent/channel-format.js')).formatTextForChannel).mockReturnValueOnce(longText);
    await bridge.sendMessage('chan-1', longText);
    // Should have been sent in multiple chunks
    expect(mockChannelSend).toHaveBeenCalledTimes(2);
  });

  it('returns null when channel not found', async () => {
    await bridge.initialize();
    mockChannelFetch.mockResolvedValueOnce(null);
    const result = await bridge.sendMessage('nonexistent', 'Hello');
    expect(result).toBeNull();
  });

  it('destroys cleanly', async () => {
    await bridge.initialize();
    await bridge.destroy();
    expect(bridge.isReady()).toBe(false);
    expect(mockClientDestroy).toHaveBeenCalled();
  });

  it('handles send errors gracefully', async () => {
    await bridge.initialize();
    mockChannelFetch.mockRejectedValueOnce(new Error('network error'));
    const result = await bridge.sendMessage('chan-1', 'Hello');
    expect(result).toBeNull();
  });
});
