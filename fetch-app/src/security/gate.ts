/**
 * @fileoverview Security Gate - Whitelist Enforcement
 * 
 * CRITICAL SECURITY COMPONENT
 * 
 * Enforces strict phone number whitelist validation. Only messages from
 * OWNER_PHONE_NUMBER with @fetch trigger are processed. All other messages
 * are silently dropped.
 * 
 * @module security/gate
 * @see {@link SecurityGate} - Main gate class
 * 
 * ## Security Model
 * 
 * ```
 * Incoming Message
 *      ↓
 * Has @fetch trigger?
 *      │ No → DROP (silent)
 *      ↓ Yes
 * From owner (direct)?
 *      │ Yes → ALLOW
 *      ↓ No
 * In group with owner participant?
 *      │ Yes → ALLOW
 *      ↓ No
 * DROP (silent)
 * ```
 * 
 * ## Configuration
 * 
 * - OWNER_PHONE_NUMBER: Required environment variable
 * - Trigger prefix: `@fetch` (case-insensitive)
 * 
 * ## IMPORTANT
 * 
 * - Unauthorized messages are dropped WITHOUT response
 * - This prevents information leakage about the bot's existence
 * - Broadcast messages are always rejected
 * 
 * @example
 * ```typescript
 * const gate = new SecurityGate();
 * 
 * if (gate.isAuthorized(senderId, participantId, message)) {
 *   const cleanMessage = gate.stripTrigger(message);
 *   // Process message
 * }
 * // Silently ignore unauthorized
 * ```
 */

import { logger } from '../utils/logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** The trigger prefix (case-insensitive) */
const FETCH_TRIGGER = '@fetch';

/** How long a conversation stays active without @fetch (10 minutes) */
const CONVERSATION_TIMEOUT_MS = 10 * 60 * 1000;

// =============================================================================
// SECURITY GATE CLASS
// =============================================================================

/**
 * Security gate enforcing phone number whitelist.
 *
 * First message requires @fetch trigger from owner.
 * Follow-up messages within 10 minutes don't need @fetch.
 *
 * @class
 * @throws {Error} If OWNER_PHONE_NUMBER is not set
 */
export class SecurityGate {
  private readonly ownerNumberClean: string;
  /** Track last interaction time per chat for conversation mode */
  private activeConversations: Map<string, number> = new Map();

  constructor() {
    const ownerNumber = process.env.OWNER_PHONE_NUMBER;

    if (!ownerNumber) {
      throw new Error('CRITICAL: OWNER_PHONE_NUMBER environment variable is not set');
    }

    // Store clean number for participant checking
    this.ownerNumberClean = ownerNumber.replace(/\D/g, '');

    logger.section('🔒 Security Gate Initialized');
    logger.info(`Owner: +${this.ownerNumberClean}`);
    logger.info(`Trigger: ${FETCH_TRIGGER} (or reply within 10min)`);
    logger.divider();
  }

  /**
   * Check if there's an active conversation with this chat
   */
  hasActiveConversation(chatId: string): boolean {
    const lastActivity = this.activeConversations.get(chatId);
    if (!lastActivity) return false;

    const elapsed = Date.now() - lastActivity;
    if (elapsed > CONVERSATION_TIMEOUT_MS) {
      this.activeConversations.delete(chatId);
      return false;
    }
    return true;
  }

  /**
   * Mark a conversation as active (called after processing a message)
   */
  touchConversation(chatId: string): void {
    this.activeConversations.set(chatId, Date.now());
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
   * Check if a message is authorized
   * Requires: @fetch trigger OR active conversation + owner
   *
   * @param senderId - WhatsApp chat ID (can be @c.us or @g.us)
   * @param participantId - For groups, the actual sender's ID
   * @param messageBody - The message content
   * @returns Object with authorized status and whether trigger was used
   */
  isAuthorized(senderId: string, participantId: string | undefined, messageBody: string): boolean {
    try {
      // Reject broadcast messages silently
      if (senderId.includes('broadcast')) {
        return false;
      }

      const isGroup = senderId.endsWith('@g.us');
      const hasTrigger = this.hasFetchTrigger(messageBody);
      const hasActiveConvo = this.hasActiveConversation(senderId);

      // Need either @fetch trigger OR active conversation
      if (!hasTrigger && !hasActiveConvo) {
        return false;
      }

      // Check if it's a group message
      if (isGroup) {
        if (!participantId) {
          logger.warn('Group message missing participant ID');
          return false;
        }
        if (!this.isOwner(participantId)) {
          if (hasTrigger) {
            logger.warn(`Blocked: @fetch from non-owner in group`);
          }
          return false;
        }
        logger.success(`Authorized from owner (group chat${hasActiveConvo && !hasTrigger ? ', conversation mode' : ''})`);
        return true;
      }

      // Direct message: check sender
      if (!this.isOwner(senderId)) {
        if (hasTrigger) {
          logger.warn(`Blocked: @fetch from unknown number`);
        }
        return false;
      }

      logger.success(`Authorized from owner (${hasActiveConvo && !hasTrigger ? 'conversation mode' : 'direct message'})`);
      return true;
    } catch (error) {
      logger.error('Security gate error - denying access', error);
      return false;
    }
  }
}
