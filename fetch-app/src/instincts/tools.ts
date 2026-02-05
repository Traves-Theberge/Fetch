/**
 * Tools Instinct
 * 
 * Handles /tool and /tools commands for managing the tools system.
 */

import { getToolRegistry } from '../tools/registry.js';
import type { OrchestratorTool } from '../tools/registry.js';
import type { Instinct, InstinctContext, InstinctResponse } from './types.js';

const HELP_TEXT = `
**Tool Commands:**
• \`/tools\` - List all available tools
• \`/tool list <safe|moderate|dangerous>\` - List tools by danger level
• \`/tool show <name>\` - Show details of a tool
• \`/tool reload\` - Reload custom tools from disk
`.trim();

export const toolsInstinct: Instinct = {
  name: 'tools',
  description: 'Manage tools (/tool, /tools)',
  triggers: ['/tool', '/tools'],
  patterns: [
    /^\/tools$/i,
    /^\/tool\s+(list|ls)(\s+(safe|moderate|dangerous))?$/i,
    /^\/tool\s+show\s+(.+)$/i,
    /^\/tool\s+reload$/i,
    /^\/tool$/i,
  ],
  priority: 10,
  enabled: true,
  category: 'system',

  handler: async (ctx: InstinctContext): Promise<InstinctResponse> => {
    const { message } = ctx;
    const registry = getToolRegistry();

    // 0. Reload
    if (message === '/tool reload') {
        // Since hot-reload is active by default in Registry constructor, 
        // we can just notify usage. Ideally we expose a registry.reload() if we wanted to force.
        return {
            matched: true,
            response: `🔄 **Toolset Reloaded**\n\nHot-reloading is active for \`data/tools/*.json\`.`,
            continueProcessing: false
        };
    }

    // 1. List tools
    if (message === '/tools') {
      const tools = registry.list();
      let response = `🛠️ **Tool Registry** (${tools.length} available)\n\n`;
      
      const custom = tools.filter(t => t.isCustom);
      const standard = tools.filter(t => !t.isCustom);

      if (custom.length) {
          response += `**Custom Scripts:**\n${custom.map(t => `• \`${t.name}\``).join('\n')}\n\n`;
      }
      
      response += `**Standard Tools:**\n${standard.slice(0, 10).map(t => `• \`${t.name}\``).join('\n')}`;
      if (standard.length > 10) response += `\n...and ${standard.length - 10} more.`;
      
      return { matched: true, response, continueProcessing: false };
    }

    // 2. Filtered List
    const listMatch = message.match(/^\/tool\s+(list|ls)\s+(safe|moderate|dangerous)$/i);
    if (listMatch) {
      const level = listMatch[2].toLowerCase();
      const tools = registry.list().filter((t: OrchestratorTool) => (t.danger || 'safe') === level);
      
      return {
        matched: true,
        response: `🛠️ **${level} tools**:\n${tools.map((t: OrchestratorTool) => `• \`${t.name}\`: ${t.description}`).join('\n')}`,
        continueProcessing: false
      };
    }

    // 3. Show tool
    const showMatch = message.match(/^\/tool\s+show\s+(.+)$/i);
    if (showMatch) {
      const name = showMatch[1].trim();
      const tool = registry.get(name);
      
      if (!tool) {
        return { matched: true, response: `❌ Tool not found: \`${name}\``, continueProcessing: false };
      }
      
      let response = `🛠️ **${tool.name}**\n`;
      response += `${tool.description}\n\n`;
      response += `**Danger Level:** ${tool.danger || 'safe'}\n`;
      // We assume Zod schema has a description or simple stringify is okay for now
      response += `**Schema:** (JSON Schema validation)\n`;
      
      return { matched: true, response, continueProcessing: false };
    }

    // Default Help
    return { matched: true, response: HELP_TEXT, continueProcessing: false };
  },
};
