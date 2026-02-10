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

  // Active project — prominent
  if (session.currentProject) {
    const type = session.currentProject.type === 'unknown' ? '' : ` (${session.currentProject.type})`;
    message += `📂 *Project:* ${session.currentProject.name}${type}\n`;
    message += `📍 Path: \`${session.currentProject.path}\`\n`;
    if (session.currentProject.gitBranch) {
      message += `🌿 Branch: \`${session.currentProject.gitBranch}\``;
      message += session.currentProject.hasUncommitted ? ' ⚠️ uncommitted changes\n' : ' ✨ clean\n';
    }
    message += '\n';
  } else {
    message += `📂 No project selected\n\n`;
  }

  // Current task
  if (session.activeTaskId) {
    const taskManager = await getTaskManager();
    const task = taskManager.getTask(session.activeTaskId);
    if (task) {
      message += `🎯 *Task:* ${task.goal.substring(0, 60)}${task.goal.length > 60 ? '...' : ''}\n`;
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
  if (session.activeFiles.length > 0) {
    const projectName = session.currentProject?.name || '';
    message += `📁 *Active Files${projectName ? ` (${projectName})` : ''}:*\n`;
    for (const file of session.activeFiles.slice(0, 5)) {
      message += `• ${file}\n`;
    }
    if (session.activeFiles.length > 5) {
      message += `... and ${session.activeFiles.length - 5} more\n`;
    }
  }

  return message;
}

/**
 * Format the help message for v4.0 LLM-first architecture.
 * 
 * Shows only the 5 safety escape commands (deterministic, no LLM)
 * and guides the user toward natural language for everything else.
 * 
 * @returns {string} Formatted help message
 */
export function formatHelp(): string {
  return `🐕 *Fetch v4.0.6 — AI Coding Assistant*

Just describe what you need in plain language. I have 21 tools and I'll figure out the rest.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛑 *Safety Commands* (always work, no LLM):
• \`/stop\` — Cancel the running task
• \`/undo\` — Undo last git commit
• \`/clear\` — Clear conversation history
• \`/help\` — Show this message
• \`/status\` — System and task status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💬 *Everything Else — Just Ask:*

*Projects*
• "What projects do I have?"
• "Switch to my-api"
• "Create a new project called auth-service"
• "Sync my changes to GitHub"

*Coding Tasks*
• "Build a REST API for users"
• "Fix the auth bug in login.ts"
• "Write tests for the payment module"
• "Add dark mode to the app"

*Questions*
• "How does the rate limiter work?"
• "What does this function do?"
• "Explain the error in auth.ts"

*Task Control*
• "How's the task going?"
• "Cancel the current task"
• "Actually, add JWT support too"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 *Tips:*
• Start messages with \`@fetch\` in groups
• I remember our full conversation
• Describe what you want, not how to do it
• I'll ask only if I genuinely need info

Just type what you need! 🐕`;
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
