/**
 * Identity Instinct
 * 
 * Handles /identity commands to inspect and modify the agent's persona.
 */

import { getIdentityManager } from '../identity/manager.js';
import type { Instinct, InstinctContext, InstinctResponse } from './types.js';

export const identityInstinct: Instinct = {
  name: 'identity',
  description: 'Inspect agent identity (/identity)',
  triggers: ['/identity'],
  patterns: [
    /^\/identity$/i,
    /^\/identity\s+(collar|alpha|agents|tools|traits)$/i,
    /^\/identity\s+reset$/i,
  ],
  priority: 10,
  enabled: true,
  category: 'meta',

  handler: async (ctx: InstinctContext): Promise<InstinctResponse> => {
    const { message } = ctx;
    const manager = getIdentityManager();
    const identity = manager.getIdentity();

    // 1. Show Identity Summary
    if (message === '/identity') {
      let response = `🐕 **Identity: ${identity.name}**\n\n`;
      response += `**Role:** ${identity.role}\n`;
      response += `**Voice:** ${identity.voice.tone}\n\n`;
      
      response += `**Directives:**\n`;
      response += identity.directives.primary.map(d => `• ${d}`).join('\n');
      
      response += `\n\n_Use /identity <section> to see more._`;
      
      return { matched: true, response, continueProcessing: false };
    }

    // 2. Sub-commands
    if (message.match(/^\/identity\s+reset$/i)) {
        manager.reloadIdentity();
        return {
            matched: true,
            response: `🔄 **Identity Reloaded**\nRead from disk successfully.`,
            continueProcessing: false
        };
    }

    const subMatch = message.match(/^\/identity\s+(collar|alpha|agents|tools|traits)$/i);
    if (subMatch) {
      const section = subMatch[1].toLowerCase();
      
      if (section === 'collar') {
         return {
             matched: true,
             response: `🐕 **THE COLLAR** (Core Identity)\n\n` +
                       `**Name:** ${identity.name}\n` +
                       `**Role:** ${identity.role}\n` +
                       `**Directives:**\n${identity.directives.primary.map(d => `• ${d}`).join('\n')}`,
             continueProcessing: false
         };
      }

      if (section === 'alpha') {
         return {
             matched: true,
             response: `👤 **THE ALPHA** (User Context)\n\n` +
                       `**Owner:** ${identity.context.owner}\n` +
                       `**Platform:** ${identity.context.platform}\n` +
                       `**Project Root:** ${identity.context.projectRoot}`,
             continueProcessing: false
         };
      }

      return {
        matched: true,
        response: `ℹ️ **${section.toUpperCase()}**\n\nThis section is loaded from \`data/identity/${section.toUpperCase()}.md\`.`,
        continueProcessing: false
      };
    }

    // 3. Reset
    if (message === '/identity reset') {
         // manager.reset(); // TODO
         return {
             matched: true,
             response: '🔄 Identity reloaded (No-op in V3.0 static identity).',
             continueProcessing: false
         };
    }

    return { matched: false, response: '', continueProcessing: true };
  },
};
