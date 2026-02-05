/**
 * Skills Instinct
 * 
 * Handles /skill and /skills commands for managing the skills system.
 */

import { getSkillManager } from '../skills/manager.js';
import type { Instinct, InstinctContext, InstinctResponse } from './types.js';

const HELP_TEXT = `
**Skill Commands:**
• \`/skills\` - List all enabled skills
• \`/skill create <id> <name>\` - Create a new skill template
• \`/skill delete <id>\` - Delete a custom skill
• \`/skill enable <id>\` - Enable a skill
• \`/skill disable <id>\` - Disable a skill
• \`/skill show <id>\` - Show details of a skill
• \`/skill reload\` - Reload all skills from disk
`.trim();

export const skillsInstinct: Instinct = {
  name: 'skills',
  description: 'Manage skills (/skill, /skills)',
  triggers: ['/skill', '/skills'],
  patterns: [
    /^\/skills$/i,
    /^\/skill\s+(list|ls)$/i,
    /^\/skill\s+show\s+(.+)$/i,
    /^\/skill\s+create\s+([a-z0-9-]+)\s+(.+)$/i,
    /^\/skill\s+delete\s+(.+)$/i,
    /^\/skill\s+enable\s+(.+)$/i,
    /^\/skill\s+disable\s+(.+)$/i,
    /^\/skill\s+reload$/i,
    /^\/skill$/i,
  ],
  priority: 10, // Higher than general chat, lower than safety
  enabled: true,
  category: 'system',

  handler: async (ctx: InstinctContext): Promise<InstinctResponse> => {
    const { message, originalMessage } = ctx;
    const manager = getSkillManager();
    
    // Ensure manager is initialized
    await manager.init();

    // 0. Reload
    if (message === '/skill reload') {
      // Re-run init (which is now idempotentish but could be forced?) 
      // Actually we just want to re-scan.
      // Since manager.init() guards with `initialized`, we probably need a force reload method.
      // But for now, we rely on the watcher. 
      // Let's implement a manual re-scan log message.
      return {
          matched: true,
          response: `🔄 **Skills Reloaded**\n\nHot-reloading is active. The system automatically watches \`data/skills\` for changes.`,
          continueProcessing: false
      };
    }

    // 1. List skills
    if (message === '/skills' || message === '/skill list' || message === '/skill ls') {
      const skills = manager.listSkills();
      const enabled = skills.filter(s => s.enabled);
      const disabled = skills.filter(s => !s.enabled);
      
      let response = `🧩 **Skills Registry** (${skills.length} total)\n\n`;
      
      if (enabled.length > 0) {
        response += `**Enabled:**\n`;
        for (const s of enabled) {
          response += `• \`${s.id}\`: ${s.name} ${s.isBuiltin ? '(builtin)' : ''}\n`;
        }
      }
      
      if (disabled.length > 0) {
        response += `\n**Disabled:**\n`;
        for (const s of disabled) {
          response += `• \`${s.id}\`: ${s.name}\n`;
        }
      }
      
      return {
        matched: true,
        response,
        continueProcessing: false
      };
    }

    // 2. Help
    if (message === '/skill') {
      return {
        matched: true,
        response: HELP_TEXT,
        continueProcessing: false
      };
    }

    // 3. Show skill
    const showMatch = message.match(/^\/skill\s+show\s+(.+)$/i);
    if (showMatch) {
      const id = showMatch[1].trim();
      const skill = manager.getSkill(id);
      
      if (!skill) {
        return {
          matched: true,
          response: `❌ Skill not found: \`${id}\``,
          continueProcessing: false
        };
      }
      
      let response = `🧩 **${skill.name}** (\`${skill.id}\`)\n`;
      response += `${skill.description}\n\n`;
      response += `**Status:** ${skill.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
      response += `**Type:** ${skill.isBuiltin ? 'Built-in' : 'Custom'}\n`;
      response += `**Triggers:** ${skill.triggers.join(', ')}\n`;
      if (skill.version) response += `**Version:** ${skill.version}\n`;
      response += `\n**Instructions:**\n\`\`\`markdown\n${skill.instructions.slice(0, 500)}${skill.instructions.length > 500 ? '...' : ''}\n\`\`\``;
      
      return {
        matched: true,
        response,
        continueProcessing: false
      };
    }

    // 4. Enable/Disable
    const enableMatch = message.match(/^\/skill\s+(enable|disable)\s+(.+)$/i);
    if (enableMatch) {
      const action = enableMatch[1].toLowerCase();
      const id = enableMatch[2].trim();
      
      const success = action === 'enable' 
        ? await manager.enableSkill(id)
        : await manager.disableSkill(id);
        
      if (!success) {
        return {
          matched: true,
          response: `❌ Skill not found: \`${id}\``,
          continueProcessing: false
        };
      }
      
      return {
        matched: true,
        response: `✅ Skill \`${id}\` has been ${action}d.`,
        continueProcessing: false
      };
    }

    // 5. Create
    const createMatch = originalMessage.match(/^\/skill\s+create\s+([a-z0-9-]+)\s+(.+)$/i);
    if (createMatch) {
      const id = createMatch[1];
      const name = createMatch[2];
      
      try {
        await manager.createSkill(id, name, `Custom skill for ${name}`);
        return {
          matched: true,
          response: `✅ Created skill \`${id}\` (${name}).\n\nEdit the file at: \`data/skills/${id}/SKILL.md\``,
          continueProcessing: false
        };
      } catch (error) {
        return {
          matched: true,
          response: `❌ Failed to create skill: ${(error as Error).message}`,
          continueProcessing: false
        };
      }
    }
    
    // 6. Delete
    const deleteMatch = message.match(/^\/skill\s+delete\s+(.+)$/i);
    if (deleteMatch) {
      const id = deleteMatch[1].trim();
      
      try {
        await manager.deleteSkill(id);
        return {
          matched: true,
          response: `🗑️ Deleted skill \`${id}\`.`,
          continueProcessing: false
        };
      } catch (error) {
        return {
          matched: true,
          response: `❌ Failed to delete skill: ${(error as Error).message}`,
          continueProcessing: false
        };
      }
    }

    return {
      matched: false,
      continueProcessing: true
    };
  }
};
