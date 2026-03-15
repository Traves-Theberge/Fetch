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

vi.mock('../../src/transcription/index.js', () => ({
  transcribeAudio: vi.fn().mockResolvedValue({ text: 'transcribed text', language: 'en' }),
  isTranscriptionAvailable: vi.fn().mockReturnValue(true),
}));

// Mock telegraf
const mockTelegramStart = vi.fn().mockResolvedValue(undefined);
const mockTelegramStop = vi.fn().mockResolvedValue(undefined);
const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 42 });
const mockGetMe = vi.fn().mockResolvedValue({ id: 999, username: 'fetchbot' });
const mockGetFileLink = vi.fn().mockResolvedValue({ href: 'https://api.telegram.org/file/test.ogg' });
const mockOn = vi.fn();
const mockCommand = vi.fn();

vi.mock('telegraf', () => ({
  Telegraf: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.start = mockTelegramStart;
    this.stop = mockTelegramStop;
    this.on = mockOn;
    this.command = mockCommand;
    this.telegram = {
      sendMessage: mockSendMessage,
      getMe: mockGetMe,
      getFileLink: mockGetFileLink,
    };
    this.botInfo = undefined;
  }),
}));

const { TelegramBridge } = await import('../../src/bridge/telegram/index.js');

describe('TelegramBridge', () => {
  let bridge: InstanceType<typeof TelegramBridge>;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new TelegramBridge({
      token: 'test-bot-token',
      allowedChatIds: ['12345', '67890'],
    });
  });

  it('has channel type telegram', () => {
    expect(bridge.channel).toBe('telegram');
  });

  it('starts not ready', () => {
    expect(bridge.isReady()).toBe(false);
  });

  it('initializes and becomes ready', async () => {
    await bridge.initialize();
    expect(bridge.isReady()).toBe(true);
    expect(mockGetMe).toHaveBeenCalled();
    expect(mockTelegramStart).toHaveBeenCalled();
    expect(mockOn).toHaveBeenCalledWith('text', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('voice', expect.any(Function));
    expect(mockCommand).toHaveBeenCalledWith('start', expect.any(Function));
  });

  it('sends messages via Telegram API', async () => {
    await bridge.initialize();
    const id = await bridge.sendMessage('12345', 'Hello', { replyToMessageId: 10 });
    expect(id).toBe('42');
    expect(mockSendMessage).toHaveBeenCalledWith('12345', 'Hello', {
      parse_mode: 'HTML',
      reply_to_message_id: 10,
    });
  });

  it('returns null when sending before initialization', async () => {
    const result = await bridge.sendMessage('12345', 'Hello');
    expect(result).toBeNull();
  });

  it('destroys cleanly', async () => {
    await bridge.initialize();
    expect(bridge.isReady()).toBe(true);
    await bridge.destroy();
    expect(bridge.isReady()).toBe(false);
    expect(mockTelegramStop).toHaveBeenCalledWith('SIGTERM');
  });

  it('handles send errors gracefully', async () => {
    await bridge.initialize();
    mockSendMessage.mockRejectedValueOnce(new Error('network error'));
    const result = await bridge.sendMessage('12345', 'Hello');
    expect(result).toBeNull();
  });
});
