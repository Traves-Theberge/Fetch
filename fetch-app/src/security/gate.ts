/**
 * Security Gate - Whitelist Enforcement
 * 
 * CRITICAL SECURITY COMPONENT
 * This module enforces strict phone number whitelist validation.
 * Only messages from OWNER_PHONE_NUMBER with @fetch trigger are allowed.
 */

import { logger } from '../utils/logger.js';

// The trigger prefix (case-insensitive)
const FETCH_TRIGGER = '@fetch';

export class SecurityGate {
  private readonly ownerNumberClean: string;

  constructor() {
    const ownerNumber = process.env.OWNER_PHONE_NUMBER;
    
    if (!ownerNumber) {
      throw new Error('CRITICAL: OWNER_PHONE_NUMBER environment variable is not set');
    }

    // Store clean number for participant checking
    this.ownerNumberClean = ownerNumber.replace(/\D/g, '');

    logger.section('🔒 Security Gate Initialized');
    logger.info(`Owner: +${this.ownerNumberClean}`);
    logger.info(`Trigger: ${FETCH_TRIGGER} (case-insensitive)`);
    logger.divider();
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
   * Requires: @fetch trigger + owner (direct or group participant)
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

      // Check if it's a group message
      if (isGroup) {
        if (!participantId) {
          logger.warn('Group message missing participant ID');
          return false;
        }
        if (!this.isOwner(participantId)) {
          logger.warn(`Blocked: @fetch from non-owner in group`);
          return false;
        }
        logger.success(`Authorized from owner (group chat)`);
        return true;
      }

      // Direct message: check sender
      if (!this.isOwner(senderId)) {
        logger.warn(`Blocked: @fetch from unknown number`);
        return false;
      }

      logger.success(`Authorized from owner (direct message)`);
      return true;
    } catch (error) {
      logger.error('Security gate error - denying access', error);
      return false;
    }
  }
}
