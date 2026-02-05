/**
 * Scheduling Instinct
 * 
 * Handles /remind, /schedule, and /cron commands.
 */

import { handleRemindCommand, handleCronList, handleCronRemove, handleScheduleCommand } from '../proactive/commands.js';
import type { Instinct, InstinctContext, InstinctResponse } from './types.js';

export const schedulingInstinct: Instinct = {
  name: 'scheduling',
  description: 'Manage schedule and reminders (/remind, /cron)',
  triggers: ['/remind', '/schedule', '/cron'],
  patterns: [
    /^\/remind\s+(.+)/i,
    /^\/schedule\s+(.+)/i,
    /^\/cron\s+list/i,
    /^\/cron\s+remove\s+(.+)/i,
  ],
  priority: 10,
  enabled: true,
  category: 'system',

  handler: async (ctx: InstinctContext): Promise<InstinctResponse> => {
    const { message } = ctx;

    // /remind
    if (message.startsWith('/remind ')) {
      const response = await handleRemindCommand(message);
      return { matched: true, response, continueProcessing: false };
    }

    // /schedule
    if (message.startsWith('/schedule ')) {
      const response = await handleScheduleCommand(message);
      return { matched: true, response, continueProcessing: false };
    }

    // /cron list
    if (message.match(/^\/cron\s+list/i)) {
      const response = await handleCronList();
      return { matched: true, response, continueProcessing: false };
    }

    // /cron remove
    const removeMatch = message.match(/^\/cron\s+remove\s+(.+)/i);
    if (removeMatch) {
      const response = await handleCronRemove(removeMatch[1]);
      return { matched: true, response, continueProcessing: false };
    }

    return { matched: false, response: '', continueProcessing: true };
  },
};
