/**
 * @fileoverview Command Parser - Slash Command Handling
 * 
 * Parses user messages for slash commands and executes them directly.
 * Commands bypass the LLM agent for immediate, deterministic responses.
 * 
 * @module commands/parser
 * @see {@link parseCommand} - Main parsing function
 * @see {@link CommandResult} - Parse result type
 * 
 * ## Command Categories
 * 
 * ### Project Management
 * | Command | Description |
 * |---------|------------|
 * | /projects, /ls | List available projects |
 * | /project <name>, /cd | Switch or show project |
 * | /clone <url> | Clone a repository |
 * | /init <name> | Initialize new project |
 * 
 * ### Task Control
 * | Command | Description |
 * |---------|------------|
 * | /stop, /cancel | Abort current task |
 * | /pause | Pause task execution |
 * | /resume | Resume paused task |
 * | /undo | Undo last changes |
 * 
 * ### Settings
 * | Command | Description |
 * |---------|------------|
 * | /mode <level> | Set autonomy level |
 * | /autocommit | Toggle auto-commit |
 * | /verbose | Toggle verbose mode |
 * 
 * ### Information
 * | Command | Description |
 * |---------|------------|
 * | /status | Show session status |
 * | /help | Show help message |
 * | /clear | Clear conversation |
 * 
 * @example
 * ```typescript
 * import { parseCommand } from './parser.js';
 * 
 * const result = await parseCommand('/help', session, manager);
 * if (result.handled) {
 *   return result.responses;
 * }
 * // Continue to agent processing
 * ```
 */

import { Session } from '../session/types.js';
import { SessionManager } from '../session/manager.js';
import { formatHelp, formatStatus } from '../agent/format.js';
import { scanProjects, getProject, formatProjectList, formatProjectInfo } from '../session/project.js';
import { logger } from '../utils/logger.js';
import { handleTrustCommand } from './trust.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

/**
 * Reset to a specific git commit
 */
async function resetToCommit(commitSha: string): Promise<boolean> {
  try {
    await execAsync(`git reset --hard ${commitSha}`);
    return true;
  } catch (error) {
    logger.error('Git reset failed', { error, commitSha });
    return false;
  }
}

/** Workspace root for project operations */
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of command parsing.
 * @interface
 */
export type CommandResult = {
  /** Whether a command was found and executed */
  handled: boolean;
  /** Response messages (if handled) */
  responses?: string[];
  /** Continue to agent processing (if not handled) */
  shouldProcess?: boolean;
};

// =============================================================================
// MAIN PARSER
// =============================================================================

/**
 * Parses and executes slash commands from user messages.
 * 
 * @param {string} message - User message to parse
 * @param {Session} session - Current session
 * @param {SessionManager} sessionManager - Session manager
 * @returns {Promise<CommandResult>} Parse result
 * 
 * @example
 * ```typescript
 * const result = await parseCommand('/status', session, manager);
 * // result.handled = true
 * // result.responses = ['Session status...']
 * ```
 */
export async function parseCommand(
  message: string,
  session: Session,
  sessionManager: SessionManager
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
    // Project Management
    // =========================================================================
    case 'projects':
    case 'ls':
      return handleListProjects(session, sessionManager);

    case 'select':
    case 'project':
    case 'cd':
      if (!argString) {
        // Show current project
        if (session.currentProject) {
          return {
            handled: true,
            responses: [formatProjectInfo(session.currentProject)]
          };
        }
        return {
          handled: true,
          responses: ['No project selected.\n\nUse /projects to see available projects.']
        };
      }
      return handleSwitchProject(argString, session, sessionManager);

    case 'status':
    case 'st':
      return {
        handled: true,
        responses: [formatStatus(session)]
      };

    case 'version':
    case 'v':
      return {
        handled: true,
        responses: [`🐕 Fetch v2.4.2 (Orchestrator Architecture)`]
      };

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
      return handleResume(session, sessionManager);

    case 'task':
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

    // =========================================================================
    // Security - Zero Trust Bonding
    // =========================================================================
    case 'trust':
      return handleTrust(argString);

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

/**
 * Handle /trust commands for Zero Trust Bonding whitelist management.
 * Only owner can use these commands.
 */
async function handleTrust(args: string): Promise<CommandResult> {
  const result = await handleTrustCommand(args);
  return {
    handled: true,
    responses: [result.response]
  };
}

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
  sessionManager: SessionManager
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
  
  return {
    handled: true,
    responses: ['▶️ Task resumed. Send a message to continue.']
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

// =============================================================================
// Project Management Handlers
// =============================================================================

async function handleListProjects(
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  // Scan for projects
  const projects = await scanProjects();
  
  // Update session with available projects
  session.availableProjects = projects;
  await sessionManager.updateSession(session);
  
  const currentName = session.currentProject?.name ?? null;
  
  return {
    handled: true,
    responses: [formatProjectList(projects, currentName)]
  };
}

async function handleSwitchProject(
  projectName: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  // Ensure project list is current
  const projects = await scanProjects();
  session.availableProjects = projects;
  
  // Check if project exists
  if (!projects.includes(projectName)) {
    // Try partial match
    const matches = projects.filter(p => 
      p.toLowerCase().includes(projectName.toLowerCase())
    );
    
    if (matches.length === 0) {
      return {
        handled: true,
        responses: [`Project "${projectName}" not found.\n\nAvailable: ${projects.join(', ') || 'none'}`]
      };
    }
    
    if (matches.length > 1) {
      return {
        handled: true,
        responses: [`Multiple matches: ${matches.join(', ')}\n\nBe more specific.`]
      };
    }
    
    // Use the single match
    projectName = matches[0];
  }
  
  // Get full project context
  const project = await getProject(projectName);
  
  if (!project) {
    return {
      handled: true,
      responses: [`Failed to load project "${projectName}".`]
    };
  }
  
  // Update session
  session.currentProject = project;
  session.activeFiles = []; // Clear active files when switching
  session.repoMap = null;   // Clear repo map
  await sessionManager.updateSession(session);
  
  logger.info('Switched project', { project: projectName, userId: session.userId });
  
  return {
    handled: true,
    responses: [`🐕 Now working on: ${project.name}\n\n${formatProjectInfo(project)}`]
  };
}

// =============================================================================
// Git/Project Operation Handlers
// =============================================================================

async function handleClone(
  url: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  if (!url) {
    return {
      handled: true,
      responses: ['Usage: /clone <git-url>\n\nExample: /clone https://github.com/user/repo']
    };
  }

  // Extract repo name from URL
  const repoName = extractRepoName(url);
  if (!repoName) {
    return {
      handled: true,
      responses: ['Invalid git URL. Use HTTPS or SSH format.']
    };
  }

  const targetPath = join(WORKSPACE_ROOT, repoName);

  try {
    logger.info('Cloning repository', { url, target: targetPath });
    
    // Clone the repo
    await execAsync(`git clone --depth 1 "${url}" "${targetPath}"`, {
      timeout: 120000  // 2 minute timeout
    });

    // Refresh project list
    const projects = await scanProjects();
    session.availableProjects = projects;

    // Auto-switch to the new project
    const project = await getProject(repoName);
    if (project) {
      session.currentProject = project;
      session.activeFiles = [];
      session.repoMap = null;
      await sessionManager.updateSession(session);

      return {
        handled: true,
        responses: [`✅ Cloned ${repoName}\n\n${formatProjectInfo(project)}`]
      };
    }

    await sessionManager.updateSession(session);
    return {
      handled: true,
      responses: [`✅ Cloned ${repoName}\n\nUse /project ${repoName} to switch to it.`]
    };

  } catch (error) {
    logger.error('Clone failed', { url, error });
    const errMsg = error instanceof Error ? error.message : String(error);
    
    if (errMsg.includes('already exists')) {
      return {
        handled: true,
        responses: [`Project ${repoName} already exists.\n\nUse /project ${repoName} to switch to it.`]
      };
    }
    
    return {
      handled: true,
      responses: [`❌ Clone failed: ${errMsg.substring(0, 100)}`]
    };
  }
}

function extractRepoName(url: string): string | null {
  // Handle HTTPS URLs: https://github.com/user/repo.git
  // Handle SSH URLs: git@github.com:user/repo.git
  const httpsMatch = url.match(/\/([^/]+?)(\.git)?$/);
  const sshMatch = url.match(/:([^/]+\/)?([^/]+?)(\.git)?$/);
  
  if (httpsMatch) return httpsMatch[1].replace('.git', '');
  if (sshMatch) return sshMatch[2].replace('.git', '');
  return null;
}

async function handleInit(
  projectName: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  if (!projectName) {
    return {
      handled: true,
      responses: ['Usage: /init <project-name>\n\nExample: /init my-new-app']
    };
  }

  // Sanitize project name
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const targetPath = join(WORKSPACE_ROOT, safeName);

  try {
    // Create directory
    await mkdir(targetPath, { recursive: true });
    
    // Initialize git repo
    await execAsync('git init', { cwd: targetPath });
    
    // Create a basic README
    await execAsync(`echo "# ${safeName}" > README.md`, { cwd: targetPath });
    await execAsync('git add README.md', { cwd: targetPath });
    await execAsync('git commit -m "Initial commit"', { cwd: targetPath });

    logger.info('Initialized project', { name: safeName, path: targetPath });

    // Refresh and switch
    const projects = await scanProjects();
    session.availableProjects = projects;

    const project = await getProject(safeName);
    if (project) {
      session.currentProject = project;
      session.activeFiles = [];
      session.repoMap = null;
      await sessionManager.updateSession(session);

      return {
        handled: true,
        responses: [`✅ Created ${safeName}\n\n${formatProjectInfo(project)}`]
      };
    }

    await sessionManager.updateSession(session);
    return {
      handled: true,
      responses: [`✅ Created ${safeName} at ${targetPath}`]
    };

  } catch (error) {
    logger.error('Init failed', { projectName, error });
    return {
      handled: true,
      responses: [`❌ Failed to initialize project: ${error}`]
    };
  }
}

async function handleGitStatus(session: Session): Promise<CommandResult> {
  if (!session.currentProject) {
    return {
      handled: true,
      responses: ['No project selected.\n\nUse /project <name> to select one.']
    };
  }

  try {
    const { stdout } = await execAsync('git status --short --branch', {
      cwd: session.currentProject.path
    });

    const output = stdout.trim() || 'Working tree clean';
    
    return {
      handled: true,
      responses: [`📊 ${session.currentProject.name}\n\n\`\`\`\n${output}\n\`\`\``]
    };

  } catch (_error) {
    return {
      handled: true,
      responses: ['Failed to get git status.']
    };
  }
}

async function handleGitDiff(session: Session): Promise<CommandResult> {
  if (!session.currentProject) {
    return {
      handled: true,
      responses: ['No project selected.\n\nUse /project <name> to select one.']
    };
  }

  try {
    const { stdout } = await execAsync('git diff --stat', {
      cwd: session.currentProject.path
    });

    if (!stdout.trim()) {
      return {
        handled: true,
        responses: ['No changes to show.']
      };
    }

    // Truncate long diffs
    const lines = stdout.split('\n');
    const truncated = lines.length > 20 
      ? [...lines.slice(0, 20), `... and ${lines.length - 20} more lines`].join('\n')
      : stdout;

    return {
      handled: true,
      responses: [`📝 Changes in ${session.currentProject.name}\n\n\`\`\`\n${truncated}\n\`\`\``]
    };

  } catch (_error) {
    return {
      handled: true,
      responses: ['Failed to get diff.']
    };
  }
}

async function handleGitLog(
  countArg: string,
  session: Session
): Promise<CommandResult> {
  if (!session.currentProject) {
    return {
      handled: true,
      responses: ['No project selected.\n\nUse /project <name> to select one.']
    };
  }

  const count = parseInt(countArg) || 5;
  const safeCount = Math.min(Math.max(count, 1), 20);

  try {
    const { stdout } = await execAsync(
      `git log --oneline -n ${safeCount}`,
      { cwd: session.currentProject.path }
    );

    if (!stdout.trim()) {
      return {
        handled: true,
        responses: ['No commits found.']
      };
    }

    return {
      handled: true,
      responses: [`📜 Recent commits (${session.currentProject.name})\n\n\`\`\`\n${stdout.trim()}\n\`\`\``]
    };

  } catch (_error) {
    return {
      handled: true,
      responses: ['Failed to get git log.']
    };
  }
}
