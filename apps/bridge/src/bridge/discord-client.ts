/**
 * @fileoverview Discord transport adapter for the Fetch bridge.
 *
 * Responsibilities:
 * - manage Discord.js client lifecycle (login, ready, disconnect)
 * - route inbound messages through security + handler pipeline
 * - normalize transport edge cases (duplicate events, bot self-messages)
 * - send proactive task progress/question updates back to users
 * - chunk outbound messages at the 2000-char Discord limit
 *
 * @module bridge/discord-client
 * @see {@link DiscordBridge} Runtime bridge class
 */

import { Client, GatewayIntentBits, ChannelType, type Message } from 'discord.js';
import { logger } from '../utils/logger.js';
import { pipeline } from '../config/pipeline.js';
import { env } from '../config/env.js';
import { DiscordSecurityGate, RateLimiter, validateInput } from '../security/index.js';
import { handleMessage, initializeHandler, shutdown, registerSender } from '../handler/index.js';
import { getTaskIntegration } from '../task/integration.js';
import { getTaskManager } from '../task/manager.js';
import { updateStatus, incrementMessageCount } from '../api/status.js';
import { MessageDeduplicator } from './deduplicator.js';
import {
  composeDiscordTaskProgressMessages,
  composeDiscordTaskFileOpMessages,
  composeDiscordTaskQuestionMessages,
} from './discord-progress-message.js';

// =============================================================================
// TASK EVENT INTERFACES
// =============================================================================

interface TaskProgressEvent {
  sessionId?: string;
  message?: string;
}

interface TaskFileOpEvent {
  sessionId?: string;
  operation?: string;
  path?: string;
}

interface TaskQuestionEvent {
  sessionId?: string;
  question?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DISCORD_MAX_LENGTH = 2000;

// =============================================================================
// DISCORD BRIDGE CLASS
// =============================================================================

/**
 * Runtime wrapper around Discord.js client.
 *
 * Owns client lifecycle, event wiring, inbound security checks, and outbound
 * proactive messaging integration.
 */
export class DiscordBridge {
  private client: Client;
  private securityGate: DiscordSecurityGate;
  private rateLimiter: RateLimiter;
  private deduplicator = new MessageDeduplicator();
  private destroyed = false;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.securityGate = new DiscordSecurityGate();
    this.rateLimiter = new RateLimiter(pipeline.rateLimitMax, pipeline.rateLimitWindow);
  }

  /**
   * Initialize handler integrations, event listeners, and Discord client login.
   */
  async initialize(): Promise<void> {
    // Initialize agentic handler
    await initializeHandler();

    // Register Discord sender for proactive messages (task completions, etc.)
    registerSender(async (userId: string, text: string) => {
      try {
        logger.info(`Sending proactive Discord message to ${userId}`);
        // userId is `discord:<snowflake>`, extract the snowflake
        const snowflake = userId.startsWith('discord:') ? userId.slice(8) : userId;
        const user = await this.client.users.fetch(snowflake);
        const dm = await user.createDM();
        await this.sendLongMessage(dm, text);
        logger.success(`Proactive message sent to Discord user ${snowflake}`);
      } catch (err) {
        logger.error(`Failed to send proactive Discord message to ${userId}`, err);
      }
    }, 'discord');

    this.setupEventHandlers();
    this.setupTaskProgressListeners();

    const token = env.DISCORD_BOT_TOKEN;
    if (!token) {
      throw new Error('DISCORD_BOT_TOKEN is required for Discord bridge');
    }
    await this.client.login(token);
  }

  /**
   * Send a message, splitting at Discord's 2000-char limit.
   */
  private async sendLongMessage(
    channel: { send: (content: string) => Promise<unknown> },
    text: string,
  ): Promise<void> {
    if (text.length <= DISCORD_MAX_LENGTH) {
      await channel.send(text);
      return;
    }

    // Split on paragraph boundaries first
    const blocks = text.split(/\n\n+/);
    let current = '';

    for (const block of blocks) {
      if (!current) {
        current = block;
        continue;
      }
      const next = `${current}\n\n${block}`;
      if (next.length > DISCORD_MAX_LENGTH) {
        await channel.send(current);
        current = block;
      } else {
        current = next;
      }
    }

    // Handle remaining content, splitting on newlines if still too long
    if (current) {
      if (current.length <= DISCORD_MAX_LENGTH) {
        await channel.send(current);
      } else {
        const lines = current.split('\n');
        let part = '';
        for (const line of lines) {
          const candidate = part ? `${part}\n${line}` : line;
          if (candidate.length > DISCORD_MAX_LENGTH && part) {
            await channel.send(part);
            part = line;
          } else {
            part = candidate;
          }
        }
        if (part) await channel.send(part);
      }
    }
  }

  /**
   * Register Discord client event handlers.
   */
  private setupEventHandlers(): void {
    this.client.on('ready', () => {
      updateStatus({ state: 'authenticated', qrCode: null, qrUrl: null });
      logger.section('🐕 Fetch is Ready!');
      logger.success(`Discord bot logged in as ${this.client.user?.tag}`);
      logger.divider();
    });

    this.client.on('messageCreate', async (message: Message) => {
      // Ignore if bridge is destroyed or bot's own messages
      if (this.destroyed) return;
      if (message.author.bot) return;

      // Deduplication
      if (!this.deduplicator.isNew(message.id)) {
        logger.debug(`Skipped duplicate Discord message: ${message.id}`);
        return;
      }

      // Skip empty messages
      if (!message.content || message.content.trim() === '') {
        return;
      }

      const isDM = message.channel.type === ChannelType.DM;
      const userId = message.author.id;
      const channelId = message.channelId;

      // Security gate: authorization + channel check
      if (!this.securityGate.isAuthorized(userId, channelId, isDM)) {
        logger.debug(`Rejected Discord message from unauthorized user/channel: ${userId}/${channelId}`);
        return;
      }

      // Rate limiting
      if (!this.rateLimiter.isAllowed(userId)) {
        await message.reply('Slow down! You\'re sending too many requests. Please wait a moment.');
        return;
      }

      // Input validation
      const validation = validateInput(message.content);
      if (!validation.valid) {
        logger.warn(`Invalid input from Discord user ${userId}: ${validation.error}`);
        await message.reply(`${validation.error}`);
        return;
      }

      incrementMessageCount();
      logger.message(`Discord: "${validation.sanitized.substring(0, 60)}${validation.sanitized.length > 60 ? '...' : ''}"`);

      try {
        const sessionUserId = `discord:${userId}`;

        const responses = await handleMessage(
          sessionUserId,
          validation.sanitized,
          async (text) => {
            await message.reply(text);
          },
        );

        for (let i = 0; i < responses.length; i++) {
          await message.reply(responses[i]);
          // Small delay between messages to avoid rate limiting
          if (responses.length > 1 && i < responses.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } catch (error) {
        logger.error('Failed to process Discord message', error);
        await message.reply('Sorry, I encountered an error processing your request.');
      }
    });

    // Reaction handling for approve/reject
    this.client.on('messageReactionAdd', async (reaction, user) => {
      try {
        if (user.bot) return;
        if (!this.securityGate.isTrusted(user.id)) return;

        const taskManager = await getTaskManager();
        const currentTask = taskManager.getCurrentTask();
        if (!currentTask || currentTask.status !== 'waiting_input') return;

        const emoji = reaction.emoji.name;
        const approveEmojis = ['👍', '✅', '👌'];
        const rejectEmojis = ['👎', '❌'];
        const sessionUserId = `discord:${user.id}`;

        if (approveEmojis.includes(emoji ?? '')) {
          logger.info('Processing Discord reaction approval');
          const responses = await handleMessage(sessionUserId, 'yes');
          for (const response of responses) {
            await reaction.message.reply(response);
          }
        } else if (rejectEmojis.includes(emoji ?? '')) {
          logger.info('Processing Discord reaction rejection');
          const responses = await handleMessage(sessionUserId, 'no');
          for (const response of responses) {
            await reaction.message.reply(response);
          }
        }
      } catch (error) {
        logger.error('Failed to process Discord reaction', error);
      }
    });
  }

  /**
   * Subscribe to task integration events and forward user-facing updates.
   */
  private setupTaskProgressListeners(): void {
    const integration = getTaskIntegration();

    const lastProgressUpdate = new Map<string, number>();
    const THROTTLE_MS = pipeline.progressThrottle;

    const resolveTarget = async (sessionId: string): Promise<string | null> => {
      if (!sessionId) return null;
      // If it starts with discord:, extract snowflake
      if (sessionId.startsWith('discord:')) return sessionId;

      try {
        const { getSessionManager } = await import('../session/manager.js');
        const manager = await getSessionManager();
        const session = await manager.getSessionById(sessionId);
        return session ? session.userId : null;
      } catch (_err) {
        logger.warn('Failed to resolve session owner', { sessionId });
        return null;
      }
    };

    const sendToUser = async (targetId: string, text: string): Promise<void> => {
      const snowflake = targetId.startsWith('discord:') ? targetId.slice(8) : targetId;
      try {
        const user = await this.client.users.fetch(snowflake);
        const dm = await user.createDM();
        await this.sendLongMessage(dm, text);
      } catch (err) {
        logger.error(`Failed to send Discord DM to ${snowflake}`, err);
      }
    };

    const isStructuredHarnessEventLine = (raw: string): boolean => {
      const line = raw.trim();
      if (!line.startsWith('{') || !line.endsWith('}')) return false;
      try {
        const parsed = JSON.parse(line) as { type?: unknown; item?: { type?: unknown } };
        const type = typeof parsed.type === 'string' ? parsed.type : '';
        if (type.startsWith('thread.') || type.startsWith('turn.') || type.startsWith('item.')) return true;
        const itemType = typeof parsed.item?.type === 'string' ? parsed.item.type : '';
        return itemType === 'command_execution' || itemType === 'reasoning' || itemType === 'file_change';
      } catch {
        return false;
      }
    };

    integration.on('task:progress', async (event: TaskProgressEvent) => {
      const { sessionId, message } = event;
      if (!sessionId || !message) return;
      if (isStructuredHarnessEventLine(message)) return;

      const targetId = await resolveTarget(sessionId);
      if (!targetId) return;

      const now = Date.now();
      const lastUpdate = lastProgressUpdate.get(sessionId) || 0;
      const isPriority = /starting|done|complete|failed|error|waiting/i.test(message);

      if (isPriority || (now - lastUpdate > THROTTLE_MS)) {
        try {
          const chunks = await composeDiscordTaskProgressMessages(message, sessionId);
          for (const chunk of chunks) {
            await sendToUser(targetId, chunk);
          }
          lastProgressUpdate.set(sessionId, now);
        } catch (error) {
          logger.error('Failed to send Discord progress message', error);
        }
      }
    });

    integration.on('task:file_op', async (event: TaskFileOpEvent) => {
      const { sessionId, operation, path } = event;
      if (!sessionId || !operation || !path) return;

      const targetId = await resolveTarget(sessionId);
      if (!targetId) return;

      try {
        const chunks = composeDiscordTaskFileOpMessages(operation, path);
        for (const chunk of chunks) {
          await sendToUser(targetId, chunk);
        }
      } catch (error) {
        logger.error('Failed to send Discord file_op message', error);
      }
    });

    integration.on('task:question', async (event: TaskQuestionEvent) => {
      const { sessionId, question } = event;
      if (!sessionId || !question) return;

      const targetId = await resolveTarget(sessionId);
      if (!targetId) return;

      try {
        const chunks = composeDiscordTaskQuestionMessages(question);
        for (const chunk of chunks) {
          await sendToUser(targetId, chunk);
        }
      } catch (error) {
        logger.error('Failed to send Discord task question', error);
      }
    });
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Stop bridge processing and destroy the Discord client instance.
   */
  async destroy(): Promise<void> {
    this.destroyed = true;
    this.rateLimiter.shutdown();
    await this.securityGate.shutdown();
    await shutdown();
    this.client.destroy();
  }
}
