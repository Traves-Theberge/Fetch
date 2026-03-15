/**
 * @fileoverview Discord bridge implementation using discord.js.
 *
 * Connects Fetch to Discord servers, supporting:
 * - Channel-based messaging with mention triggers
 * - Thread/reply context
 * - Role-based access control
 * - File attachments
 *
 * @module bridge/discord
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

/** Minimal discord.js shapes to avoid hard dependency on discord.js types. */
interface DiscordMessage {
  id: string;
  content: string;
  author: { id: string; bot: boolean; username: string };
  channel: {
    id: string;
    type: number;
    send: (content: string) => Promise<{ id: string }>;
    isDMBased: () => boolean;
  };
  guild?: { id: string };
  member?: { roles: { cache: Map<string, { name: string }> } };
  mentions: { has: (user: unknown) => boolean };
  reference?: { messageId: string };
  reply: (content: string) => Promise<{ id: string }>;
}

interface DiscordClient {
  login: (token: string) => Promise<string>;
  destroy: () => Promise<void>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  once: (event: string, handler: (...args: unknown[]) => void) => void;
  user?: { id: string; username: string; tag: string };
  channels: {
    fetch: (id: string) => Promise<{ send: (content: string) => Promise<{ id: string }> } | null>;
  };
}

// =============================================================================
// DISCORD BRIDGE
// =============================================================================

export class DiscordBridge implements MessageBridge {
  readonly channel: ChannelType = 'discord';
  private client: DiscordClient | null = null;
  private ready = false;
  private rateLimiter: RateLimiter;
  private botUserId: string | null = null;

  private readonly token: string;
  private readonly allowedRoles: Set<string>;
  private readonly allowedChannels: Set<string>;

  constructor(config: { token: string; allowedRoles?: string[]; allowedChannels?: string[] }) {
    this.token = config.token;
    this.allowedRoles = new Set(config.allowedRoles ?? []);
    this.allowedChannels = new Set(config.allowedChannels ?? []);
    this.rateLimiter = new RateLimiter(pipeline.rateLimitMax, pipeline.rateLimitWindow);
  }

  async initialize(): Promise<void> {
    logger.section('🔌 Initializing Discord Bridge');

    try {
      const { Client, GatewayIntentBits } = await import('discord.js');

      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
      }) as unknown as DiscordClient;

      // Register message sender for proactive messages
      registerChannelSender('discord', async (userId: string, text: string) => {
        await this.sendMessage(userId, text);
      });

      this.setupEventHandlers();
      await this.client.login(this.token);

      // ready event will set this.ready = true
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize Discord Bridge: ${msg}`);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    this.ready = false;
    this.rateLimiter.shutdown();
    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }
    logger.info('Discord Bridge destroyed');
  }

  async sendMessage(target: string, text: string, _options?: Record<string, unknown>): Promise<string | null> {
    if (!this.client) return null;
    try {
      const formatted = formatTextForChannel(text, 'discord');
      const channel = await this.client.channels.fetch(target);
      if (!channel) return null;
      const result = await channel.send(formatted);
      return result.id;
    } catch (error) {
      logger.error('Failed to send Discord message', error);
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
    if (!this.client) return;

    this.client.once('ready', () => {
      this.ready = true;
      this.botUserId = this.client?.user?.id ?? null;
      logger.success(`Discord Bridge connected as ${this.client?.user?.tag ?? 'unknown'}`);
    });

    this.client.on('messageCreate', async (...args: unknown[]) => {
      const message = args[0] as DiscordMessage;
      await this.handleDiscordMessage(message);
    });
  }

  private async handleDiscordMessage(message: DiscordMessage): Promise<void> {
    // Skip bot messages
    if (message.author.bot) return;

    const senderId = message.author.id;
    const isDM = message.channel.isDMBased();

    // In servers: require bot mention or @fetch trigger
    if (!isDM) {
      const hasMention = this.botUserId ? message.mentions.has({ id: this.botUserId }) : false;
      const hasTrigger = message.content.toLowerCase().startsWith('@fetch');
      if (!hasMention && !hasTrigger) return;

      // Channel allowlist check
      if (this.allowedChannels.size > 0 && !this.allowedChannels.has(message.channel.id)) {
        return;
      }

      // Role-based access check
      if (this.allowedRoles.size > 0 && message.member) {
        const memberRoles = message.member.roles.cache;
        const hasAllowedRole = Array.from(memberRoles.values()).some(
          (role) => this.allowedRoles.has(role.name),
        );
        if (!hasAllowedRole) return;
      }
    }

    // Strip bot mention from message text
    let messageText = message.content;
    if (this.botUserId) {
      messageText = messageText.replace(new RegExp(`<@!?${this.botUserId}>`, 'g'), '').trim();
    }
    messageText = messageText.replace(/^@fetch\s*/i, '').trim();

    if (!messageText) return;

    // Rate limiting
    if (!(await this.rateLimiter.isAllowed(senderId))) {
      await message.reply('Slow down! You\'re sending too many requests. Please wait a moment.');
      return;
    }

    // Input validation
    const validation = validateInput(messageText);
    if (!validation.valid) {
      await message.reply(`Error: ${validation.error}`);
      return;
    }

    try {
      const responses = await handleMessage(
        `discord:${senderId}`,
        validation.sanitized,
        async (text) => {
          const formatted = formatTextForChannel(text, 'discord');
          await message.reply(formatted);
        },
      );

      for (const response of responses) {
        const formatted = formatTextForChannel(response, 'discord');
        // Discord has a 2000 char limit, chunk if needed
        if (formatted.length > 2000) {
          const chunks = chunkText(formatted, 2000);
          for (const chunk of chunks) {
            await message.channel.send(chunk);
          }
        } else {
          await message.reply(formatted);
        }
      }
    } catch (error) {
      logger.error('Failed to process Discord message', error);
      await message.reply('Sorry, I encountered an error processing your request.');
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function chunkText(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt <= 0) splitAt = maxLen;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
