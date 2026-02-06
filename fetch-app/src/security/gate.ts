/**
 * @fileoverview Security Gate - Zero Trust Bonding
 * 
 * CRITICAL SECURITY COMPONENT
 * 
 * Enforces strict phone number whitelist validation. Only messages from
 * the owner OR explicitly trusted phone numbers with @fetch trigger are
 * processed. All other messages are silently dropped.
 * 
 * @module security/gate
 * @see {@link SecurityGate} - Main gate class
 * @see {@link WhitelistStore} - Trusted numbers management
 * 
 * ## Security Model (Zero Trust Bonding)
 * 
 * "Fetch is loyal to his owner and people his owner explicitly trusts."
 * 
 * ```
 * Incoming Message
 *      ↓
 * Has @fetch trigger?
 *      │ No → DROP (silent)
 *      ↓ Yes
 * From owner?
 *      │ Yes → ALLOW (owner is always exempt)
 *      ↓ No
 * In trusted whitelist?
 *      │ Yes → ALLOW
 *      ↓ No
 * DROP (silent)
 * ```
 * 
 * ## Configuration
 * 
 * - OWNER_PHONE_NUMBER: Required environment variable (always trusted)
 * - TRUSTED_PHONE_NUMBERS: Optional comma-separated list of trusted numbers
 * - Trigger prefix: `@fetch` (case-insensitive)
 * 
 * ## IMPORTANT
 * 
 * - Unauthorized messages are dropped WITHOUT response
 * - This prevents information leakage about the bot's existence
 * - Broadcast messages are always rejected
 * - Owner can manage whitelist via /trust commands
 * 
 * @example
 * ```typescript
 * const gate = await SecurityGate.create();
 * 
 * if (gate.isAuthorized(senderId, participantId, message)) {
 *   const cleanMessage = gate.stripTrigger(message);
 *   // Process message
 * }
 * // Silently ignore unauthorized
 * ```
 */

import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { getWhitelistStore, type WhitelistStore } from './whitelist.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** The trigger prefix (case-insensitive) */
const FETCH_TRIGGER = '@fetch';

// =============================================================================
// SECURITY GATE CLASS
// =============================================================================

/**
 * Security gate enforcing Zero Trust Bonding.
 * 
 * Only processes messages from owner OR trusted whitelist members
 * that start with @fetch. All other messages are silently dropped.
 * 
 * @class
 * @throws {Error} If OWNER_PHONE_NUMBER is not set
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
   * Factory method to create and initialize SecurityGate with whitelist.
   */
  static async create(): Promise<SecurityGate> {
    const gate = new SecurityGate();
    await gate.initializeWhitelist();
    return gate;
  }

  /**
   * Initialize the whitelist store.
   * Call this after construction to enable Zero Trust Bonding.
   */
  async initializeWhitelist(): Promise<void> {
    this.whitelist = await getWhitelistStore();
    
    logger.section('🔒 Security Gate Initialized (Zero Trust Bonding)');
    logger.info(`Owner: +${this.ownerNumberClean} (always trusted)`);
    logger.info(`Trusted numbers: ${this.whitelist.count()}`);
    logger.info(`Trigger: ${FETCH_TRIGGER} (case-insensitive)`);
    logger.divider();
  }

  /**
   * Get the whitelist store for management operations.
   */
  getWhitelist(): WhitelistStore | null {
    return this.whitelist;
  }

  /**
   * Check if message starts with @fetch trigger
   */
  hasFetchTrigger(messageBody: string): boolean {
    return messageBody.toLowerCase().trim().startsWith(FETCH_TRIGGER);
  }

  /**
   * Strip the @fetch trigger from message body
   */
  stripTrigger(messageBody: string): string {
    const body = messageBody.trim();
    if (body.toLowerCase().startsWith(FETCH_TRIGGER)) {
      return body.substring(FETCH_TRIGGER.length).trim();
    }
    return body;
  }

  /**
   * Extract the sender's phone number from various WhatsApp ID formats
   */
  private extractNumber(whatsappId: string): string {
    // Remove @c.us or @g.us suffix and any non-numeric chars
    return whatsappId.replace(/@(c|g|s)\.us$/, '').replace(/\D/g, '');
  }

  /**
   * Check if sender/participant is the owner
   */
  private isOwner(whatsappId: string): boolean {
    const number = this.extractNumber(whatsappId);
    return number === this.ownerNumberClean;
  }

  /**
   * Check if sender/participant is in the trusted whitelist.
   * Owner is checked separately (always trusted).
   */
  private isTrusted(whatsappId: string): boolean {
    if (!this.whitelist) return false;
    const number = this.extractNumber(whatsappId);
    return this.whitelist.has(number);
  }

  /**
   * Check if message is from the owner (without @fetch requirement)
   * Used for thread replies where @fetch trigger is not needed
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
   * Check if a message is authorized (Zero Trust Bonding)
   * Requires: @fetch trigger + (owner OR trusted whitelist member)
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
