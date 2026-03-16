/**
 * @fileoverview /pm command handler.
 *
 * Stub implementation — delegates to the PM tool handlers once configured.
 *
 * @module commands/pm
 */

import type { Session } from '../session/types.js';
import type { CommandResult } from './types.js';

export function handlePM(_args: string[], _session: Session): CommandResult {
  return {
    handled: true,
    responses: ['PM integration is not yet configured. Set up a provider (Linear, Jira, or GitHub) in your environment to enable /pm commands.'],
  };
}
