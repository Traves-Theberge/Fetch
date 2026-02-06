/**
 * @fileoverview Task Control Command Handlers
 *
 * Handlers for /stop, /pause, /resume, /undo, /undo all.
 *
 * @module commands/task
 */

import { Session } from '../session/types.js';
import { SessionManager } from '../session/manager.js';
import { logger } from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { CommandResult } from './types.js';

const execAsync = promisify(exec);

/**
 * Reset to a specific git commit.
 */
async function resetToCommit(commitSha: string): Promise<boolean> {
  if (!/^[0-9a-f]{7,40}$/i.test(commitSha)) {
    logger.error('Invalid git commit SHA', { commitSha });
    return false;
  }
  try {
    await execAsync(`git reset --hard ${commitSha}`);
    return true;
  } catch (error) {
    logger.error('Git reset failed', { error, commitSha });
    return false;
  }
}

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
  await taskManager.cancelTask(taskId);
  session.activeTaskId = null;

  return {
    handled: true,
    responses: ['🛑 Task stopped. Changes remain - say /undo to revert.'],
  };
}

export async function handlePause(
  session: Session,
  _sessionManager: SessionManager
): Promise<CommandResult> {
  const { getTaskManager } = await import('../task/manager.js');
  const taskManager = await getTaskManager();
  const task = session.activeTaskId
    ? taskManager.getTask(session.activeTaskId)
    : undefined;

  if (!task) {
    return { handled: true, responses: ['No active task to pause.'] };
  }

  if (task.status === 'paused') {
    return {
      handled: true,
      responses: ['Task is already paused. Say /resume to continue.'],
    };
  }

  await taskManager.pauseTask(task.id, 'Paused by user');

  return { handled: true, responses: ['⏸️ Task paused. Say /resume to continue.'] };
}

export async function handleResume(
  session: Session,
  _sessionManager: SessionManager
): Promise<CommandResult> {
  const { getTaskManager } = await import('../task/manager.js');
  const taskManager = await getTaskManager();
  const task = session.activeTaskId
    ? taskManager.getTask(session.activeTaskId)
    : undefined;

  if (!task) {
    return { handled: true, responses: ['No paused task to resume.'] };
  }

  if (task.status !== 'waiting_input' && task.status !== 'paused') {
    return { handled: true, responses: ['Task is not paused.'] };
  }

  await taskManager.resumeTask(task.id);

  return { handled: true, responses: ['▶️ Task resumed. Send a message to continue.'] };
}

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

export async function handleUndoAll(
  session: Session,
  _sessionManager: SessionManager
): Promise<CommandResult> {
  if (!session.gitStartCommit) {
    return { handled: true, responses: ['No start point recorded. Cannot undo all.'] };
  }

  try {
    const result = await resetToCommit(session.gitStartCommit);
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

  return { handled: true, responses: ['Failed to undo all. Try manual git reset.'] };
}
