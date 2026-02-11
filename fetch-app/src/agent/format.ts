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
  let message = `🐕 *FETCH SYSTEM REPORT* (v4.1.1)\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  // Active project
  message += `📂 *PROJECT CONTEXT*\n`;
  if (session.currentProject) {
    const type = session.currentProject.type === 'unknown' ? '' : ` (${session.currentProject.type})`;
    message += `• *Name*: ${session.currentProject.name}${type}\n`;
    message += `• *Path*: \`${session.currentProject.path}\`\n`;
    if (session.currentProject.gitBranch) {
      const gitIcon = session.currentProject.hasUncommitted ? '⚠️' : '✨';
      message += `• *Branch*: \`${session.currentProject.gitBranch}\` ${gitIcon}\n`;
    }
  } else {
    message += `• _No project currently sniffed out._\n`;
  }
  message += '\n';

  // Current task
  if (session.activeTaskId) {
    const taskManager = await getTaskManager();
    const task = taskManager.getTask(session.activeTaskId);
    if (task) {
      message += `🎯 *CURRENT FOCUS*\n`;
      message += `• *Task*: ${task.goal.substring(0, 60)}${task.goal.length > 60 ? '...' : ''}\n`;
      message += `• *State*: ${formatTaskStatus(task.status)}\n`;
      message += '\n';
    }
  }

  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  // Context — footerish
  if (session.activeFiles.length > 0) {
    message += `\n📁 *Sniffing around*: ${session.activeFiles.length} active files\n`;
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
  return `🐕 *Fetch v4.1.1 — AI Coding Assistant*

*Slash commands:*
/stop - Cancel running task
/undo - Undo last commit (soft reset)
/clear - Clear conversation history
/help - Show commands
/status - Show system and task status

*Tools:*
- workspace_list: List projects
- workspace_select: Switch project
- workspace_status: Git status
- workspace_create: New project
- workspace_delete: Delete project
- workspace_sync: Commit and push
- workspace_publish: Create GitHub repo
- task_create: Delegate coding task
- task_status: Check task progress
- task_cancel: Cancel task
- task_respond: Respond to task
- ask_user: Ask for clarification
- report_progress: Send update
- github_pr_create: Create pull request
- github_pr_list: List pull requests
- github_pr_view: View pull request
- github_issue_create: Create GitHub issue
- github_issue_list: List GitHub issues
- github_branch_create: Create GitHub branch
- github_action_status: Check CI/CD status
- github_search_repos: Search GitHub repos

*AI Harnesses:*
- Copilot 🎯: Fast suggestions, git commands
- Claude 🧠: Deep reasoning, refactoring
- Gemini ⚡: Quick fixes, explanations

Just describe what you need in plain language! 🐕`;
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
