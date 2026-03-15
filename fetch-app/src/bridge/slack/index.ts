/**
 * @fileoverview Slack bridge implementation using @slack/bolt.
 *
 * Connects Fetch to Slack workspaces via the Bolt SDK, supporting:
 * - App mentions and direct messages
 * - Thread-based conversations
 * - File uploads
 * - Channel-based context
 *
 * @module bridge/slack
 */

import type { MessageBridge, ChannelType } from '../interface.js';
import { logger } from '../../utils/logger.js';
import { SecurityGate, RateLimiter, validateInput } from '../../security/index.js';
import { handleMessage, registerChannelSender } from '../../handler/index.js';
import { pipeline } from '../../config/pipeline.js';
import { formatTextForChannel } from '../../agent/channel-format.js';

// =============================================================================
// TYPES
// =============================================================================

/** Minimal Slack event shapes to avoid hard dependency on @slack/bolt types. */
interface SlackMessageEvent {
  type: string;
  text: string;
  user: string;
  channel: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
  files?: Array<{ url_private: string; mimetype: string; name: string }>;
}

interface SlackApp {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  event: (eventName: string, handler: (args: { event: SlackMessageEvent; say: SayFn }) => Promise<void>) => void;
  client: {
    chat: {
      postMessage: (args: { channel: string; text: string; thread_ts?: string }) => Promise<{ ts?: string }>;
    };
    files: {
      uploadV2: (args: { channel_id: string; content: string; filename: string; thread_ts?: string }) => Promise<void>;
    };
  };
}

type SayFn = (args: { text: string; thread_ts?: string } | string) => Promise<{ ts?: string }>;

// =============================================================================
// SLACK BRIDGE
// =============================================================================

export class SlackBridge implements MessageBridge {
  readonly channel: ChannelType = 'slack';
  private app: SlackApp | null = null;
  private ready = false;
  private securityGate: SecurityGate | null = null;
  private rateLimiter: RateLimiter;
  private botUserId: string | null = null;

  private readonly botToken: string;
  private readonly appToken: string;
  private readonly signingSecret: string;

  constructor(config: { botToken: string; appToken: string; signingSecret?: string }) {
    this.botToken = config.botToken;
    this.appToken = config.appToken;
    this.signingSecret = config.signingSecret ?? '';
    this.rateLimiter = new RateLimiter(pipeline.rateLimitMax, pipeline.rateLimitWindow);
  }

  async initialize(): Promise<void> {
    logger.section('🔌 Initializing Slack Bridge');

    try {
      // Dynamic import to avoid hard dependency when Slack is not configured
      const { App } = await import('@slack/bolt');

      this.app = new App({
        token: this.botToken,
        appToken: this.appToken,
        socketMode: true,
        ...(this.signingSecret ? { signingSecret: this.signingSecret } : {}),
      }) as unknown as SlackApp;

      this.securityGate = await SecurityGate.create();

      // Register message sender for proactive messages
      registerChannelSender('slack', async (userId: string, text: string) => {
        await this.sendMessage(userId, text);
      });

      this.setupEventHandlers();
      await this.app.start();
      this.ready = true;

      logger.success('Slack Bridge connected and listening');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize Slack Bridge: ${msg}`);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    this.ready = false;
    this.rateLimiter.shutdown();
    if (this.securityGate) {
      await this.securityGate.shutdown();
    }
    if (this.app) {
      await this.app.stop();
      this.app = null;
    }
    logger.info('Slack Bridge destroyed');
  }

  async sendMessage(target: string, text: string, options?: Record<string, unknown>): Promise<string | null> {
    if (!this.app) return null;
    try {
      const formatted = formatTextForChannel(text, 'slack');
      const result = await this.app.client.chat.postMessage({
        channel: target,
        text: formatted,
        thread_ts: options?.threadTs as string | undefined,
      });
      return result.ts ?? null;
    } catch (error) {
      logger.error('Failed to send Slack message', error);
      return null;
    }
  }

  /**
   * Upload a file to a Slack channel, optionally in a thread.
   */
  async sendFile(channel: string, content: string, filename: string, threadTs?: string): Promise<void> {
    if (!this.app) return;
    try {
      await this.app.client.files.uploadV2({
        channel_id: channel,
        content,
        filename,
        thread_ts: threadTs,
      });
    } catch (error) {
      logger.error('Failed to upload Slack file', error);
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  private setupEventHandlers(): void {
    if (!this.app) return;

    // Listen for app_mention events (when someone @mentions the bot)
    this.app.event('app_mention', async ({ event, say }: { event: SlackMessageEvent; say: SayFn }) => {
      await this.handleSlackMessage(event, say);
    });

    // Listen for direct messages
    this.app.event('message', async ({ event, say }: { event: SlackMessageEvent; say: SayFn }) => {
      // Skip bot messages to prevent loops
      if (event.bot_id) return;
      // Only handle DMs (channel type starts with D)
      if (!event.channel.startsWith('D')) return;
      await this.handleSlackMessage(event, say);
    });
  }

  private async handleSlackMessage(event: SlackMessageEvent, say: SayFn): Promise<void> {
    const senderId = event.user;
    if (!senderId) return;

    // Skip messages from the bot itself
    if (this.botUserId && senderId === this.botUserId) return;

    // Strip bot mention from message text
    let messageText = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
    if (!messageText) return;

    // Rate limiting
    if (!(await this.rateLimiter.isAllowed(senderId))) {
      await say({ text: 'Slow down! You\'re sending too many requests. Please wait a moment.', thread_ts: event.thread_ts || event.ts });
      return;
    }

    // Input validation
    const validation = validateInput(messageText);
    if (!validation.valid) {
      await say({ text: `Error: ${validation.error}`, thread_ts: event.thread_ts || event.ts });
      return;
    }

    const threadTs = event.thread_ts || event.ts;

    // Pass file metadata through for context
    let fileContext = '';
    if (event.files && event.files.length > 0) {
      const fileNames = event.files.map((f) => f.name).join(', ');
      fileContext = `\n\n[Attached files: ${fileNames}]`;
    }

    try {
      const responses = await handleMessage(
        `slack:${senderId}`,
        validation.sanitized + fileContext,
        async (text) => {
          const formatted = formatTextForChannel(text, 'slack');
          await say({ text: formatted, thread_ts: threadTs });
        },
      );

      for (const response of responses) {
        const formatted = formatTextForChannel(response, 'slack');
        await say({ text: formatted, thread_ts: threadTs });
      }
    } catch (error) {
      logger.error('Failed to process Slack message', error);
      await say({ text: 'Sorry, I encountered an error processing your request.', thread_ts: threadTs });
    }
  }
}
