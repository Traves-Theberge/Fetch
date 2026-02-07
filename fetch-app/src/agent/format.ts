/**
 * @fileoverview Agent Message Formatting Module
 * 
 * Provides formatting utilities for WhatsApp-friendly message output.
 * 
 * @module agent/format
 * @see {@link module:agent/whatsapp-format} For low-level WhatsApp formatting utilities
 * @see {@link module:session/types} For Session types
 */

import { Session } from '../session/types.js';
import { getTaskManager } from '../task/manager.js';

/**
 * Format session status display.
 * 
 * Creates a comprehensive status message showing current task,
 * user preferences, and active file context.
 * 
 * @param {Session} session - The user session to display
 * @returns {string} Formatted status overview
 */
export async function formatStatus(session: Session): Promise<string> {
  let message = `📊 *Fetch Status*\n\n`;
  
  // Current task (V3.3 — fetched from TaskManager)
  if (session.activeTaskId) {
    const taskManager = await getTaskManager();
    const task = taskManager.getTask(session.activeTaskId);
    if (task) {
      message += `🎯 *Current Task:*\n`;
      message += `${task.goal.substring(0, 50)}${task.goal.length > 50 ? '...' : ''}\n`;
      message += `Status: ${formatTaskStatus(task.status)}\n\n`;
    } else {
      message += `No active task\n\n`;
    }
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
  return `🐕 *Fetch - Your AI Coding Assistant*

I'm Fetch! I can help you with coding tasks directly from WhatsApp. Just describe what you need and I'll help you build it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💬 *What I Can Do:*

*Chat & Questions*
Just ask me anything! No commands needed.
• "What does this function do?"
• "How do I use React hooks?"
• "Explain this error message"

*Code Exploration*
• "Show me the contents of src/app.ts"
• "What files are in this project?"
• "Find where login is defined"
• "Search for TODO comments"

*Code Changes*
• "Fix the typo in line 42"
• "Add a loading spinner to the button"
• "Refactor this function to use async/await"
• "Create a new component called Header"

*Full Tasks*
• "Build a login form with validation"
• "Add dark mode to the app"
• "Write tests for the auth module"
• "Set up ESLint configuration"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📂 *Project Commands:*
• \`/projects\` (\`/ls\`) - List available projects
• \`/project <name>\` (\`/cd\`) - Switch to project
• \`/clone <url>\` - Clone a repository
• \`/init <name>\` - Create new project

📊 *Git Commands:*
• \`/status\` (\`/st\`, \`/gs\`) - Show git status
• \`/diff\` - Show uncommitted changes
• \`/log [n]\` - Show recent commits
• \`/undo\` - Revert last change
• \`/undo all\` - Revert all session changes

📝 *Task Control:*
• \`/task\` - Show current task status
• \`/stop\` (\`/cancel\`) - Cancel current task
• \`/pause\` - Pause task execution
• \`/resume\` (\`/continue\`) - Resume paused task

📁 *Context:*
• \`/add <file>\` - Add file to context
• \`/drop <file>\` (\`/remove\`) - Remove from context
• \`/files\` (\`/context\`) - Show active files
• \`/clear\` (\`/reset\`) - Reset conversation

⚙️ *Settings:*
• \`/auto\` - Toggle autonomous mode
• \`/mode [level]\` - Show/set autonomy level
• \`/verbose\` - Toggle detailed output
• \`/autocommit\` - Toggle auto-commit on changes

ℹ️ *Info:*
• \`/help\` (\`/h\`, \`/?\`) - Show this help
• \`/version\` (\`/v\`) - Show Fetch version

🔐 *Security:*
• \`/trust add <number>\` - Add trusted phone
• \`/trust remove <number>\` - Remove trusted phone
• \`/trust list\` - Show trusted numbers
• \`/trust clear\` - Remove all trusted (owner only)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ *Approval Responses:*
When I ask for permission:
• \`yes\` (\`y\`) - Approve this action
• \`no\` (\`n\`) - Reject this action
• \`skip\` (\`s\`) - Skip and continue
• \`yesall\` (\`ya\`) - Approve all remaining

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *Tips:*
• Start messages with \`@fetch\` in groups
• I remember our conversation context
• Describe what you want, not how to do it
• I'll ask if I need clarification

Just type what you need - I'm here to help! 🐕`;
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
