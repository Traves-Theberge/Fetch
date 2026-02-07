/**
 * @fileoverview Trust Command Handler - Zero Trust Bonding Management
 * 
 * Handles /trust commands for managing the phone number whitelist.
 * Only the owner can execute these commands.
 * 
 * @module commands/trust
 * @see {@link WhitelistStore} - Underlying storage
 * 
 * ## Commands
 * 
 * | Command | Description |
 * |---------|-------------|
 * | /trust add <number> | Add a phone number to whitelist |
 * | /trust remove <number> | Remove a phone number from whitelist |
 * | /trust list | Show all trusted numbers |
 * | /trust | Show trust command help |
 * 
 * @example
 * ```typescript
 * // Add trusted number
 * /trust add 15551234567
 * 
 * // Remove trusted number  
 * /trust remove 15551234567
 * 
 * // List all trusted numbers
 * /trust list
 * ```
 */

import { getWhitelistStore } from '../security/whitelist.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface TrustCommandResult {
  /** Response message to send */
  response: string;
  /** Whether the command was successful */
  success: boolean;
}

// =============================================================================
// COMMAND HANDLERS
// =============================================================================

/**
 * Handle /trust commands for whitelist management.
 * 
 * @param args - Command arguments (e.g., "add 15551234567")
 * @returns Command result with response message
 */
export async function handleTrustCommand(args: string): Promise<TrustCommandResult> {
  const parts = args.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase() || '';
  const phoneNumber = parts.slice(1).join('');

  switch (subcommand) {
    case 'add':
      return handleTrustAdd(phoneNumber);
    
    case 'remove':
    case 'rm':
    case 'delete':
      return handleTrustRemove(phoneNumber);
    
    case 'list':
    case 'ls':
      return handleTrustList();
    
    case 'clear':
      return handleTrustClear();
    
    default:
      return {
        success: true,
        response: formatTrustHelp()
      };
  }
}

/**
 * Add a phone number to the trusted whitelist.
 */
async function handleTrustAdd(phoneNumber: string): Promise<TrustCommandResult> {
  if (!phoneNumber) {
    return {
      success: false,
      response: '❌ Please provide a phone number.\n\nUsage: `/trust add <number>`\nExample: `/trust add 15551234567`'
    };
  }

  try {
    const whitelist = await getWhitelistStore();
    const normalized = whitelist.normalizeNumber(phoneNumber);

    if (normalized.length < 10) {
      return {
        success: false,
        response: `❌ Invalid phone number: \`${phoneNumber}\`\n\nPhone number must be at least 10 digits (including country code).`
      };
    }

    const added = await whitelist.add(phoneNumber);

    if (added) {
      logger.info(`Trust added: +${normalized}`);
      return {
        success: true,
        response: `✅ *Added to trusted numbers*\n\n📱 +${normalized}\n\nThis number can now use @fetch.`
      };
    } else {
      return {
        success: false,
        response: `ℹ️ +${normalized} is already in the trusted list.`
      };
    }
  } catch (error) {
    logger.error('Failed to add trusted number', error);
    return {
      success: false,
      response: '❌ Failed to add number. Please try again.'
    };
  }
}

/**
 * Remove a phone number from the trusted whitelist.
 */
async function handleTrustRemove(phoneNumber: string): Promise<TrustCommandResult> {
  if (!phoneNumber) {
    return {
      success: false,
      response: '❌ Please provide a phone number.\n\nUsage: `/trust remove <number>`\nExample: `/trust remove 15551234567`'
    };
  }

  try {
    const whitelist = await getWhitelistStore();
    const normalized = whitelist.normalizeNumber(phoneNumber);
    const removed = await whitelist.remove(phoneNumber);

    if (removed) {
      logger.info(`Trust removed: +${normalized}`);
      return {
        success: true,
        response: `✅ *Removed from trusted numbers*\n\n📱 +${normalized}\n\nThis number can no longer use @fetch.`
      };
    } else {
      return {
        success: false,
        response: `ℹ️ +${normalized} was not in the trusted list.`
      };
    }
  } catch (error) {
    logger.error('Failed to remove trusted number', error);
    return {
      success: false,
      response: '❌ Failed to remove number. Please try again.'
    };
  }
}

/**
 * List all trusted phone numbers.
 */
async function handleTrustList(): Promise<TrustCommandResult> {
  try {
    const whitelist = await getWhitelistStore();
    const numbers = whitelist.list();

    if (numbers.length === 0) {
      return {
        success: true,
        response: `🔐 *Trusted Numbers*\n\n_No trusted numbers configured._\n\nOnly the owner can use @fetch.\n\nAdd numbers with: \`/trust add <number>\``
      };
    }

    const numberList = numbers
      .map((num, i) => `${i + 1}. +${num}`)
      .join('\n');

    return {
      success: true,
      response: `🔐 *Trusted Numbers* (${numbers.length})\n\n${numberList}`
    };
  } catch (error) {
    logger.error('Failed to list trusted numbers', error);
    return {
      success: false,
      response: '❌ Failed to retrieve trusted numbers.'
    };
  }
}

/**
 * Clear all trusted numbers (dangerous!).
 */
async function handleTrustClear(): Promise<TrustCommandResult> {
  try {
    const whitelist = await getWhitelistStore();
    const count = whitelist.count();
    
    if (count === 0) {
      return {
        success: true,
        response: 'ℹ️ Trusted list is already empty.'
      };
    }

    await whitelist.clear();
    logger.warn(`Trust cleared: ${count} numbers removed`);
    
    return {
      success: true,
      response: `⚠️ *Trusted list cleared*\n\nRemoved ${count} number(s).\n\nOnly the owner can now use @fetch.`
    };
  } catch (error) {
    logger.error('Failed to clear trusted numbers', error);
    return {
      success: false,
      response: '❌ Failed to clear trusted numbers.'
    };
  }
}

/**
 * Format trust command help message.
 */
function formatTrustHelp(): string {
  return `🔐 *Trusted Numbers*

Manage who can use @fetch.

*Commands:*
\`/trust add <number>\` - Add trusted number
\`/trust remove <number>\` - Remove trusted number
\`/trust list\` - Show all trusted numbers
\`/trust clear\` - Remove all trusted numbers

*Examples:*
\`/trust add 15551234567\`
\`/trust remove +1 (555) 123-4567\``;
}
