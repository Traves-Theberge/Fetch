/**
 * @fileoverview Agent Message Formatting Module
 * 
 * This module provides formatting utilities to convert agent outputs into
 * WhatsApp-friendly message formats. It handles approval requests, task
 * completion/failure messages, progress updates, and help displays.
 * 
 * @module agent/format
 * @see {@link module:agent/whatsapp-format} For low-level WhatsApp formatting utilities
 * @see {@link module:session/types} For AgentTask and Session types
 * 
 * ## Message Types
 * 
 * | Function | Purpose | Use Case |
 * |----------|---------|----------|
 * | formatApprovalRequest | Tool approval prompt | User confirms action |
 * | formatTaskComplete | Success summary | Task finished successfully |
 * | formatTaskFailed | Failure report | Task encountered error |
 * | formatProgress | Progress bar | Long-running operations |
 * | formatQuestion | User query | Agent needs clarification |
 * | formatStatus | Session info | Status command response |
 * | formatHelp | Command reference | Help command response |
 * 
 * ## WhatsApp Formatting
 * 
 * Messages use WhatsApp markdown:
 * - `*bold*` for emphasis
 * - `_italic_` for subtle text
 * - ``` `code` ``` for inline code
 * - Code blocks with triple backticks
 * 
 * @example
 * ```typescript
 * import { formatApprovalRequest, formatTaskComplete } from './format.js';
 * 
 * // Format approval for file write
 * const approval = formatApprovalRequest('write_file', { path: '/app.ts' }, 'Create new file');
 * // Result: "📝 *Write File*\n\nCreate new file\n\nApply? (yes/no/skip/yesall)"
 * 
 * // Format task completion
 * const complete = formatTaskComplete(task, session);
 * ```
 */

import { AgentTask, Session } from '../session/types.js';

/**
 * Format an approval request for WhatsApp display.
 * 
 * Creates a user-facing message asking for confirmation before
 * executing a tool action. Includes tool emoji, name, description,
 * and optional diff preview.
 * 
 * @param {string} tool - Tool name (e.g., 'write_file', 'run_command')
 * @param {Record<string, unknown>} _args - Tool arguments (currently unused)
 * @param {string} description - Human-readable description of the action
 * @param {string} [diff] - Optional diff/preview to display in code block
 * @returns {string} Formatted WhatsApp message with approval prompt
 * 
 * @example
 * ```typescript
 * const msg = formatApprovalRequest(
 *   'write_file',
 *   { path: 'src/app.ts' },
 *   'Create new TypeScript file',
 *   '+export function hello() {}'
 * );
 * ```
 */
export function formatApprovalRequest(
  tool: string,
  _args: Record<string, unknown>,
  description: string,
  diff?: string
): string {
  const emoji = getToolEmoji(tool);
  const toolLabel = formatToolName(tool);
  
  let message = `${emoji} *${toolLabel}*\n\n`;
  message += `${description}\n`;
  
  if (diff) {
    message += `\n\`\`\`\n${diff}\n\`\`\`\n`;
  }
  
  message += `\nApply? (yes/no/skip/yesall)`;
  
  return message;
}

/**
 * Format a task completion message for WhatsApp.
 * 
 * Creates a success summary showing what was accomplished, files modified,
 * commits created, and duration. Includes undo hint.
 * 
 * @param {AgentTask} task - The completed task with results
 * @param {Session} _session - User session (currently unused)
 * @returns {string} Formatted success message
 */
export function formatTaskComplete(task: AgentTask, _session: Session): string {
  let message = `✅ *Task Complete*\n\n`;
  message += `${task.output}\n`;
  
  // Files modified
  if (task.filesModified.length > 0) {
    message += `\n📁 *Modified:*\n`;
    for (const file of task.filesModified) {
      message += `• ${file}\n`;
    }
  }
  
  // Commits created
  if (task.commitsCreated.length > 0) {
    message += `\n📝 *Commits:*\n`;
    for (const hash of task.commitsCreated) {
      message += `• \`${hash}\`\n`;
    }
  }
  
  // Duration
  if (task.completedAt && task.startedAt) {
    const duration = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
    const seconds = Math.round(duration / 1000);
    message += `\n⏱️ Completed in ${formatDuration(seconds)}\n`;
  }
  
  message += `\nSay "undo" to revert, or continue chatting.`;
  
  return message;
}

/**
 * Format a task failure message for WhatsApp.
 * 
 * Creates an error report showing what went wrong, with optional
 * suggestion for fixing. Lists files modified before failure.
 * 
 * @param {AgentTask} task - The failed task with error info
 * @param {string} [suggestion] - Optional suggestion for the user
 * @returns {string} Formatted failure message
 */
export function formatTaskFailed(task: AgentTask, suggestion?: string): string {
  let message = `❌ *Task Failed*\n\n`;
  message += `${task.error || 'Unknown error'}\n`;
  
  if (suggestion) {
    message += `\n💡 *Suggestion:* ${suggestion}\n`;
  }
  
  // Show what was accomplished
  if (task.filesModified.length > 0) {
    message += `\n📁 *Files modified before failure:*\n`;
    for (const file of task.filesModified) {
      message += `• ${file}\n`;
    }
    message += `\nSay "undo" to revert changes.`;
  }
  
  return message;
}

/**
 * Format a progress update for long-running tasks.
 * 
 * Creates a progress bar with percentage, iteration count,
 * and current action description.
 * 
 * @param {AgentTask} task - The active task with progress info
 * @param {string} currentAction - Description of current step
 * @returns {string} Formatted progress message with bar
 */
export function formatProgress(task: AgentTask, currentAction: string): string {
  const progress = Math.round((task.iterations / task.maxIterations) * 100);
  const progressBar = createProgressBar(progress);
  
  let message = `🔄 *Working: ${task.goal.substring(0, 40)}${task.goal.length > 40 ? '...' : ''}*\n\n`;
  message += `${progressBar} ${progress}%\n`;
  message += `Step ${task.iterations}/${task.maxIterations}\n`;
  message += `\n${currentAction}`;
  
  return message;
}

/**
 * Format a question from the agent for user input.
 * 
 * Creates a question message with optional multiple choice options.
 * Options are numbered for easy selection.
 * 
 * @param {string} question - The question to ask
 * @param {string[]} [options] - Optional list of choices
 * @returns {string} Formatted question message
 */
export function formatQuestion(question: string, options?: string[]): string {
  let message = `❓ ${question}`;
  
  if (options && options.length > 0) {
    message += '\n\n';
    options.forEach((opt, i) => {
      message += `${i + 1}. ${opt}\n`;
    });
    message += `\nReply with a number or your answer.`;
  }
  
  return message;
}

/**
 * Format agent thinking/reasoning for verbose mode.
 * 
 * Wraps thought text with thinking emoji for display
 * when verbose output is enabled.
 * 
 * @param {string} thought - The agent's reasoning text
 * @returns {string} Formatted thought bubble message
 */
export function formatThinking(thought: string): string {
  return `💭 ${thought}`;
}

/**
 * Format session status display.
 * 
 * Creates a comprehensive status message showing current task,
 * user preferences, and active file context.
 * 
 * @param {Session} session - The user session to display
 * @returns {string} Formatted status overview
 */
export function formatStatus(session: Session): string {
  let message = `📊 *Fetch Status*\n\n`;
  
  // Current task
  if (session.currentTask) {
    const task = session.currentTask;
    message += `🎯 *Current Task:*\n`;
    message += `${task.goal.substring(0, 50)}${task.goal.length > 50 ? '...' : ''}\n`;
    message += `Status: ${formatTaskStatus(task.status)}\n`;
    message += `Progress: ${task.iterations}/${task.maxIterations} iterations\n\n`;
  } else {
    message += `No active task\n\n`;
  }
  
  // Preferences
  message += `⚙️ *Settings:*\n`;
  message += `• Mode: ${session.preferences.autonomyLevel}\n`;
  message += `• Auto-commit: ${session.preferences.autoCommit ? 'ON' : 'OFF'}\n`;
  message += `• Verbose: ${session.preferences.verboseMode ? 'ON' : 'OFF'}\n\n`;
  
  // Context
  message += `📂 *Context:*\n`;
  if (session.activeFiles.length > 0) {
    message += `Active files:\n`;
    for (const file of session.activeFiles.slice(0, 5)) {
      message += `• ${file}\n`;
    }
    if (session.activeFiles.length > 5) {
      message += `... and ${session.activeFiles.length - 5} more\n`;
    }
  } else {
    message += `No active files\n`;
  }
  
  return message;
}

/**
 * Format the help message showing all available commands.
 * 
 * Creates a comprehensive command reference organized by category:
 * projects, git, tasks, context, settings, and responses.
 * 
 * @returns {string} Formatted help message with all commands
 */
export function formatHelp(): string {
  return `🐕 *Fetch Commands*

� *Projects:*
• \`/projects\` - List available projects
• \`/project <name>\` - Switch to project
• \`/clone <url>\` - Clone a repository
• \`/init <name>\` - Create new project

📊 *Git:*
• \`/status\` - Git status
• \`/diff\` - Show changes
• \`/log [n]\` - Recent commits
• \`/undo\` - Revert last change
• \`/undo all\` - Revert session changes

📝 *Tasks:*
• \`/task\` - Show current task
• \`/stop\` - Cancel task
• \`/pause\` - Pause task
• \`/resume\` - Resume task

📁 *Context:*
• \`/add <file>\` - Add to context
• \`/drop <file>\` - Remove from context
• \`/files\` - Show active files
• \`/clear\` - Reset conversation

⚙️ *Settings:*
• \`/auto\` - Toggle autonomous mode
• \`/mode\` - Show/set autonomy level
• \`/verbose\` - Toggle verbose output

💬 *Responses:*
• \`yes\` / \`no\` - Approve/reject
• \`skip\` - Skip action
• \`yesall\` - Autonomous mode

Just type naturally to chat or work!`;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get emoji icon for a tool.
 * 
 * @param {string} tool - Tool name
 * @returns {string} Emoji character for the tool
 * @private
 */
function getToolEmoji(tool: string): string {
  const emojis: Record<string, string> = {
    'read_file': '📖',
    'write_file': '📝',
    'edit_file': '✏️',
    'search_files': '🔍',
    'list_directory': '📂',
    'repo_map': '🗺️',
    'find_definition': '🎯',
    'find_references': '🔗',
    'run_command': '⚡',
    'run_tests': '🧪',
    'run_lint': '✨',
    'git_status': '📊',
    'git_diff': '📋',
    'git_commit': '💾',
    'git_undo': '↩️',
    'git_branch': '🌿'
  };
  return emojis[tool] || '🔧';
}

/**
 * Format tool name from snake_case to Title Case.
 * 
 * @param {string} tool - Tool name in snake_case
 * @returns {string} Human-readable tool name
 * @private
 */
function formatToolName(tool: string): string {
  return tool
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format task status to human-readable form with emoji.
 * 
 * @param {string} status - Task status code
 * @returns {string} Human-readable status with emoji
 * @private
 */
function formatTaskStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'planning': '📋 Planning',
    'executing': '⚡ Executing',
    'awaiting_approval': '⏳ Waiting for approval',
    'paused': '⏸️ Paused',
    'completed': '✅ Completed',
    'failed': '❌ Failed',
    'aborted': '🛑 Aborted'
  };
  return statusMap[status] || status;
}

/**
 * Format duration in seconds to human-readable string.
 * 
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "2m 30s")
 * @private
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Create a visual progress bar using block characters.
 * 
 * @param {number} percent - Percentage complete (0-100)
 * @returns {string} Progress bar string (e.g., "▓▓▓▓▓░░░░░")
 * @private
 */
function createProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}
