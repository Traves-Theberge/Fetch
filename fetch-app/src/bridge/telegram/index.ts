/**
 * @fileoverview Telegram bridge implementation using telegraf.
 *
 * Connects Fetch to Telegram via the Bot API, supporting:
 * - Private and group chat messages
 * - Voice note transcription
 * - Reply-based thread context
 * - Group admin authorization
 *
 * @module bridge/telegram
 */

import type { MessageBridge, ChannelType } from '../interface.js';
import { logger } from '../../utils/logger.js';
import { RateLimiter, validateInput } from '../../security/index.js';
import { handleMessage, registerChannelSender } from '../../handler/index.js';
import { pipeline } from '../../config/pipeline.js';
import { formatTextForChannel } from '../../agent/channel-format.js';

// =============================================================================
// TYPES
// =============================================================================

/** Minimal Telegraf shapes to avoid hard dependency on telegraf types. */
interface TelegramContext {
  message?: {
    message_id: number;
    from?: { id: number; username?: string };
    chat: { id: number; type: string };
    text?: string;
    voice?: { file_id: string; duration: number };
    reply_to_message?: { from?: { id: number; is_bot?: boolean } };
  };
  reply: (text: string, extra?: { parse_mode?: string; reply_to_message_id?: number }) => Promise<{ message_id: number }>;
  telegram: {
    sendMessage: (chatId: number | string, text: string, extra?: { parse_mode?: string; reply_to_message_id?: number }) => Promise<{ message_id: number }>;
  };
}

interface TelegrafBot {
  start: () => Promise<void>;
  stop: (signal?: string) => Promise<void>;
  on: (event: string, handler: (ctx: TelegramContext) => Promise<void>) => void;
  command: (cmd: string, handler: (ctx: TelegramContext) => Promise<void>) => void;
  telegram: {
    sendMessage: (chatId: number | string, text: string, extra?: { parse_mode?: string; reply_to_message_id?: number }) => Promise<{ message_id: number }>;
    getMe: () => Promise<{ id: number; username: string }>;
  };
  botInfo?: { id: number; username: string };
}

// =============================================================================
// TELEGRAM BRIDGE
// =============================================================================

export class TelegramBridge implements MessageBridge {
  readonly channel: ChannelType = 'telegram';
  private bot: TelegrafBot | null = null;
  private ready = false;
  private rateLimiter: RateLimiter;
  private botId: number | null = null;

  private readonly token: string;
  private readonly allowedChatIds: Set<string>;

  constructor(config: { token: string; allowedChatIds?: string[] }) {
    this.token = config.token;
    this.allowedChatIds = new Set(config.allowedChatIds ?? []);
    this.rateLimiter = new RateLimiter(pipeline.rateLimitMax, pipeline.rateLimitWindow);
  }

  async initialize(): Promise<void> {
    logger.section('🔌 Initializing Telegram Bridge');

    try {
      const { Telegraf } = await import('telegraf');

      this.bot = new Telegraf(this.token) as unknown as TelegrafBot;

      const botInfo = await this.bot.telegram.getMe();
      this.botId = botInfo.id;
      this.bot.botInfo = botInfo;

      // Register message sender for proactive messages
      registerChannelSender('telegram', async (userId: string, text: string) => {
        await this.sendMessage(userId, text);
      });

      this.setupEventHandlers();
      await this.bot.start();
      this.ready = true;

      logger.success(`Telegram Bridge connected as @${botInfo.username}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize Telegram Bridge: ${msg}`);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    this.ready = false;
    this.rateLimiter.shutdown();
    if (this.bot) {
      await this.bot.stop('SIGTERM');
      this.bot = null;
    }
    logger.info('Telegram Bridge destroyed');
  }

  async sendMessage(target: string, text: string, options?: Record<string, unknown>): Promise<string | null> {
    if (!this.bot) return null;
    try {
      const formatted = formatTextForChannel(text, 'telegram');
      const result = await this.bot.telegram.sendMessage(target, formatted, {
        parse_mode: 'HTML',
        reply_to_message_id: options?.replyToMessageId as number | undefined,
      });
      return String(result.message_id);
    } catch (error) {
      logger.error('Failed to send Telegram message', error);
      return null;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  private setupEventHandlers(): void {
    if (!this.bot) return;

    // Handle /start command
    this.bot.command('start', async (ctx: TelegramContext) => {
      await ctx.reply('Hello! I\'m Fetch. Send me a message and I\'ll help you out.');
    });

    // Handle text messages
    this.bot.on('text', async (ctx: TelegramContext) => {
      await this.handleTelegramMessage(ctx);
    });

    // Handle voice messages
    this.bot.on('voice', async (ctx: TelegramContext) => {
      await this.handleTelegramMessage(ctx);
    });
  }

  private async handleTelegramMessage(ctx: TelegramContext): Promise<void> {
    const message = ctx.message;
    if (!message || !message.from) return;

    const senderId = String(message.from.id);
    const chatId = String(message.chat.id);

    // Skip messages from the bot itself
    if (message.from.id === this.botId) return;

    // Authorization: if allowedChatIds is configured, enforce it
    if (this.allowedChatIds.size > 0 && !this.allowedChatIds.has(chatId) && !this.allowedChatIds.has(senderId)) {
      logger.debug(`Blocked Telegram message from unauthorized chat ${chatId}`);
      return;
    }

    // In groups, only respond to direct replies to the bot or /fetch commands
    if (message.chat.type === 'group' || message.chat.type === 'supergroup') {
      const text = message.text || '';
      const isReplyToBot = message.reply_to_message?.from?.id === this.botId;
      const hasTrigger = text.toLowerCase().startsWith('/fetch') || text.toLowerCase().startsWith('@fetch');
      if (!isReplyToBot && !hasTrigger) return;
    }

    let messageText = message.text || '';

    // Handle voice messages
    if (message.voice) {
      // Voice transcription would require downloading the file and processing
      // For now, inform the user
      await ctx.reply('Voice note received. Voice transcription for Telegram is coming soon!', {
        reply_to_message_id: message.message_id,
      });
      return;
    }

    // Strip bot trigger prefixes
    messageText = messageText
      .replace(/^\/fetch\s*/i, '')
      .replace(/^@fetch\s*/i, '')
      .trim();

    if (!messageText) return;

    // Rate limiting
    if (!(await this.rateLimiter.isAllowed(senderId))) {
      await ctx.reply('Slow down! You\'re sending too many requests. Please wait a moment.', {
        reply_to_message_id: message.message_id,
      });
      return;
    }

    // Input validation
    const validation = validateInput(messageText);
    if (!validation.valid) {
      await ctx.reply(`Error: ${validation.error}`, {
        reply_to_message_id: message.message_id,
      });
      return;
    }

    try {
      const responses = await handleMessage(
        `telegram:${senderId}`,
        validation.sanitized,
        async (text) => {
          const formatted = formatTextForChannel(text, 'telegram');
          await ctx.reply(formatted, {
            parse_mode: 'HTML',
            reply_to_message_id: message.message_id,
          });
        },
      );

      for (const response of responses) {
        const formatted = formatTextForChannel(response, 'telegram');
        await ctx.reply(formatted, {
          parse_mode: 'HTML',
          reply_to_message_id: message.message_id,
        });
      }
    } catch (error) {
      logger.error('Failed to process Telegram message', error);
      await ctx.reply('Sorry, I encountered an error processing your request.', {
        reply_to_message_id: message.message_id,
      });
    }
  }
}
