import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before importing the module
vi.mock('../../src/utils/logger.js', () => ({
  logger: { section: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../src/security/index.js', () => ({
  SecurityGate: { create: vi.fn().mockResolvedValue({ shutdown: vi.fn() }) },
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

// Mock @slack/bolt
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn().mockResolvedValue(undefined);
const mockPostMessage = vi.fn().mockResolvedValue({ ts: '1234567890.123456' });
const mockUploadV2 = vi.fn().mockResolvedValue(undefined);
const mockEvent = vi.fn();

vi.mock('@slack/bolt', () => ({
  App: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.start = mockStart;
    this.stop = mockStop;
    this.event = mockEvent;
    this.client = {
      chat: { postMessage: mockPostMessage },
      files: { uploadV2: mockUploadV2 },
    };
  }),
}));

const { SlackBridge } = await import('../../src/bridge/slack/index.js');

describe('SlackBridge', () => {
  let bridge: InstanceType<typeof SlackBridge>;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new SlackBridge({
      botToken: 'xoxb-test-token',
      appToken: 'xapp-test-token',
      signingSecret: 'test-secret',
    });
  });

  it('has channel type slack', () => {
    expect(bridge.channel).toBe('slack');
  });

  it('starts not ready', () => {
    expect(bridge.isReady()).toBe(false);
  });

  it('initializes and becomes ready', async () => {
    await bridge.initialize();
    expect(bridge.isReady()).toBe(true);
    expect(mockStart).toHaveBeenCalled();
    expect(mockEvent).toHaveBeenCalledWith('app_mention', expect.any(Function));
    expect(mockEvent).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('sends messages via Slack API', async () => {
    await bridge.initialize();
    const ts = await bridge.sendMessage('C12345', 'Hello', { threadTs: '111.222' });
    expect(ts).toBe('1234567890.123456');
    expect(mockPostMessage).toHaveBeenCalledWith({
      channel: 'C12345',
      text: 'Hello',
      thread_ts: '111.222',
    });
  });

  it('returns null when sending before initialization', async () => {
    const result = await bridge.sendMessage('C12345', 'Hello');
    expect(result).toBeNull();
  });

  it('uploads files via Slack API', async () => {
    await bridge.initialize();
    await bridge.sendFile('C12345', 'file content', 'output.txt', '111.222');
    expect(mockUploadV2).toHaveBeenCalledWith({
      channel_id: 'C12345',
      content: 'file content',
      filename: 'output.txt',
      thread_ts: '111.222',
    });
  });

  it('destroys cleanly', async () => {
    await bridge.initialize();
    expect(bridge.isReady()).toBe(true);
    await bridge.destroy();
    expect(bridge.isReady()).toBe(false);
    expect(mockStop).toHaveBeenCalled();
  });

  it('handles send errors gracefully', async () => {
    await bridge.initialize();
    mockPostMessage.mockRejectedValueOnce(new Error('network error'));
    const result = await bridge.sendMessage('C12345', 'Hello');
    expect(result).toBeNull();
  });
});
