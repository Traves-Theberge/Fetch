/**
 * Commands Instinct - Returns available slash commands
 * 
 * Lists all slash commands grouped by category.
 */

import type { Instinct, InstinctContext, InstinctResponse } from './types.js';

const COMMANDS_RESPONSE = `📋 **Fetch Commands**

**General**
\`/help\` - Show capabilities
\`/status\` - Current state
\`/commands\` - This list
\`/clear\` - Reset session

**Task Control**
\`/stop\` - Halt current task
\`/pause\` - Pause current task
\`/resume\` - Resume paused task
\`/undo\` - Revert last change

**Workspace**
\`/workspace <path>\` - Set workspace
\`/workspace\` - Show current workspace
\`/project\` - Project context

**Skills**
\`/skills\` - List available skills
\`/skill create <id> <name>\` - Create new skill
\`/skill show <id>\` - Show skill details
\`/skill enable <id>\` - Enable skill
\`/skill disable <id>\` - Disable skill

**Tools**
\`/tools\` - List available tools
\`/tool register <file>\` - Register tool
\`/tool unregister <name>\` - Remove tool

**Memory**
\`/remember <fact>\` - Store a fact
\`/forget <fact>\` - Remove a fact
\`/memory\` - Show memory stats

**Identity**
\`/identity\` - Show identity
\`/identity collar\` - Edit COLLAR.md
\`/identity alpha\` - Edit ALPHA.md

**Scheduling**
\`/remind <msg> in <time>\` - Set reminder
\`/schedule <msg> at <time>\` - Schedule message
\`/cron list\` - List scheduled jobs
\`/cron remove <id>\` - Remove job

**Harness**
\`/harness <name>\` - Use specific harness
\`/harness auto\` - Auto-select harness

_Tip: You can also just tell me what you need in plain language!_ 🐾`;

export const commandsInstinct: Instinct = {
  name: 'commands',
  description: 'Returns available slash commands',
  triggers: [
    'commands',
    '/commands',
    'slash commands',
    '/cmds',
    'cmds',
  ],
  patterns: [
    /^(show\s+)?(all\s+)?commands$/i,
    /^(list|what are)( the)? (slash )?commands/i,
    /^what commands/i,
  ],
  priority: 10,
  enabled: true,
  category: 'info',

  handler: (_ctx: InstinctContext): InstinctResponse => {
    return {
      matched: true,
      response: COMMANDS_RESPONSE,
      continueProcessing: false,
    };
  },
};
