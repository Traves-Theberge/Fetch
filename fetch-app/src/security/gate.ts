/**
 * Security Gate - Whitelist Enforcement
 * 
 * CRITICAL SECURITY COMPONENT
 * This module enforces strict phone number whitelist validation.
 * Only messages from OWNER_PHONE_NUMBER are allowed through.
 */

import { logger } from '../utils/logger.js';

export class SecurityGate {
  private readonly allowedNumbers: Set<string>;

  constructor() {
    const ownerNumber = process.env.OWNER_PHONE_NUMBER;
    
    if (!ownerNumber) {
      throw new Error('CRITICAL: OWNER_PHONE_NUMBER environment variable is not set');
    }

    // Normalize and store allowed numbers
    // WhatsApp JIDs format: <number>@c.us for individual chats
    this.allowedNumbers = new Set([
      this.normalizeNumber(ownerNumber)
    ]);

    logger.info(`Security Gate initialized with ${this.allowedNumbers.size} authorized number(s)`);
  }

  /**
   * Normalize phone number to WhatsApp JID format
   * Strips all non-numeric characters and adds @c.us suffix
   */
  private normalizeNumber(phoneNumber: string): string {
    // Remove all non-numeric characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    return `${cleaned}@c.us`;
  }

  /**
   * Check if a sender is authorized
   * @param senderId - WhatsApp JID of the message sender
   * @returns true if authorized, false otherwise
   * 
   * SECURITY: This method must NEVER throw an exception
   * Failed validations must silently return false
   */
  isAuthorized(senderId: string): boolean {
    try {
      // Reject group messages (format: <id>@g.us)
      if (senderId.endsWith('@g.us')) {
        return false;
      }

      // Reject broadcast messages
      if (senderId.includes('broadcast')) {
        return false;
      }

      // Check against whitelist
      return this.allowedNumbers.has(senderId);
    } catch {
      // SECURITY: Any error results in denial
      logger.error('Security gate validation error - denying access');
      return false;
    }
  }
}
