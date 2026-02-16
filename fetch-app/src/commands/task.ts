/**
 * @fileoverview Deterministic task-control command handlers.
 *
 * Handles `/stop`, `/undo`, and `/undo all` from the slash-command parser.
 *
 * @module commands/task
 */

import { Session } from '../session/types.js';
import { SessionManager } from '../session/manager.js';
import { logger } from '../utils/logger.js';
import { getTaskIntegration } from '../task/integration.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { CommandResult } from './types.js';

const execAsync = promisify(exec);

/**
 * Reset current repository to the provided commit SHA.
 *
 * @returns `true` when reset succeeds
 */
async function resetToCommit(commitSha: string, cwd: string): Promise<boolean> {
  if (!/^[0-9a-f]{7,40}$/i.test(commitSha)) {
    logger.error('Invalid git commit SHA', { commitSha });
    return false;
  }

  try {
    // Validate that cwd is an actual git work tree before attempting reset.
    await execAsync('git rev-parse --is-inside-work-tree', { cwd });
  } catch (error) {
    logger.error('Git repository validation failed for undo all', { error, cwd });
    return false;
  }

  try {
    await execAsync(`git reset --hard ${commitSha}`, { cwd });
    return true;
  } catch (error) {
    logger.error('Git reset failed', { error, commitSha, cwd });
    return false;
  }
}

/** Resolves the preferred git working directory for undo operations. */
function resolveGitWorkingDirectory(session: Session): string {
  const currentPath = session.currentProject?.path?.trim();
  return currentPath && currentPath.length > 0 ? currentPath : process.cwd();
}

/**
 * Handle `/stop` and `/cancel` by cancelling the active task if present.
 */
export async function handleStop(
  session: Session,
  _sessionManager: SessionManager
): Promise<CommandResult> {
  const { getTaskManager } = await import('../task/manager.js');
  const taskManager = await getTaskManager();

  if (!taskManager.hasRunningTask()) {
    return { handled: true, responses: ['No active task to stop.'] };
  }

  const taskId = taskManager.getCurrentTaskId()!;
  const integration = getTaskIntegration();
  const processTerminated = integration.cancelExecution(taskId);
  await taskManager.cancelTask(taskId);
  session.activeTaskId = null;

  return {
    handled: true,
    responses: [
      processTerminated
        ? '🛑 Task stopped and process terminated. Changes remain - say /undo to revert.'
        : '🛑 Task stopped. Changes remain - say /undo to revert.',
    ],
  };
}

/**
 * Handle `/undo`.
 *
 * Current behavior returns manual git instructions for reverting the last commit.
 */
export async function handleUndo(
  _session: Session,
  _sessionManager: SessionManager
): Promise<CommandResult> {
  return {
    handled: true,
    responses: [
      'Use `git revert HEAD` or `git reset --hard HEAD~1` to undo the last commit.',
    ],
  };
}

/**
 * Handle `/undo all` by resetting to the session start commit, when available.
 */
export async function handleUndoAll(
  session: Session,
  _sessionManager: SessionManager
): Promise<CommandResult> {
  if (!session.gitStartCommit) {
    return { handled: true, responses: ['No start point recorded. Cannot undo all.'] };
  }

  try {
    const cwd = resolveGitWorkingDirectory(session);
    const result = await resetToCommit(session.gitStartCommit, cwd);
    if (result) {
      return {
        handled: true,
        responses: [
          `↩️ Reset to session start (${session.gitStartCommit.substring(0, 7)})`,
        ],
      };
    }
  } catch (error) {
    logger.error('Undo all failed', { error });
  }

  return {
    handled: true,
    responses: ['Failed to undo all. Ensure a valid git workspace is selected, then try again.'],
  };
}
