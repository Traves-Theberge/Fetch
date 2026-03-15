/**
 * @fileoverview `/pm` command handler for project management operations.
 *
 * Dispatches subcommands (list, view, comment, update) to the PM tool handlers.
 *
 * @module commands/pm
 */

import { Session } from '../session/types.js';
import { handlePMList, handlePMView, handlePMComment, handlePMUpdate } from '../tools/pm.js';
import { logger } from '../utils/logger.js';
import type { CommandResult } from './types.js';

/**
 * Handle `/pm` command and subcommands.
 *
 * Usage:
 *   /pm list <provider> [--team <team>] [--assignee <user>] [--state <state>]
 *   /pm view <provider> <taskId>
 *   /pm comment <provider> <taskId> <body>
 *   /pm update <provider> <taskId> <status>
 */
export async function handlePM(
  argString: string,
  _session: Session,
): Promise<CommandResult> {
  const parts = argString.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  if (!subcommand) {
    return {
      handled: true,
      responses: [
        'Usage: /pm <list|view|comment|update> <provider> [args...]\nProviders: linear, jira, github',
      ],
    };
  }

  const provider = parts[1] as 'linear' | 'jira' | 'github' | undefined;
  if (!provider || !['linear', 'jira', 'github'].includes(provider)) {
    return {
      handled: true,
      responses: ['Please specify a provider: linear, jira, or github'],
    };
  }

  try {
    switch (subcommand) {
      case 'list':
      case 'ls': {
        const result = await handlePMList({ provider });
        return { handled: true, responses: [result.output || result.error || 'No results'] };
      }

      case 'view': {
        const taskId = parts[2];
        if (!taskId) return { handled: true, responses: ['Usage: /pm view <provider> <taskId>'] };
        const result = await handlePMView({ provider, taskId });
        return { handled: true, responses: [result.output || result.error || 'No results'] };
      }

      case 'comment': {
        const taskId = parts[2];
        const body = parts.slice(3).join(' ');
        if (!taskId || !body) return { handled: true, responses: ['Usage: /pm comment <provider> <taskId> <body>'] };
        const result = await handlePMComment({ provider, taskId, body });
        return { handled: true, responses: [result.output || result.error || 'Done'] };
      }

      case 'update': {
        const taskId = parts[2];
        const status = parts[3];
        if (!taskId || !status) return { handled: true, responses: ['Usage: /pm update <provider> <taskId> <status>'] };
        const result = await handlePMUpdate({ provider, taskId, status });
        return { handled: true, responses: [result.output || result.error || 'Done'] };
      }

      default:
        return { handled: true, responses: [`Unknown subcommand: ${subcommand}. Use list, view, comment, or update.`] };
    }
  } catch (err) {
    logger.error('PM command failed', { err, subcommand });
    return { handled: true, responses: [`PM command failed: ${err instanceof Error ? err.message : String(err)}`] };
  }
}
