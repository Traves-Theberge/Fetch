/**
 * @fileoverview Owner-only trusted-number command handlers.
 *
 * Implements `/trust` subcommands for whitelist management:
 * `add`, `remove|rm`, `list|ls`.
 *
 * @module commands/trust
 */

import { Session } from '../session/types.js';
import { getWhitelistStore } from '../security/whitelist.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { CommandResult } from './types.js';

/**
 * Check whether the current session user is the configured owner.
 */
function isOwner(session: Session): boolean {
  const ownerNumber = env.OWNER_PHONE_NUMBER?.replace(/\D/g, '') || '';
  const senderNumber = session.userId.replace(/\D/g, '');
  return senderNumber === ownerNumber;
}

/**
 * Handle `/trust` command and subcommands.
 *
 * @param argString - The arguments after `/trust` (e.g. "add 15551234567")
 * @param session - Current session for owner authorization
 * @returns Command result with formatted response text
 */
export async function handleTrust(
  argString: string,
  session: Session
): Promise<CommandResult> {
  // Owner-only gate
  if (!isOwner(session)) {
    return { handled: true, responses: ['🔒 Only the owner can manage trusted numbers.'] };
  }

  const whitelist = await getWhitelistStore();
  const [subcommand, ...rest] = argString.trim().split(/\s+/);
  const number = rest.join('');

  switch (subcommand?.toLowerCase()) {
    case 'add': {
      if (!number || number.replace(/\D/g, '').length < 10) {
        return { handled: true, responses: ['Usage: `/trust add <phone number>`\nExample: `/trust add 15551234567`'] };
      }
      const added = await whitelist.add(number);
      if (added) {
        logger.success(`Owner added trusted number via /trust: ${number}`);
        return { handled: true, responses: [`✅ Added +${number.replace(/\D/g, '')} to trusted numbers.`] };
      }
      return { handled: true, responses: [`ℹ️ +${number.replace(/\D/g, '')} is already trusted.`] };
    }

    case 'remove':
    case 'rm': {
      if (!number || number.replace(/\D/g, '').length < 10) {
        return { handled: true, responses: ['Usage: `/trust remove <phone number>`\nExample: `/trust remove 15551234567`'] };
      }
      const removed = await whitelist.remove(number);
      if (removed) {
        logger.success(`Owner removed trusted number via /trust: ${number}`);
        return { handled: true, responses: [`✅ Removed +${number.replace(/\D/g, '')} from trusted numbers.`] };
      }
      return { handled: true, responses: [`ℹ️ +${number.replace(/\D/g, '')} was not in the whitelist.`] };
    }

    case 'list':
    case 'ls': {
      const numbers = whitelist.list();
      if (numbers.length === 0) {
        return { handled: true, responses: ['🔐 *Trusted Numbers*\n\nNo trusted numbers configured.\nUse `/trust add <number>` to add one.'] };
      }
      let msg = `🔐 *Trusted Numbers* (${numbers.length})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      numbers.forEach((num, i) => {
        msg += `${i + 1}. +${num}\n`;
      });
      msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
      return { handled: true, responses: [msg] };
    }

    default:
      return {
        handled: true,
        responses: [
          `🔐 *Trust Commands* (owner only)\n\n` +
          `/trust add <number> — Add trusted number\n` +
          `/trust remove <number> — Remove number\n` +
          `/trust list — Show all trusted numbers`,
        ],
      };
  }
}
