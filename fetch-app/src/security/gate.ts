/**
 * @fileoverview Authorization gate for inbound WhatsApp messages.
 *
 * Enforcement rules:
 * - message must include `@fetch` trigger
 * - sender must be owner or trusted whitelist member
 * - broadcast traffic is rejected
 * - unauthorized traffic is dropped without response
 *
 * @module security/gate
 */

import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { getWhitelistStore, type WhitelistStore } from './whitelist.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Trigger prefix required for non-thread traffic. */
const FETCH_TRIGGER = '@fetch';

// =============================================================================
// SECURITY GATE CLASS
// =============================================================================

/**
 * Message authorization gate backed by owner identity and whitelist checks.
 */
export class SecurityGate {
  private readonly ownerNumberClean: string;
  private whitelist: WhitelistStore | null = null;

  constructor() {
    const ownerNumber = env.OWNER_PHONE_NUMBER;

    if (!ownerNumber) {
      throw new Error('CRITICAL: OWNER_PHONE_NUMBER environment variable is not set');
    }

    // Store clean number for participant checking
    this.ownerNumberClean = ownerNumber.replace(/\D/g, '');
  }

  /**
   * Creates and initializes the gate with whitelist state.
   */
  static async create(): Promise<SecurityGate> {
    const gate = new SecurityGate();
    await gate.initializeWhitelist();
    return gate;
  }

  /**
   * Initializes whitelist dependencies.
   */
  async initializeWhitelist(): Promise<void> {
    this.whitelist = await getWhitelistStore();

    logger.section('🔒 Security Gate Initialized');
    logger.info(`Owner: +${this.ownerNumberClean} (always trusted)`);
    logger.info(`Trusted numbers: ${this.whitelist.count()}`);
    logger.info(`Trigger: ${FETCH_TRIGGER} (case-insensitive)`);
    logger.divider();
  }

  /**
   * Returns initialized whitelist store, or null when not ready.
   */
  getWhitelist(): WhitelistStore | null {
    return this.whitelist;
  }

  /**
   * Returns true when message starts with the `@fetch` trigger.
   */
  hasFetchTrigger(messageBody: string): boolean {
    return messageBody.toLowerCase().trim().startsWith(FETCH_TRIGGER);
  }

  /**
   * Removes leading `@fetch` trigger from message text.
   */
  stripTrigger(messageBody: string): string {
    const body = messageBody.trim();
    if (body.toLowerCase().startsWith(FETCH_TRIGGER)) {
      return body.substring(FETCH_TRIGGER.length).trim();
    }
    return body;
  }

  /**
   * Normalizes WhatsApp IDs to digit-only phone numbers.
   */
  private extractNumber(whatsappId: string): string {
    // Remove @c.us or @g.us suffix and any non-numeric chars
    return whatsappId.replace(/@(c|g|s)\.us$/, '').replace(/\D/g, '');
  }

  /**
   * Returns true when identifier belongs to configured owner.
   */
  private isOwner(whatsappId: string): boolean {
    const number = this.extractNumber(whatsappId);
    return number === this.ownerNumberClean;
  }

  /**
   * Returns true when identifier exists in trusted whitelist.
   */
  private isTrusted(whatsappId: string): boolean {
    if (!this.whitelist) return false;
    const number = this.extractNumber(whatsappId);
    return this.whitelist.has(number);
  }

  /**
   * Checks owner authorization without requiring `@fetch` trigger.
   * 
   * @param senderId - WhatsApp chat ID
   * @param participantId - For groups, the actual sender's ID
   */
  isOwnerMessage(senderId: string, participantId: string | undefined): boolean {
    try {
      // Reject broadcast messages
      if (senderId.includes('broadcast')) {
        return false;
      }

      const isGroup = senderId.endsWith('@g.us');

      if (isGroup) {
        if (!participantId) return false;
        return this.isOwner(participantId);
      }

      return this.isOwner(senderId);
    } catch {
      return false;
    }
  }

  /**
   * Checks whether a WhatsApp ID belongs to owner or trusted member.
   * 
   * @param whatsappId - The ID to check (@c.us, @g.us, or participant ID)
   */
  isAuthorizedUser(whatsappId: string): boolean {
    const number = this.extractNumber(whatsappId);
    return this.isOwner(whatsappId) || (this.whitelist?.has(number) ?? false);
  }

  /**
   * Authorizes inbound message based on trigger + owner/whitelist policy.
   * 
   * @param senderId - WhatsApp chat ID (can be @c.us or @g.us)
   * @param participantId - For groups, the actual sender's ID
   * @param messageBody - The message content
   */
  isAuthorized(senderId: string, participantId: string | undefined, messageBody: string): boolean {
    try {
      // Reject broadcast messages silently
      if (senderId.includes('broadcast')) {
        return false;
      }

      const isGroup = senderId.endsWith('@g.us');
      const chatType = isGroup ? 'group' : 'direct';
      const preview = messageBody.substring(0, 30).replace(/\n/g, ' ');

      // Must have @fetch trigger
      if (!this.hasFetchTrigger(messageBody)) {
        // Only log if it looks like an attempted command (starts with @)
        if (messageBody.trim().startsWith('@')) {
          logger.debug(`Ignored ${chatType} message (no @fetch): "${preview}..."`);
        }
        return false;
      }

      // Determine which ID to check
      const checkId = isGroup ? participantId : senderId;

      if (isGroup && !participantId) {
        logger.warn('Group message missing participant ID');
        return false;
      }

      // Check 1: Owner is ALWAYS allowed (exempt from whitelist)
      if (this.isOwner(checkId!)) {
        logger.success(`Authorized from owner (${chatType})`);
        return true;
      }

      // Check 2: Trusted whitelist member
      if (this.isTrusted(checkId!)) {
        const number = this.extractNumber(checkId!);
        logger.success(`Authorized from trusted number +${number} (${chatType})`);
        return true;
      }

      // Not owner and not in whitelist - DROP
      logger.warn(`Blocked: @fetch from untrusted number (${chatType})`);
      return false;
    } catch (error) {
      logger.error('Security gate error - denying access', error);
      return false;
    }
  }
}
