/**
 * @fileoverview Command Parser — Lightweight Router
 *
 * Detects slash-command prefix and dispatches to the correct handler
 * module. Each command group lives in its own file under `commands/`.
 *
 * @module commands/parser
 * @see {@link parseCommand} — Main entry point
 *
 * ## Command Modules
 *
 * | Module              | Commands                                         |
 * |---------------------|--------------------------------------------------|
 * | task.ts             | /stop, /pause, /resume, /undo                    |
 * | context.ts          | /add, /drop, /files, /clear                      |
 * | project.ts          | /projects, /project, /clone, /init, /git, /diff  |
 * | settings.ts         | /mode, /auto, /verbose, /autocommit              |
 * | identity-commands.ts| /identity, /skill, /thread                       |
 * | trust.ts            | /trust                                           |
 * | proactive/commands  | /remind, /schedule, /cron                        |
 */

import { Session } from '../session/types.js';
import { SessionManager } from '../session/manager.js';
import { formatHelp, formatStatus } from '../agent/format.js';
import { formatProjectInfo } from '../session/project.js';
import { handleTrustCommand } from './trust.js';
import type { CommandResult } from './types.js';

// Handler modules
import { handleStop, handlePause, handleResume, handleUndo, handleUndoAll } from './task.js';
import { handleAddFile, handleDropFile, handleListFiles, handleClear } from './context.js';
import {
  handleListProjects,
  handleSwitchProject,
  handleClone,
  handleInit,
  handleGitStatus,
  handleGitDiff,
  handleGitLog,
} from './project.js';
import {
  handleToggleAutonomous,
  handleSetMode,
  handleToggleVerbose,
  handleToggleAutoCommit,
} from './settings.js';
import {
  handleIdentityCommand,
  handleSkillCommand,
  handleThreadCommand,
} from './identity-commands.js';
import {
  handleRemindCommand,
  handleScheduleCommand,
  handleCronList,
  handleCronRemove,
} from '../proactive/commands.js';

// Re-export the shared type so existing imports don't break
export type { CommandResult } from './types.js';

// =============================================================================
// MAIN ROUTER
// =============================================================================

/**
 * Parses and dispatches slash commands from user messages.
 *
 * @param message  - Raw user message
 * @param session  - Current session
 * @param sessionManager - Session manager
 * @returns Parse result — `handled: true` when a command was matched.
 */
export async function parseCommand(
  message: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const trimmed = message.trim();

  if (!trimmed.startsWith('/')) {
    return { handled: false, shouldProcess: true };
  }

  const [command, ...args] = trimmed.slice(1).split(/\s+/);
  const argString = args.join(' ');

  switch (command.toLowerCase()) {
    // ─── Project Management ────────────────────────────────────────────
    case 'projects':
    case 'ls':
      return handleListProjects(session, sessionManager);

    case 'select':
    case 'project':
    case 'cd':
      if (!argString) {
        if (session.currentProject) {
          return { handled: true, responses: [formatProjectInfo(session.currentProject)] };
        }
        return {
          handled: true,
          responses: ['No project selected.\n\nUse /projects to see available projects.'],
        };
      }
      return handleSwitchProject(argString, session, sessionManager);

    case 'status':
    case 'st':
      return { handled: true, responses: [await formatStatus(session)] };

    case 'version':
    case 'v':
      return { handled: true, responses: ['🤖 Fetch v3.3.0 (Deep Refinement)'] };

    // ─── Identity & Skills ─────────────────────────────────────────────
    case 'identity':
      return handleIdentityCommand(args, session);

    case 'skill':
    case 'skills':
      return handleSkillCommand(args, session);

    case 'thread':
    case 'threads':
      return handleThreadCommand(args, session, sessionManager);

    // ─── Task Control ──────────────────────────────────────────────────
    case 'stop':
    case 'cancel':
      return handleStop(session, sessionManager);

    case 'pause':
      return handlePause(session, sessionManager);

    case 'resume':
    case 'continue':
      return handleResume(session, sessionManager);

    case 'task':
      return { handled: true, responses: [await formatStatus(session)] };

    // ─── Context Management ────────────────────────────────────────────
    case 'add':
      return handleAddFile(argString, session, sessionManager);

    case 'drop':
    case 'remove':
      return handleDropFile(argString, session, sessionManager);

    case 'files':
    case 'context':
      return handleListFiles(session);

    case 'clear':
    case 'reset':
      return handleClear(session, sessionManager);

    // ─── Settings ──────────────────────────────────────────────────────
    case 'auto':
    case 'autonomous':
      return handleToggleAutonomous(session, sessionManager);

    case 'mode':
      if (argString) {
        return handleSetMode(argString, session, sessionManager);
      }
      return {
        handled: true,
        responses: [
          `Current mode: ${session.preferences.autonomyLevel}\n\nAvailable: supervised, cautious, autonomous`,
        ],
      };

    case 'verbose':
      return handleToggleVerbose(session, sessionManager);

    case 'autocommit':
      return handleToggleAutoCommit(session, sessionManager);

    // ─── Git Operations ────────────────────────────────────────────────
    case 'clone':
      return handleClone(argString, session, sessionManager);

    case 'init':
      return handleInit(argString, session, sessionManager);

    case 'gs':
    case 'git':
      return handleGitStatus(session);

    case 'diff':
      return handleGitDiff(session);

    case 'log':
      return handleGitLog(argString, session);

    case 'undo':
      if (argString.toLowerCase() === 'all') {
        return handleUndoAll(session, sessionManager);
      }
      return handleUndo(session, sessionManager);

    // ─── Security ──────────────────────────────────────────────────────
    case 'trust': {
      const result = await handleTrustCommand(argString);
      return { handled: true, responses: [result.response] };
    }

    // ─── Help ──────────────────────────────────────────────────────────
    case 'help':
    case 'h':
    case '?':
      return { handled: true, responses: [formatHelp()] };

    // ─── Proactive / Scheduling ────────────────────────────────────────
    case 'remind':
      return { handled: true, responses: [await handleRemindCommand(argString)] };

    case 'schedule':
      return { handled: true, responses: [await handleScheduleCommand(argString)] };

    case 'cron': {
      const sub = args[0]?.toLowerCase();
      if (sub === 'list' || sub === 'ls') {
        return { handled: true, responses: [await handleCronList()] };
      }
      if (sub === 'remove' || sub === 'rm') {
        return { handled: true, responses: [await handleCronRemove(args.slice(1).join(' '))] };
      }
      return { handled: true, responses: [await handleCronList()] };
    }

    // ─── Unknown ───────────────────────────────────────────────────────
    default:
      return {
        handled: true,
        responses: [`Unknown command: /${command}\n\nType /help for available commands.`],
      };
  }
}
