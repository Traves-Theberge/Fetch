/**
 * Command Parser
 * 
 * Parse user messages for commands and extract intent.
 */

import { Session } from '../session/types.js';
import { SessionManager } from '../session/manager.js';
import { AgentCore } from '../agent/core.js';
import { formatHelp, formatStatus } from '../agent/format.js';
import { resetToCommit } from '../tools/git.js';
import { logger } from '../utils/logger.js';

export type CommandResult = {
  handled: boolean;
  responses?: string[];
  shouldProcess?: boolean;  // Continue to agent if true
};

/**
 * Parse and execute commands from user message
 */
export async function parseCommand(
  message: string,
  session: Session,
  sessionManager: SessionManager,
  agent: AgentCore
): Promise<CommandResult> {
  const trimmed = message.trim();
  
  // Check for command prefix
  if (!trimmed.startsWith('/')) {
    return { handled: false, shouldProcess: true };
  }

  const [command, ...args] = trimmed.slice(1).split(/\s+/);
  const argString = args.join(' ');

  switch (command.toLowerCase()) {
    // =========================================================================
    // Task Control
    // =========================================================================
    case 'stop':
    case 'cancel':
      return handleStop(session, sessionManager);

    case 'pause':
      return handlePause(session, sessionManager);

    case 'resume':
    case 'continue':
      return handleResume(session, sessionManager, agent);

    case 'status':
      return {
        handled: true,
        responses: [formatStatus(session)]
      };

    // =========================================================================
    // Context Management
    // =========================================================================
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

    // =========================================================================
    // Settings
    // =========================================================================
    case 'auto':
    case 'autonomous':
      return handleToggleAutonomous(session, sessionManager);

    case 'mode':
      if (argString) {
        return handleSetMode(argString, session, sessionManager);
      }
      return {
        handled: true,
        responses: [`Current mode: ${session.preferences.autonomyLevel}\n\nAvailable: supervised, cautious, autonomous`]
      };

    case 'verbose':
      return handleToggleVerbose(session, sessionManager);

    case 'autocommit':
      return handleToggleAutoCommit(session, sessionManager);

    // =========================================================================
    // Git Operations
    // =========================================================================
    case 'undo':
      if (argString.toLowerCase() === 'all') {
        return handleUndoAll(session, sessionManager);
      }
      return handleUndo(session, sessionManager);

    // =========================================================================
    // Help
    // =========================================================================
    case 'help':
    case 'h':
    case '?':
      return {
        handled: true,
        responses: [formatHelp()]
      };

    // =========================================================================
    // Unknown Command
    // =========================================================================
    default:
      return {
        handled: true,
        responses: [`Unknown command: /${command}\n\nType /help for available commands.`]
      };
  }
}

// =============================================================================
// Command Handlers
// =============================================================================

async function handleStop(
  session: Session, 
  sessionManager: SessionManager
): Promise<CommandResult> {
  if (!session.currentTask) {
    return {
      handled: true,
      responses: ['No active task to stop.']
    };
  }

  await sessionManager.abortTask(session);
  
  return {
    handled: true,
    responses: ['🛑 Task stopped. Changes remain - say /undo to revert.']
  };
}

async function handlePause(
  session: Session, 
  sessionManager: SessionManager
): Promise<CommandResult> {
  if (!session.currentTask) {
    return {
      handled: true,
      responses: ['No active task to pause.']
    };
  }

  if (session.currentTask.status === 'paused') {
    return {
      handled: true,
      responses: ['Task is already paused. Say /resume to continue.']
    };
  }

  await sessionManager.pauseTask(session);
  
  return {
    handled: true,
    responses: ['⏸️ Task paused. Say /resume to continue.']
  };
}

async function handleResume(
  session: Session, 
  sessionManager: SessionManager,
  agent: AgentCore
): Promise<CommandResult> {
  if (!session.currentTask) {
    return {
      handled: true,
      responses: ['No paused task to resume.']
    };
  }

  if (session.currentTask.status !== 'paused') {
    return {
      handled: true,
      responses: ['Task is not paused.']
    };
  }

  await sessionManager.resumeTask(session);
  const responses = await agent.processMessage(session, 'resume');
  
  return {
    handled: true,
    responses: ['▶️ Resuming...', ...responses]
  };
}

async function handleAddFile(
  filePath: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  if (!filePath) {
    return {
      handled: true,
      responses: ['Usage: /add <file_path>']
    };
  }

  await sessionManager.addActiveFile(session, filePath);
  
  return {
    handled: true,
    responses: [`📁 Added ${filePath} to context.`]
  };
}

async function handleDropFile(
  filePath: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  if (!filePath) {
    return {
      handled: true,
      responses: ['Usage: /drop <file_path>']
    };
  }

  await sessionManager.removeActiveFile(session, filePath);
  
  return {
    handled: true,
    responses: [`📁 Removed ${filePath} from context.`]
  };
}

function handleListFiles(session: Session): CommandResult {
  if (session.activeFiles.length === 0) {
    return {
      handled: true,
      responses: ['No active files. Use /add <file> to add context.']
    };
  }

  let message = '📂 *Active Files:*\n\n';
  for (const file of session.activeFiles) {
    message += `• ${file}\n`;
  }
  message += `\nUse /drop <file> to remove.`;

  return {
    handled: true,
    responses: [message]
  };
}

async function handleClear(
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  // Clear messages but keep preferences
  session.messages = [];
  session.activeFiles = [];
  session.currentTask = null;
  session.repoMap = null;
  
  await sessionManager.updateSession(session);
  
  return {
    handled: true,
    responses: ['🧹 Conversation cleared. Preferences retained.']
  };
}

async function handleToggleAutonomous(
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const newLevel = session.preferences.autonomyLevel === 'autonomous' 
    ? 'cautious' 
    : 'autonomous';
  
  await sessionManager.setAutonomyLevel(session, newLevel);
  
  const emoji = newLevel === 'autonomous' ? '🤖' : '👀';
  return {
    handled: true,
    responses: [`${emoji} Switched to ${newLevel} mode.`]
  };
}

async function handleSetMode(
  mode: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const validModes = ['supervised', 'cautious', 'autonomous'];
  const normalized = mode.toLowerCase();
  
  if (!validModes.includes(normalized)) {
    return {
      handled: true,
      responses: [`Invalid mode. Choose: ${validModes.join(', ')}`]
    };
  }
  
  await sessionManager.setAutonomyLevel(
    session, 
    normalized as 'supervised' | 'cautious' | 'autonomous'
  );
  
  const emojis: Record<string, string> = {
    supervised: '👁️',
    cautious: '👀',
    autonomous: '🤖'
  };
  
  return {
    handled: true,
    responses: [`${emojis[normalized]} Mode set to ${normalized}.`]
  };
}

async function handleToggleVerbose(
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const newVerbose = !session.preferences.verboseMode;
  
  await sessionManager.updatePreferences(session, { verboseMode: newVerbose });
  
  return {
    handled: true,
    responses: [newVerbose ? '📢 Verbose mode ON' : '🔇 Verbose mode OFF']
  };
}

async function handleToggleAutoCommit(
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const newAutoCommit = !session.preferences.autoCommit;
  
  await sessionManager.updatePreferences(session, { autoCommit: newAutoCommit });
  
  return {
    handled: true,
    responses: [newAutoCommit ? '💾 Auto-commit ON' : '💾 Auto-commit OFF']
  };
}

async function handleUndo(
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const task = session.currentTask;
  
  if (!task || task.commitsCreated.length === 0) {
    return {
      handled: true,
      responses: ['Nothing to undo.']
    };
  }

  // Get latest commit
  const latestCommit = task.commitsCreated[task.commitsCreated.length - 1];
  
  try {
    // Reset to parent of latest commit (undo one commit)
    const result = await resetToCommit(`${latestCommit}^`);
    
    if (result) {
      // Remove from list
      task.commitsCreated.pop();
      await sessionManager.updateTask(session, { 
        commitsCreated: task.commitsCreated 
      });
      
      return {
        handled: true,
        responses: [`↩️ Undid commit \`${latestCommit.substring(0, 7)}\``]
      };
    }
  } catch (error) {
    logger.error('Undo failed', { error });
  }

  return {
    handled: true,
    responses: ['Failed to undo. Try manual git reset.']
  };
}

async function handleUndoAll(
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  if (!session.gitStartCommit) {
    return {
      handled: true,
      responses: ['No start point recorded. Cannot undo all.']
    };
  }

  try {
    const result = await resetToCommit(session.gitStartCommit);
    
    if (result) {
      // Clear commits
      if (session.currentTask) {
        session.currentTask.commitsCreated = [];
        session.currentTask.filesModified = [];
        await sessionManager.updateTask(session, {
          commitsCreated: [],
          filesModified: []
        });
      }
      
      return {
        handled: true,
        responses: [`↩️ Reset to session start (${session.gitStartCommit.substring(0, 7)})`]
      };
    }
  } catch (error) {
    logger.error('Undo all failed', { error });
  }

  return {
    handled: true,
    responses: ['Failed to undo all. Try manual git reset.']
  };
}
