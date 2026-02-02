/**
 * @fileoverview Git Version Control Tools
 * 
 * Tools for git operations within the workspace repository.
 * Provides status checking, diffing, committing, and history access.
 * 
 * @module tools/git
 * @see {@link gitStatusTool} - Current repository status
 * @see {@link gitDiffTool} - Show uncommitted changes
 * @see {@link gitCommitTool} - Commit staged changes
 * @see {@link gitLogTool} - View commit history
 * 
 * ## Tools
 * 
 * | Tool | Description | Approval |
 * |------|-------------|----------|
 * | git_status | Show status (branch, staged, modified) | Auto |
 * | git_diff | Show uncommitted changes | Auto |
 * | git_commit | Commit changes with message | Required |
 * | git_log | View recent commits | Auto |
 * 
 * ## Environment
 * 
 * - WORKSPACE_ROOT: Git repository root
 * - GIT_TERMINAL_PROMPT: Disabled to prevent interactive prompts
 * 
 * @example
 * ```typescript
 * import { gitTools, getCurrentCommit } from './git.js';
 * 
 * // Get current status
 * const status = await gitStatusTool.execute({});
 * 
 * // Get current commit hash
 * const hash = await getCurrentCommit();
 * ```
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolResult } from './types.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Workspace root (git repository root) */
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a successful tool result.
 * @private
 */
function success(output: string, duration: number, metadata?: Record<string, unknown>): ToolResult {
  return { success: true, output, duration, metadata };
}

/**
 * Creates a failed tool result.
 * @private
 */
function failure(error: string, duration: number): ToolResult {
  return { success: false, output: '', error, duration };
}

/**
 * Executes a git command in the workspace.
 * 
 * @param {string} command - Git command (without 'git' prefix)
 * @returns {Promise<{stdout: string, stderr: string}>} Command output
 * @private
 */
async function gitExec(command: string): Promise<{ stdout: string; stderr: string }> {
  return execAsync(`git ${command}`, {
    cwd: WORKSPACE_ROOT,
    timeout: 30000,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0'  // Disable prompts
    }
  });
}

// ============================================================================
// Tool: git_status
// ============================================================================

const gitStatusTool: Tool = {
  name: 'git_status',
  description: 'Show the current git status including staged, modified, and untracked files.',
  category: 'git',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    const startTime = Date.now();

    try {
      const { stdout } = await gitExec('status --short --branch');
      
      // Parse status
      const lines = stdout.trim().split('\n');
      const branch = lines[0]?.replace('## ', '') || 'unknown';
      const files = lines.slice(1);
      
      const staged = files.filter(f => f[0] !== ' ' && f[0] !== '?').length;
      const modified = files.filter(f => f[1] === 'M').length;
      const untracked = files.filter(f => f.startsWith('??')).length;

      return success(
        stdout || 'Working tree clean',
        Date.now() - startTime,
        { branch, staged, modified, untracked }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if not a git repo
      if (message.includes('not a git repository')) {
        return failure('Not a git repository', Date.now() - startTime);
      }
      
      return failure(`Git status failed: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Tool: git_diff
// ============================================================================

const gitDiffTool: Tool = {
  name: 'git_diff',
  description: 'Show uncommitted changes in the repository.',
  category: 'git',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Specific file or directory to diff (optional)',
      required: false
    },
    {
      name: 'staged',
      type: 'boolean',
      description: 'Show staged changes instead of unstaged',
      required: false,
      default: false
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const path = args.path as string | undefined;
    const staged = args.staged as boolean;

    try {
      let command = 'diff';
      if (staged) {
        command += ' --staged';
      }
      if (path) {
        command += ` -- "${path}"`;
      }

      const { stdout } = await gitExec(command);
      
      if (!stdout.trim()) {
        return success(
          staged ? 'No staged changes' : 'No changes',
          Date.now() - startTime,
          { hasChanges: false }
        );
      }

      // Truncate if very long
      const maxLength = 30000;
      const truncated = stdout.length > maxLength;
      const output = truncated 
        ? stdout.substring(0, maxLength) + '\n... (diff truncated)'
        : stdout;

      return success(
        output,
        Date.now() - startTime,
        { hasChanges: true, truncated }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Git diff failed: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Tool: git_commit
// ============================================================================

const gitCommitTool: Tool = {
  name: 'git_commit',
  description: 'Stage all changes and commit with a message.',
  category: 'git',
  autoApprove: false,  // Requires approval (in supervised mode)
  modifiesWorkspace: true,
  parameters: [
    {
      name: 'message',
      type: 'string',
      description: 'Commit message (should follow conventional commits format)',
      required: true
    },
    {
      name: 'files',
      type: 'array',
      description: 'Specific files to commit (optional, defaults to all changes)',
      required: false,
      items: { type: 'string' }
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const message = args.message as string;
    const files = args.files as string[] | undefined;

    try {
      // Stage files
      if (files && files.length > 0) {
        for (const file of files) {
          await gitExec(`add "${file}"`);
        }
      } else {
        await gitExec('add -A');
      }

      // Check if there's anything to commit
      const { stdout: status } = await gitExec('status --porcelain');
      if (!status.trim()) {
        return success(
          'Nothing to commit',
          Date.now() - startTime,
          { committed: false }
        );
      }

      // Commit
      await gitExec(`commit -m "${message.replace(/"/g, '\\"')}"`);
      
      // Get commit hash
      const { stdout: hash } = await gitExec('rev-parse --short HEAD');
      const commitHash = hash.trim();

      logger.info('Created commit', { hash: commitHash, message });

      return success(
        `Created commit ${commitHash}: ${message}`,
        Date.now() - startTime,
        { committed: true, hash: commitHash }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Git commit failed: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Tool: git_undo
// ============================================================================

const gitUndoTool: Tool = {
  name: 'git_undo',
  description: 'Undo the last commit. By default, keeps changes staged. Use hard=true to discard changes.',
  category: 'git',
  autoApprove: false,  // Requires approval
  modifiesWorkspace: true,
  parameters: [
    {
      name: 'hard',
      type: 'boolean',
      description: 'If true, discard all changes. If false (default), keep changes staged.',
      required: false,
      default: false
    },
    {
      name: 'count',
      type: 'number',
      description: 'Number of commits to undo (default: 1)',
      required: false,
      default: 1
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const hard = args.hard as boolean;
    const count = Math.min((args.count as number) || 1, 10);  // Limit to 10

    try {
      // Get the commit(s) we're about to undo
      const { stdout: logOutput } = await gitExec(`log --oneline -${count}`);
      const commits = logOutput.trim().split('\n');

      // Perform reset
      const resetType = hard ? '--hard' : '--soft';
      await gitExec(`reset ${resetType} HEAD~${count}`);

      const action = hard ? 'discarded' : 'unstaged';
      
      logger.info('Undid commits', { count, hard, commits });

      return success(
        `Undid ${count} commit(s) and ${action} changes:\n${commits.join('\n')}`,
        Date.now() - startTime,
        { undone: count, hard, commits }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Git undo failed: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Tool: git_branch
// ============================================================================

const gitBranchTool: Tool = {
  name: 'git_branch',
  description: 'Create and checkout a new branch, or list branches.',
  category: 'git',
  autoApprove: false,  // Creating branches should be approved
  modifiesWorkspace: true,
  parameters: [
    {
      name: 'name',
      type: 'string',
      description: 'Name for the new branch (omit to list branches)',
      required: false
    },
    {
      name: 'checkout',
      type: 'boolean',
      description: 'Whether to checkout the new branch',
      required: false,
      default: true
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const name = args.name as string | undefined;
    const checkout = (args.checkout as boolean) ?? true;

    try {
      if (!name) {
        // List branches
        const { stdout } = await gitExec('branch -a');
        return success(stdout, Date.now() - startTime, { listing: true });
      }

      // Create branch
      if (checkout) {
        await gitExec(`checkout -b "${name}"`);
        logger.info('Created and checked out branch', { branch: name });
        return success(
          `Created and switched to branch: ${name}`,
          Date.now() - startTime,
          { created: true, checkedOut: true, branch: name }
        );
      } else {
        await gitExec(`branch "${name}"`);
        logger.info('Created branch', { branch: name });
        return success(
          `Created branch: ${name}`,
          Date.now() - startTime,
          { created: true, checkedOut: false, branch: name }
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Git branch failed: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Tool: git_log
// ============================================================================

const gitLogTool: Tool = {
  name: 'git_log',
  description: 'Show recent commit history.',
  category: 'git',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'count',
      type: 'number',
      description: 'Number of commits to show',
      required: false,
      default: 10
    },
    {
      name: 'oneline',
      type: 'boolean',
      description: 'Show compact one-line format',
      required: false,
      default: true
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const count = Math.min((args.count as number) || 10, 50);
    const oneline = (args.oneline as boolean) ?? true;

    try {
      const format = oneline ? '--oneline' : '--pretty=medium';
      const { stdout } = await gitExec(`log ${format} -${count}`);
      
      return success(
        stdout || 'No commits yet',
        Date.now() - startTime,
        { count }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Git log failed: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Tool: git_stash
// ============================================================================

const gitStashTool: Tool = {
  name: 'git_stash',
  description: 'Stash or restore uncommitted changes.',
  category: 'git',
  autoApprove: false,
  modifiesWorkspace: true,
  parameters: [
    {
      name: 'action',
      type: 'string',
      description: 'Action to perform: push (save), pop (restore), list',
      required: true,
      enum: ['push', 'pop', 'list']
    },
    {
      name: 'message',
      type: 'string',
      description: 'Message for the stash (only for push)',
      required: false
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const action = args.action as string;
    const message = args.message as string | undefined;

    try {
      let command: string;
      
      switch (action) {
        case 'push':
          command = message ? `stash push -m "${message}"` : 'stash push';
          break;
        case 'pop':
          command = 'stash pop';
          break;
        case 'list':
          command = 'stash list';
          break;
        default:
          return failure(`Unknown action: ${action}`, Date.now() - startTime);
      }

      const { stdout } = await gitExec(command);
      
      return success(
        stdout || `Stash ${action} completed`,
        Date.now() - startTime,
        { action }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Git stash failed: ${message}`, Date.now() - startTime);
    }
  }
};

// ============================================================================
// Helper: Get current commit hash
// ============================================================================

export async function getCurrentCommit(): Promise<string | null> {
  try {
    const { stdout } = await gitExec('rev-parse HEAD');
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Reset to a specific commit (for undo-all)
 */
export async function resetToCommit(commitHash: string, hard: boolean = false): Promise<boolean> {
  try {
    const resetType = hard ? '--hard' : '--soft';
    await gitExec(`reset ${resetType} ${commitHash}`);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Export all git tools
// ============================================================================

export const gitTools: Tool[] = [
  gitStatusTool,
  gitDiffTool,
  gitCommitTool,
  gitUndoTool,
  gitBranchTool,
  gitLogTool,
  gitStashTool
];
