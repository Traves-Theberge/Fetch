/**
 * @fileoverview Multi-bot Discord bridge.
 *
 * Manages N independent Discord bot clients, each with its own persona
 * (identity), security config, and session namespace. All bots share the
 * same handler pipeline, session store, and task system.
 *
 * @module bridge/multi-discord
 * @see {@link MultiDiscordBridge} Orchestrator class
 * @see {@link DiscordBotInstance} Per-bot runtime
 */

import { Client, GatewayIntentBits, ChannelType, type Message } from 'discord.js';
import { logger } from '../utils/logger.js';
import { pipeline } from '../config/pipeline.js';
import type { DiscordAgentConfig } from '../config/agents.js';
import { DiscordSecurityGate, RateLimiter, validateInput } from '../security/index.js';
import { handleMessage, initializeHandler, shutdown, registerSender, type HandlerContext } from '../handler/index.js';
import { getTaskIntegration } from '../task/integration.js';
import { getTaskManager } from '../task/manager.js';
import { updateStatus, incrementMessageCount } from '../api/status.js';
import { MessageDeduplicator } from './deduplicator.js';
import { ScopedIdentityManager } from '../identity/scoped-manager.js';
import { analyzeImage, isVisionAvailable } from '../vision/index.js';
import { routeMessage, type AgentProfile } from './intent-router.js';
import {
  composeDiscordTaskProgressMessages,
  composeDiscordTaskFileOpMessages,
  composeDiscordTaskQuestionMessages,
} from './discord-progress-message.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const DISCORD_MAX_LENGTH = 2000;

// =============================================================================
// PER-BOT INSTANCE
// =============================================================================

/**
 * One Discord bot agent. Owns its own Client, identity, and security config.
 */
class DiscordBotInstance {
  readonly agentId: string;
  private client: Client;
  private config: DiscordAgentConfig;
  private identity: ScopedIdentityManager;
  private securityGate: DiscordSecurityGate;
  private rateLimiter: RateLimiter;
  private deduplicator = new MessageDeduplicator();
  private destroyed = false;
  private handlerContext: HandlerContext;

  constructor(config: DiscordAgentConfig) {
    this.agentId = config.id;
    this.config = config;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.identity = new ScopedIdentityManager(
      config.identityDir,
      config.identity,
      config.platform || 'Discord',
    );

    this.securityGate = new DiscordSecurityGate({
      ownerId: config.ownerId,
      trustedUserIds: config.trustedUserIds,
      channelIds: config.channelIds,
    });

    this.rateLimiter = new RateLimiter(pipeline.rateLimitMax, pipeline.rateLimitWindow);

    this.handlerContext = {
      identityProvider: this.identity,
      bridgeType: 'discord',
    };
  }

  async initialize(): Promise<void> {
    // Register sender for proactive messages scoped to this bot
    registerSender(async (userId: string, text: string) => {
      try {
        // userId is `discord:<agentId>:<snowflake>`
        const parts = userId.split(':');
        const snowflake = parts.length === 3 ? parts[2] : parts[1];
        const user = await this.client.users.fetch(snowflake);
        const dm = await user.createDM();
        await this.sendLongMessage(dm, text);
      } catch (err) {
        logger.error(`[${this.agentId}] Failed to send proactive message to ${userId}`, err);
      }
    }, 'discord');

    this.setupEventHandlers();
    this.setupTaskProgressListeners();

    await this.identity.whenReady();
    await this.client.login(this.config.botToken);
  }

  /** Callback set by MultiDiscordBridge for centralized routing */
  private onGuildMessage: ((message: Message) => void) | null = null;

  /** Register a callback for guild messages (called by the bridge orchestrator) */
  setGuildMessageHandler(handler: (message: Message) => void): void {
    this.onGuildMessage = handler;
  }

  /** Get the Discord user ID of this bot */
  getBotUserId(): string | null {
    return this.client.user?.id ?? null;
  }

  /** Get the agent profile for intent routing */
  getProfile(): AgentProfile {
    return {
      id: this.agentId,
      name: this.config.identity?.name || this.agentId,
      role: this.config.identity?.role || 'General Assistant',
      emoji: this.config.identity?.emoji || '🤖',
    };
  }

  /** Check if a user/channel is authorized for this bot */
  isAuthorized(userId: string, channelId: string, isDM: boolean): boolean {
    return this.securityGate.isAuthorized(userId, channelId, isDM);
  }

  private setupEventHandlers(): void {
    this.client.on('ready', () => {
      const tag = this.client.user?.tag ?? this.agentId;
      logger.success(`[${this.agentId}] Discord bot logged in as ${tag}`);
    });

    this.client.on('messageCreate', async (message: Message) => {
      if (this.destroyed) return;
      if (message.author.bot) return;

      const isDM = message.channel.type === ChannelType.DM;

      if (isDM) {
        // DMs are handled directly by this bot (no routing needed)
        await this.processMessage(message);
      } else if (this.onGuildMessage) {
        // Guild messages go through the centralized router
        this.onGuildMessage(message);
      }
    });

    // Reaction handling
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
        const sessionUserId = `discord:${this.agentId}:${user.id}`;

        if (approveEmojis.includes(emoji ?? '')) {
          const responses = await handleMessage(sessionUserId, 'yes', undefined, this.handlerContext);
          for (const response of responses) await reaction.message.reply(response);
        } else if (rejectEmojis.includes(emoji ?? '')) {
          const responses = await handleMessage(sessionUserId, 'no', undefined, this.handlerContext);
          for (const response of responses) await reaction.message.reply(response);
        }
      } catch (error) {
        logger.error(`[${this.agentId}] Failed to process reaction`, error);
      }
    });
  }

  private setupTaskProgressListeners(): void {
    const integration = getTaskIntegration();
    const lastProgressUpdate = new Map<string, number>();
    const THROTTLE_MS = pipeline.progressThrottle;

    const resolveTarget = async (sessionId: string): Promise<string | null> => {
      if (!sessionId) return null;
      // Only handle sessions for this agent
      if (sessionId.startsWith(`discord:${this.agentId}:`)) return sessionId;
      // Try to resolve via session store
      try {
        const { getSessionManager } = await import('../session/manager.js');
        const manager = await getSessionManager();
        const session = await manager.getSessionById(sessionId);
        if (session && session.userId.startsWith(`discord:${this.agentId}:`)) {
          return session.userId;
        }
      } catch { /* ignore */ }
      return null;
    };

    const sendToUser = async (targetId: string, text: string): Promise<void> => {
      const parts = targetId.split(':');
      const snowflake = parts.length === 3 ? parts[2] : parts[1];
      try {
        const user = await this.client.users.fetch(snowflake);
        const dm = await user.createDM();
        await this.sendLongMessage(dm, text);
      } catch (err) {
        logger.error(`[${this.agentId}] Failed to send DM to ${snowflake}`, err);
      }
    };

    integration.on('task:progress', async (event: { sessionId?: string; message?: string }) => {
      const { sessionId, message: msg } = event;
      if (!sessionId || !msg) return;
      const targetId = await resolveTarget(sessionId);
      if (!targetId) return;

      const now = Date.now();
      const lastUpdate = lastProgressUpdate.get(sessionId) || 0;
      const isPriority = /starting|done|complete|failed|error|waiting/i.test(msg);

      if (isPriority || (now - lastUpdate > THROTTLE_MS)) {
        try {
          const chunks = await composeDiscordTaskProgressMessages(msg, sessionId);
          for (const chunk of chunks) await sendToUser(targetId, chunk);
          lastProgressUpdate.set(sessionId, now);
        } catch (error) {
          logger.error(`[${this.agentId}] Failed to send progress`, error);
        }
      }
    });

    integration.on('task:file_op', async (event: { sessionId?: string; operation?: string; path?: string }) => {
      const { sessionId, operation, path } = event;
      if (!sessionId || !operation || !path) return;
      const targetId = await resolveTarget(sessionId);
      if (!targetId) return;
      try {
        const chunks = composeDiscordTaskFileOpMessages(operation, path);
        for (const chunk of chunks) await sendToUser(targetId, chunk);
      } catch (error) {
        logger.error(`[${this.agentId}] Failed to send file_op`, error);
      }
    });

    integration.on('task:question', async (event: { sessionId?: string; question?: string }) => {
      const { sessionId, question } = event;
      if (!sessionId || !question) return;
      const targetId = await resolveTarget(sessionId);
      if (!targetId) return;
      try {
        const chunks = composeDiscordTaskQuestionMessages(question);
        for (const chunk of chunks) await sendToUser(targetId, chunk);
      } catch (error) {
        logger.error(`[${this.agentId}] Failed to send question`, error);
      }
    });
  }

  private async sendLongMessage(
    channel: { send: (content: string) => Promise<unknown> },
    text: string,
  ): Promise<void> {
    if (text.length <= DISCORD_MAX_LENGTH) {
      await channel.send(text);
      return;
    }
    const blocks = text.split(/\n\n+/);
    let current = '';
    for (const block of blocks) {
      if (!current) { current = block; continue; }
      const next = `${current}\n\n${block}`;
      if (next.length > DISCORD_MAX_LENGTH) {
        await channel.send(current);
        current = block;
      } else {
        current = next;
      }
    }
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
   * Process a message that has been routed to this bot by the intent router.
   * Handles validation, image analysis, and agent pipeline invocation.
   */
  async processMessage(message: Message): Promise<void> {
    if (this.destroyed) return;
    if (!this.deduplicator.isNew(message.id)) return;

    const isDM = message.channel.type === ChannelType.DM;
    const userId = message.author.id;
    const channelId = message.channelId;

    // Extract image attachments
    const imageAttachments = message.attachments.filter(
      (a) => a.contentType?.startsWith('image/') ?? false,
    );

    // Skip messages with no text and no images
    if ((!message.content || message.content.trim() === '') && imageAttachments.size === 0) {
      return;
    }

    if (!this.securityGate.isAuthorized(userId, channelId, isDM)) return;

    if (!this.rateLimiter.isAllowed(userId)) {
      await message.reply('Slow down! You\'re sending too many requests. Please wait a moment.');
      return;
    }

    const textContent = message.content || '';
    const validation = validateInput(textContent || ' ');
    if (!validation.valid) {
      logger.warn(`[${this.agentId}] Invalid input from ${userId}: ${validation.error}`);
      await message.reply(`${validation.error}`);
      return;
    }

    // Analyze image attachments via vision model
    let imageContext = '';
    if (imageAttachments.size > 0 && isVisionAvailable()) {
      for (const [, attachment] of imageAttachments) {
        try {
          logger.info(`[${this.agentId}] 🖼️ Processing image (${attachment.name})`);
          const response = await fetch(attachment.url);
          const buffer = Buffer.from(await response.arrayBuffer());
          const base64Data = buffer.toString('base64');
          const mimeType = attachment.contentType || 'image/png';
          const analysis = await analyzeImage(base64Data, mimeType, textContent);
          if (analysis) {
            imageContext += `\n\n[CONTEXT: Image Analysis]\n${analysis}`;
          }
        } catch (error) {
          logger.error(`[${this.agentId}] Failed to analyze image`, error);
        }
      }
    }

    const fullMessage = `${validation.sanitized}${imageContext}`.trim();
    if (!fullMessage) return;

    incrementMessageCount();
    logger.message(`[${this.agentId}] "${fullMessage.substring(0, 60)}${fullMessage.length > 60 ? '...' : ''}"`);

    try {
      const sessionUserId = `discord:${this.agentId}:${userId}`;

      const responses = await handleMessage(
        sessionUserId,
        fullMessage,
        async (text) => { await message.reply(text); },
        this.handlerContext,
      );

      for (let i = 0; i < responses.length; i++) {
        await message.reply(responses[i]);
        if (responses.length > 1 && i < responses.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      logger.error(`[${this.agentId}] Failed to process message`, error);
      await message.reply('Sorry, I encountered an error processing your request.');
    }
  }

  getBotTag(): string | null {
    return this.client.user?.tag ?? null;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.rateLimiter.shutdown();
    await this.securityGate.shutdown();
    this.identity.shutdown();
    this.client.destroy();
    logger.info(`[${this.agentId}] Discord bot destroyed`);
  }
}

// =============================================================================
// MULTI-DISCORD BRIDGE
// =============================================================================

/**
 * Orchestrates N Discord bot instances from a single bridge process.
 */
export class MultiDiscordBridge {
  private bots = new Map<string, DiscordBotInstance>();
  /** Deduplicator shared across all bots — ensures one routing decision per message */
  private routingDedup = new MessageDeduplicator();

  constructor(private configs: DiscordAgentConfig[]) {}

  async initialize(): Promise<void> {
    // Initialize the shared handler pipeline once
    await initializeHandler();

    // Auto-select workspace if exactly one exists and none is active
    try {
      const { workspaceManager: wm } = await import('../workspace/manager.js');
      const list = await wm.listWorkspaces(true);
      if (list.count === 1 && !list.workspaces.some((w: { isActive: boolean }) => w.isActive)) {
        await wm.selectWorkspace(list.workspaces[0].id);
        logger.info(`Auto-selected workspace: ${list.workspaces[0].name}`);
      }
    } catch {
      // Workspace auto-select is best-effort
    }

    // Boot each bot
    for (const config of this.configs) {
      const bot = new DiscordBotInstance(config);
      this.bots.set(config.id, bot);

      // Wire up centralized guild message routing
      bot.setGuildMessageHandler((message: Message) => {
        void this.handleGuildMessage(message);
      });
    }

    // Login all bots concurrently, tolerating individual failures
    const results = await Promise.allSettled(
      Array.from(this.bots.entries()).map(async ([id, bot]) => {
        try {
          await bot.initialize();
        } catch (err) {
          logger.error(`Agent "${id}" failed to initialize:`, err);
          this.bots.delete(id);
          throw err;
        }
      }),
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    if (succeeded === 0) {
      throw new Error(`All ${failed} Discord bot(s) failed to initialize`);
    }

    updateStatus({ state: 'authenticated' });
    logger.section('🐕 Fetch is Ready! (Multi-Agent Mode)');
    if (failed > 0) {
      logger.warn(`  ${failed} bot(s) failed to connect (see errors above)`);
    }
    for (const [id, bot] of this.bots) {
      logger.success(`  Agent "${id}" logged in as ${bot.getBotTag()}`);
    }
    logger.divider();
  }

  /**
   * Centralized guild message handler. Called by whichever bot's client
   * receives the message first. Uses the AI intent router to decide which
   * bot(s) should respond, then dispatches to them.
   */
  private async handleGuildMessage(message: Message): Promise<void> {
    if (message.author.bot) return;

    // Deduplicate: multiple bot clients see the same guild message
    if (!this.routingDedup.isNew(message.id)) return;

    const userId = message.author.id;
    const channelId = message.channelId;

    // Skip empty messages
    if (!message.content?.trim() && message.attachments.size === 0) return;

    // Check if at least one bot authorizes this user/channel
    const authorizedBots = Array.from(this.bots.values()).filter(
      bot => bot.isAuthorized(userId, channelId, false),
    );
    if (authorizedBots.length === 0) return;

    // Build agent profiles and detect @mentions
    const agents = authorizedBots.map(bot => bot.getProfile());
    const mentionedAgentIds: string[] = [];
    for (const bot of authorizedBots) {
      const botUserId = bot.getBotUserId();
      if (botUserId && message.mentions.has(botUserId)) {
        mentionedAgentIds.push(bot.agentId);
      }
    }

    // Route via AI intent router
    const routing = await routeMessage(message.content || '', agents, mentionedAgentIds);

    if (routing.respondents.length === 0) return;

    logger.info(`[router] ${message.content?.substring(0, 50)}... → [${routing.respondents.join(', ')}] (${routing.reasoning})`);

    // Dispatch to selected bot(s) concurrently
    await Promise.allSettled(
      routing.respondents.map(async (agentId) => {
        const bot = this.bots.get(agentId);
        if (bot) {
          await bot.processMessage(message);
        }
      }),
    );
  }

  async destroy(): Promise<void> {
    await Promise.all(
      Array.from(this.bots.values()).map(bot => bot.destroy()),
    );
    this.bots.clear();
    await shutdown();
  }

  getAgentStatuses(): Array<{ id: string; botTag: string | null }> {
    return Array.from(this.bots.entries()).map(([id, bot]) => ({
      id,
      botTag: bot.getBotTag(),
    }));
  }
}
