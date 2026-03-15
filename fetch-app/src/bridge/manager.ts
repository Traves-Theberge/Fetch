/**
 * @fileoverview Multi-channel bridge manager.
 *
 * Coordinates lifecycle of all configured messaging bridges (WhatsApp, Slack,
 * Telegram, Discord). Reads environment variables to determine which channels
 * to activate, initializes them, and provides a unified interface for shutdown.
 *
 * @module bridge/manager
 */

import type { MessageBridge, ChannelType } from './interface.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

// =============================================================================
// BRIDGE MANAGER
// =============================================================================

export class BridgeManager {
  private bridges = new Map<ChannelType, MessageBridge>();

  /**
   * Returns all active bridges.
   */
  getActiveBridges(): Map<ChannelType, MessageBridge> {
    return this.bridges;
  }

  /**
   * Returns a specific bridge by channel type.
   */
  getBridge(channel: ChannelType): MessageBridge | undefined {
    return this.bridges.get(channel);
  }

  /**
   * Detects configured channels from environment variables and initializes
   * their bridges. Channels missing required tokens are skipped.
   *
   * WhatsApp is excluded from this manager — it uses its own startup flow
   * via the existing Bridge class in client.ts.
   */
  async initializeConfiguredBridges(): Promise<ChannelType[]> {
    const started: ChannelType[] = [];

    // Slack
    if (env.SLACK_BOT_TOKEN && env.SLACK_APP_TOKEN) {
      try {
        const { SlackBridge } = await import('./slack/index.js');
        const slack = new SlackBridge({
          botToken: env.SLACK_BOT_TOKEN as string,
          appToken: env.SLACK_APP_TOKEN as string,
          signingSecret: (env.SLACK_SIGNING_SECRET as string) || undefined,
        });
        await slack.initialize();
        this.bridges.set('slack', slack);
        started.push('slack');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Slack bridge failed to start: ${msg}`);
      }
    }

    // Telegram
    if (env.TELEGRAM_BOT_TOKEN) {
      try {
        const { TelegramBridge } = await import('./telegram/index.js');
        const allowedIds = (env.TELEGRAM_ALLOWED_CHAT_IDS as string || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const telegram = new TelegramBridge({
          token: env.TELEGRAM_BOT_TOKEN as string,
          allowedChatIds: allowedIds,
        });
        await telegram.initialize();
        this.bridges.set('telegram', telegram);
        started.push('telegram');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Telegram bridge failed to start: ${msg}`);
      }
    }

    // Discord
    if (env.DISCORD_TOKEN) {
      try {
        const { DiscordBridge } = await import('./discord/index.js');
        const allowedRoles = (env.DISCORD_ALLOWED_ROLES as string || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const allowedChannels = (env.DISCORD_ALLOWED_CHANNELS as string || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const discord = new DiscordBridge({
          token: env.DISCORD_TOKEN as string,
          allowedRoles,
          allowedChannels,
        });
        await discord.initialize();
        this.bridges.set('discord', discord);
        started.push('discord');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Discord bridge failed to start: ${msg}`);
      }
    }

    if (started.length > 0) {
      logger.success(`Additional messaging channels active: ${started.join(', ')}`);
    }

    return started;
  }

  /**
   * Gracefully shut down all active bridges.
   */
  async destroyAll(): Promise<void> {
    const entries = Array.from(this.bridges.entries());
    for (const [channel, bridge] of entries) {
      try {
        await bridge.destroy();
        logger.info(`${channel} bridge destroyed`);
      } catch (error) {
        logger.warn(`Failed to destroy ${channel} bridge`, error);
      }
    }
    this.bridges.clear();
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let bridgeManager: BridgeManager | null = null;

export function getBridgeManager(): BridgeManager {
  if (!bridgeManager) {
    bridgeManager = new BridgeManager();
  }
  return bridgeManager;
}
