/**
 * Status Instinct - Returns current system state
 * 
 * This is a DYNAMIC response that reflects the actual state.
 */

import type { Instinct, InstinctContext, InstinctResponse, FetchMode } from './types.js';

/**
 * Get emoji indicator for mode
 */
function getModeEmoji(mode: FetchMode): string {
  switch (mode) {
    case 'ALERT': return '🟢';
    case 'WORKING': return '🔵';
    case 'WAITING': return '🟡';
    case 'GUARDING': return '🔴';
    case 'RESTING': return '⚫';
    default: return '⚪';
  }
}

/**
 * Get human-readable mode description
 */
function getModeDescription(mode: FetchMode): string {
  switch (mode) {
    case 'ALERT': return 'Ready for commands';
    case 'WORKING': return 'Task in progress';
    case 'WAITING': return 'Awaiting your input';
    case 'GUARDING': return 'Confirming operation';
    case 'RESTING': return 'Inactive';
    default: return 'Unknown';
  }
}

/**
 * Format uptime duration
 */
function formatUptime(startTime: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - startTime.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  
  if (diffHours > 0) {
    return `${diffHours}h ${mins}m`;
  }
  return `${diffMins}m`;
}

export const statusInstinct: Instinct = {
  name: 'status',
  description: 'Returns current system state',
  triggers: [
    'status',
    '/status',
    "what's running",
    'whats running',
    "what's happening",
    'whats happening',
    'state',
  ],
  patterns: [
    /^(show\s+)?status$/i,
    /^current (state|status)$/i,
    /^what('s| is) (the )?(current )?(state|status)/i,
    /^are you (busy|working|idle)/i,
  ],
  priority: 10,
  enabled: true,
  category: 'info',

  handler: (ctx: InstinctContext): InstinctResponse => {
    const { session, activeTask, mode, workspace } = ctx;
    
    const modeEmoji = getModeEmoji(mode);
    const modeDesc = getModeDescription(mode);
    
    let response = `${modeEmoji} **Fetch Status**\n\n`;
    response += `**Mode:** ${mode} - ${modeDesc}\n`;
    
    // Session info
    const messageCount = session.messages?.length ?? 0;
    response += `**Session:** ${messageCount} messages\n`;
    
    // Workspace info
    if (workspace) {
      const workspaceName = workspace.split('/').pop() || workspace;
      response += `**Workspace:** ${workspaceName}\n`;
    } else {
      response += `**Workspace:** None set\n`;
    }
    
    // Active task info
    if (activeTask) {
      response += `\n**Current Task:**\n`;
      response += `• Goal: ${activeTask.goal || activeTask.description}\n`;
      response += `• Harness: ${activeTask.harness || 'auto'}\n`;
      response += `• Status: ${activeTask.status}\n`;
      if (activeTask.startedAt) {
        response += `• Running for: ${formatUptime(new Date(activeTask.startedAt))}\n`;
      }
    } else if (mode === 'ALERT') {
      response += `\n_No active task. Ready for commands!_ 🐾`;
    }
    
    // Waiting info
    if (mode === 'WAITING' && ctx.session) {
      response += `\n⏳ _Waiting for your response..._`;
    }
    
    // Guarding info  
    if (mode === 'GUARDING') {
      response += `\n⚠️ _Confirmation required for pending operation_`;
    }

    return {
      matched: true,
      response,
      continueProcessing: false,
    };
  },
};
