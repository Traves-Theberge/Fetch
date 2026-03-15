/**
 * @fileoverview Slash-command router executed before the LLM.
 *
 * Purpose:
 * - handle deterministic safety commands synchronously
 * - bypass LLM for commands that must work even when model/tool calls fail
 * - pass all non-matching input through to normal agent processing
 *
 * @module commands/parser
 * @see {@link parseCommand} Main router
 *
 * ## Safety Escapes
 *
 * | Command           | Handler            | Why it bypasses the LLM            |
 * |-------------------|--------------------|------------------------------------|
 * | /stop, /cancel    | task.handleStop    | Must kill a running task instantly  |
 * | /undo, /undo all  | task.handleUndo*   | Immediate task/git recovery guidance/action |
 * | /clear, /reset    | (inline)           | Wipe session — no LLM needed       |
 * | /help, /h, /?     | format.formatHelp  | Show help — no LLM needed          |
 * | /status, /st      | format.formatStatus| Show system status — no LLM needed |
 * | /version, /v      | (inline)           | Print version string               |
 * | /usage, /u        | format.formatUsage | Show OpenRouter API usage           |
 * | /trust            | trust.handleTrust  | Owner-only whitelist management     |
 */

import { Session } from '../session/types.js';
import { SessionManager } from '../session/manager.js';
import { formatHelp, formatStatus, formatUsage } from '../agent/format.js';
import { envelopeFromToolResult } from '../agent/envelope.js';
import { handleStop, handleUndo, handleUndoAll } from './task.js';
import { handleTrust } from './trust.js';
import { handlePM } from './pm.js';
import { handleWorkspaceList, handleWorkspaceStatus, handleWorkspaceSync } from '../tools/workspace.js';
import { VERSION } from '../config/env.js';
import type { CommandResult } from './types.js';

// Re-export the shared type so existing imports don't break
export type { CommandResult } from './types.js';

// =============================================================================
// MAIN ROUTER
// =============================================================================

/**
 * Parse a message and execute deterministic slash commands when applicable.
 * Natural-language requests (including "what can you do?") intentionally
 * pass through to the LLM so responses can stay conversational and contextual.
 *
  * @param message  - Raw user message
  * @param session  - Current session
  * @param sessionManager - Session manager
 * @returns Command result indicating whether parsing consumed the message
 */
export async function parseCommand(
  message: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const trimmed = message.trim();
  const normalized = trimmed.toLowerCase();

  if (!trimmed.startsWith('/')) {
    // Deterministic natural-language routes for high-signal operational intents.
    if (/^(status|project status|workspace status)$/i.test(trimmed)) {
      const result = await handleWorkspaceStatus({});
      const envelope = envelopeFromToolResult(result, {
        kind: 'status',
        title: 'Workspace Status',
        successAsk: 'Want me to sync or inspect project files next?',
        failureAsk: 'Want me to list available workspaces first?',
        rawToolRef: 'workspace_status',
      });
      return {
        handled: true,
        envelopes: [envelope],
      };
    }

    if (/^(what workspaces do i have|what projects do i have|list projects|list workspaces)$/i.test(trimmed)) {
      const result = await handleWorkspaceList({});
      const envelope = envelopeFromToolResult(result, {
        kind: 'status',
        title: 'Available Workspaces',
        successAsk: 'Want me to select one and continue?',
        failureAsk: 'Unable to list workspaces right now. Want me to check container status?',
        rawToolRef: 'workspace_list',
      });
      return {
        handled: true,
        envelopes: [envelope],
      };
    }

    if (
      /\b(commit|sync|push)\b/i.test(trimmed) &&
      /\b(push|sync)\b/i.test(trimmed)
    ) {
      const result = await handleWorkspaceSync({ message: 'chore: sync changes via fetch' });
      const envelope = envelopeFromToolResult(result, {
        kind: 'action_result',
        title: 'Git Sync',
        successAsk: 'Want me to open a PR next?',
        failureAsk: 'Want me to check GitHub auth and repo remote configuration?',
        rawToolRef: 'workspace_sync',
      });
      return {
        handled: true,
        envelopes: [envelope],
      };
    }

    if (normalized === 'yes' || normalized === 'y') {
      // Keep acknowledgements conversational when no deterministic command is pending.
      return { handled: false, shouldProcess: true };
    }

    return { handled: false, shouldProcess: true };
  }

  const [command, ...args] = trimmed.slice(1).split(/\s+/);
  const argString = args.join(' ');

  switch (command.toLowerCase()) {
    // ─── Task Control (kill / revert) ──────────────────────────────────
    case 'stop':
    case 'cancel':
      return handleStop(session, sessionManager);

    case 'undo':
      if (argString.toLowerCase() === 'all') {
        return handleUndoAll(session, sessionManager);
      }
      return handleUndo(session, sessionManager);

    // ─── Session Reset ─────────────────────────────────────────────────
    case 'clear':
    case 'reset': {
      try {
        const cleared = { ...session, messages: [], activeFiles: [], activeTaskId: null, repoMap: null };
        await sessionManager.updateSession(cleared as typeof session);
        // Only mutate after confirmed DB write
        session.messages = [];
        session.activeFiles = [];
        session.activeTaskId = null;
        session.repoMap = null;
        return { handled: true, responses: ['🧹 Conversation cleared. Preferences retained.'] };
      } catch {
        return { handled: true, responses: ['Failed to clear session. Please try again.'] };
      }
    }

    // ─── Information ───────────────────────────────────────────────────
    case 'help':
    case 'h':
    case '?':
      return { handled: true, responses: [formatHelp()] };

    case 'status':
    case 'st':
      return { handled: true, responses: [await formatStatus(session)] };

    case 'version':
    case 'v':
      return { handled: true, responses: [`🐕 Fetch ${VERSION} (Good Boy Reporting!)`] };

    case 'usage':
    case 'u':
      return { handled: true, responses: [await formatUsage()] };

    // ─── Whitelist Management (owner only) ──────────────────────────────
    case 'trust':
      return handleTrust(argString, session);

    // ─── Project Management ───────────────────────────────────────────
    case 'pm':
      return handlePM(args, session);

    // ─── Everything else → LLM ─────────────────────────────────────────
    default:
      return { handled: false, shouldProcess: true };
  }
}
