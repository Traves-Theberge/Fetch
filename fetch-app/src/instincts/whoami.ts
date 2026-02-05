/**
 * Whoami Instinct - Returns session and user info
 */

import type { Instinct, InstinctContext, InstinctResponse } from './types.js';

export const whoamiInstinct: Instinct = {
  name: 'whoami',
  description: 'Returns session and user info',
  triggers: [
    'whoami',
    '/whoami',
    'who am i',
    'who am i?',
  ],
  patterns: [
    /^who\s+am\s+i\??$/i,
    /^what('s| is) my (name|id|session)/i,
  ],
  priority: 5,
  enabled: true,
  category: 'meta',

  handler: (ctx: InstinctContext): InstinctResponse => {
    const { session, workspace, mode } = ctx;
    
    let response = `👤 **Session Info**\n\n`;
    
    response += `**Session ID:** \`${session.id.slice(0, 8)}...\`\n`;
    response += `**User ID:** \`${session.userId.slice(0, 8)}...\`\n`;
    
    if (session.createdAt) {
      const created = new Date(session.createdAt);
      response += `**Created:** ${created.toLocaleDateString()}\n`;
    }
    
    if (workspace) {
      const workspaceName = workspace.split('/').pop() || workspace;
      response += `**Workspace:** ${workspaceName}\n`;
    }
    
    response += `**Mode:** ${mode}\n`;
    
    // Add preferences
    const prefs = session.preferences;
    response += `\n**Preferences:**\n`;
    response += `• Autonomy: ${prefs.autonomyLevel}\n`;
    response += `• Auto-commit: ${prefs.autoCommit ? 'yes' : 'no'}\n`;
    response += `• Verbose: ${prefs.verboseMode ? 'yes' : 'no'}\n`;

    return {
      matched: true,
      response,
      continueProcessing: false,
    };
  },
};
