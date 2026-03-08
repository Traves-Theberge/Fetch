/**
 * @fileoverview Discord authorization gate using snowflake-based identity.
 *
 * Unlike the WhatsApp SecurityGate which relies on phone numbers and a whitelist
 * file watcher, this gate uses static env-based configuration:
 * - DISCORD_OWNER_ID: bot owner's Discord snowflake
 * - DISCORD_TRUSTED_USER_IDS: CSV of trusted user snowflakes
 * - DISCORD_CHANNEL_IDS: CSV of allowed channel snowflakes (empty = all DMs + any channel)
 *
 * No trigger word parsing needed — the Discord bot only responds in configured
 * channels or DMs.
 *
 * @module security/discord-gate
 */

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface DiscordGateConfig {
  ownerId: string;
  trustedUserIds?: string;
  channelIds?: string;
}

export class DiscordSecurityGate {
  private ownerSnowflake: string;
  private trustedUsers: Set<string>;
  private allowedChannels: Set<string>;

  constructor(config?: DiscordGateConfig) {
    const ownerId = config?.ownerId ?? env.DISCORD_OWNER_ID;
    if (!ownerId) {
      throw new Error('DISCORD_OWNER_ID is required for Discord bridge');
    }
    this.ownerSnowflake = ownerId;

    // Parse CSV of trusted user snowflakes
    const trustedCsv = config?.trustedUserIds ?? env.DISCORD_TRUSTED_USER_IDS ?? '';
    this.trustedUsers = new Set(
      trustedCsv.split(',').map((s) => s.trim()).filter(Boolean)
    );

    // Parse CSV of allowed channel snowflakes
    const channelCsv = config?.channelIds ?? env.DISCORD_CHANNEL_IDS ?? '';
    this.allowedChannels = new Set(
      channelCsv.split(',').map((s) => s.trim()).filter(Boolean)
    );

    logger.info(
      `Discord security gate initialized: owner=${this.ownerSnowflake}, ` +
      `trusted=${this.trustedUsers.size}, channels=${this.allowedChannels.size || 'all'}`,
    );
  }

  /**
   * Check if a Discord user snowflake is the bot owner.
   */
  isOwner(userId: string): boolean {
    return userId === this.ownerSnowflake;
  }

  /**
   * Check if a Discord user snowflake is trusted (owner OR in trusted list).
   */
  isTrusted(userId: string): boolean {
    return this.isOwner(userId) || this.trustedUsers.has(userId);
  }

  /**
   * Check if a channel is allowed for bot interaction.
   *
   * When no channels are configured, all channels and DMs are allowed.
   * When channels are configured, only those channels are allowed, plus all DMs.
   *
   * @param channelId - Discord channel snowflake
   * @param isDM - Whether the channel is a DM
   */
  isChannelAllowed(channelId: string, isDM: boolean): boolean {
    // DMs are always allowed
    if (isDM) return true;
    // If no channels configured, allow all
    if (this.allowedChannels.size === 0) return true;
    // Otherwise check allowlist
    return this.allowedChannels.has(channelId);
  }

  /**
   * Full authorization check for an incoming Discord message.
   *
   * @param userId - Discord user snowflake
   * @param channelId - Discord channel snowflake
   * @param isDM - Whether the message is in a DM
   * @returns `true` when the user is authorized and the channel is allowed
   */
  isAuthorized(userId: string, channelId: string, isDM: boolean): boolean {
    if (!this.isTrusted(userId)) return false;
    if (!this.isChannelAllowed(channelId, isDM)) return false;
    return true;
  }

  /**
   * No-op shutdown for interface compatibility.
   */
  async shutdown(): Promise<void> {
    // Static config — nothing to release
  }
}
