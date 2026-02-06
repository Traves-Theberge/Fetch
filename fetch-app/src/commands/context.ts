/**
 * @fileoverview Context Management Command Handlers
 *
 * Handlers for /add, /drop, /files, /clear.
 *
 * @module commands/context
 */

import { Session } from '../session/types.js';
import { SessionManager } from '../session/manager.js';
import type { CommandResult } from './types.js';

export async function handleAddFile(
  filePath: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  if (!filePath) {
    return { handled: true, responses: ['Usage: /add <file_path>'] };
  }

  await sessionManager.addActiveFile(session, filePath);

  return { handled: true, responses: [`📁 Added ${filePath} to context.`] };
}

export async function handleDropFile(
  filePath: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  if (!filePath) {
    return { handled: true, responses: ['Usage: /drop <file_path>'] };
  }

  await sessionManager.removeActiveFile(session, filePath);

  return { handled: true, responses: [`📁 Removed ${filePath} from context.`] };
}

export function handleListFiles(session: Session): CommandResult {
  if (session.activeFiles.length === 0) {
    return {
      handled: true,
      responses: ['No active files. Use /add <file> to add context.'],
    };
  }

  let message = '📂 *Active Files:*\n\n';
  for (const file of session.activeFiles) {
    message += `• ${file}\n`;
  }
  message += `\nUse /drop <file> to remove.`;

  return { handled: true, responses: [message] };
}

export async function handleClear(
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  session.messages = [];
  session.activeFiles = [];
  session.activeTaskId = null;
  session.repoMap = null;

  await sessionManager.updateSession(session);

  return { handled: true, responses: ['🧹 Conversation cleared. Preferences retained.'] };
}
