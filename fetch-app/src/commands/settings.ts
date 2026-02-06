/**
 * @fileoverview Settings / Preferences Command Handlers
 *
 * Handlers for /auto, /mode, /verbose, /autocommit.
 *
 * @module commands/settings
 */

import { Session } from '../session/types.js';
import { SessionManager } from '../session/manager.js';
import type { CommandResult } from './types.js';

export async function handleToggleAutonomous(
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const newLevel =
    session.preferences.autonomyLevel === 'autonomous' ? 'cautious' : 'autonomous';

  await sessionManager.setAutonomyLevel(session, newLevel);

  const emoji = newLevel === 'autonomous' ? '🤖' : '👀';
  return { handled: true, responses: [`${emoji} Switched to ${newLevel} mode.`] };
}

export async function handleSetMode(
  mode: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const validModes = ['supervised', 'cautious', 'autonomous'];
  const normalized = mode.toLowerCase();

  if (!validModes.includes(normalized)) {
    return { handled: true, responses: [`Invalid mode. Choose: ${validModes.join(', ')}`] };
  }

  await sessionManager.setAutonomyLevel(
    session,
    normalized as 'supervised' | 'cautious' | 'autonomous'
  );

  const emojis: Record<string, string> = {
    supervised: '👁️',
    cautious: '👀',
    autonomous: '🤖',
  };

  return { handled: true, responses: [`${emojis[normalized]} Mode set to ${normalized}.`] };
}

export async function handleToggleVerbose(
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const newVerbose = !session.preferences.verboseMode;
  await sessionManager.updatePreferences(session, { verboseMode: newVerbose });

  return {
    handled: true,
    responses: [newVerbose ? '📢 Verbose mode ON' : '🔇 Verbose mode OFF'],
  };
}

export async function handleToggleAutoCommit(
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const newAutoCommit = !session.preferences.autoCommit;
  await sessionManager.updatePreferences(session, { autoCommit: newAutoCommit });

  return {
    handled: true,
    responses: [newAutoCommit ? '💾 Auto-commit ON' : '💾 Auto-commit OFF'],
  };
}
