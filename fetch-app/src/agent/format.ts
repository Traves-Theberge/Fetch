/**
 * Agent Message Formatting
 * 
 * Format agent outputs for WhatsApp display.
 */

import { AgentTask, Session } from '../session/types.js';

/**
 * Format an approval request for WhatsApp
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
 * Format a task completion message
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
 * Format a task failure message
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
 * Format a progress update
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
 * Format a question from the agent
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
 * Format agent thinking/reasoning (verbose mode)
 */
export function formatThinking(thought: string): string {
  return `💭 ${thought}`;
}

/**
 * Format status display
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
 * Format help message
 */
export function formatHelp(): string {
  return `🐕 *Fetch Commands*

📝 *Task Control:*
• \`/stop\` - Cancel current task
• \`/pause\` - Pause current task
• \`/resume\` - Resume paused task
• \`/status\` - Show current status

📁 *Context:*
• \`/add <file>\` - Add file to context
• \`/drop <file>\` - Remove from context
• \`/files\` - Show active files
• \`/clear\` - Reset conversation

⚙️ *Settings:*
• \`/auto\` - Toggle autonomous mode
• \`/mode\` - Show/set autonomy level
• \`/verbose\` - Toggle verbose output

🔄 *Git:*
• \`/undo\` - Revert last change
• \`/undo all\` - Revert all session changes

💬 *Responses:*
• \`yes\` / \`no\` - Approve/reject action
• \`skip\` - Skip current action
• \`yesall\` - Approve all (autonomous)

Just type normally to start a task!`;
}

// ============================================================================
// Helper Functions
// ============================================================================

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

function formatToolName(tool: string): string {
  return tool
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

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

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function createProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}
