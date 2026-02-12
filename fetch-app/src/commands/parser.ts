/**
 * @fileoverview Command Parser — Safety Gate
 *
 * In v4.0 the conversation IS the interface. The LLM handles everything
 * via its tool belt. This parser is a thin safety gate that intercepts
 * only the handful of deterministic escape-hatch commands that must
 * work instantly and without an LLM round-trip.
 *
 * Everything else — even if it starts with `/` — passes straight
 * through to the agent so the LLM can interpret it naturally.
 *
 * @module commands/parser
 * @see {@link parseCommand} — Main entry point
 *
 * ## Safety Escapes
 *
 * | Command           | Handler            | Why it bypasses the LLM            |
 * |-------------------|--------------------|------------------------------------|
 * | /stop, /cancel    | task.handleStop    | Must kill a running task instantly  |
 * | /undo, /undo all  | task.handleUndo*   | Deterministic git reset            |
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
import { handleStop, handleUndo, handleUndoAll } from './task.js';
import { handleTrust } from './trust.js';
import { VERSION } from '../config/env.js';
import type { CommandResult } from './types.js';

// Re-export the shared type so existing imports don't break
export type { CommandResult } from './types.js';

// =============================================================================
// MAIN ROUTER
// =============================================================================

/**
 * Safety-gate parser for slash commands.
 *
 * Only intercepts the 5 deterministic escape hatches. Everything else
 * (including unknown `/foo` commands) passes through to the LLM agent.
 *
 * @param message  - Raw user message
 * @param session  - Current session
 * @param sessionManager - Session manager
 * @returns `handled: true` when a safety command was matched,
 *          `handled: false` otherwise (let the LLM handle it).
 */
export async function parseCommand(
  message: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // Natural language capability queries → return formatted help directly
  const capabilityTriggers = [
    'what can you do',
    'what are your capabilities',
    'what are you capable of',
    'what do you do',
    'show me your tools',
    'list your abilities'
  ];
  if (capabilityTriggers.some(trigger => new RegExp(`\\b${trigger}\\b`).test(lower))) {
    return { handled: true, responses: [formatHelp()] };
  }

  if (!trimmed.startsWith('/')) {
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
      return { handled: true, responses: [`🐕 Fetch v${VERSION} (Good Boy Reporting!)`] };

    case 'usage':
    case 'u':
      return { handled: true, responses: [await formatUsage()] };

    // ─── Whitelist Management (owner only) ──────────────────────────────
    case 'trust':
      return handleTrust(argString, session);

    // ─── Everything else → LLM ─────────────────────────────────────────
    default:
      return { handled: false, shouldProcess: true };
  }
}
