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

  if (newLevel === 'autonomous') {
    return { handled: true, responses: [
      `🤖 *Autonomous mode ON*\n\n` +
      `• I'll execute tasks without asking for confirmation\n` +
      `• I'll auto-commit changes when done\n` +
      `• Use \`/mode cautious\` to go back to asking first`
    ] };
  } else {
    return { handled: true, responses: [
      `👀 *Cautious mode ON*\n\n` +
      `• I'll ask before destructive actions (delete, overwrite)\n` +
      `• Non-destructive actions proceed automatically\n` +
      `• Use \`/auto\` to toggle back`
    ] };
  }
}

export async function handleSetMode(
  mode: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const validModes = ['supervised', 'cautious', 'autonomous'];
  const normalized = mode.toLowerCase();

  // Handle common confusion: /mode verbose → redirect to /verbose
  if (normalized === 'verbose') {
    return { handled: true, responses: [
      `ℹ️ "verbose" is a setting, not a mode.\n\n` +
      `• Use \`/verbose\` to toggle detailed output\n` +
      `• Modes: \`supervised\`, \`cautious\`, \`autonomous\`\n` +
      `• Use \`/mode <name>\` to change mode`
    ] };
  }

  if (!validModes.includes(normalized)) {
    return { handled: true, responses: [
      `Invalid mode: "${mode}"\n\n` +
      `Available modes:\n` +
      `• 👁️ \`supervised\` — Ask before every action\n` +
      `• 👀 \`cautious\` — Ask only for destructive actions\n` +
      `• 🤖 \`autonomous\` — Execute everything without asking`
    ] };
  }

  await sessionManager.setAutonomyLevel(
    session,
    normalized as 'supervised' | 'cautious' | 'autonomous'
  );

  const descriptions: Record<string, string> = {
    supervised: '👁️ *Supervised mode*\n\n• I\'ll ask before every action\n• Full control over what gets executed\n• Best for critical/production work',
    cautious: '👀 *Cautious mode*\n\n• I\'ll ask before destructive actions (delete, overwrite)\n• Non-destructive actions proceed automatically\n• Default recommended mode',
    autonomous: '🤖 *Autonomous mode*\n\n• I\'ll execute everything without asking\n• Auto-commit changes when done\n• Best for trusted, fast iteration',
  };

  return { handled: true, responses: [descriptions[normalized]] };
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
