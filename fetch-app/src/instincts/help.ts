/**
 * Help Instinct - Returns Fetch's capabilities
 * 
 * This is a STATIC response that never changes. It's the definitive
 * source of truth for what Fetch can do.
 */

import type { Instinct, InstinctContext, InstinctResponse } from './types.js';

const HELP_RESPONSE = `🐕 **Fetch - Your Coding Companion**

I'm Fetch, the pack leader! I orchestrate AI harnesses (Claude, Gemini, Copilot) to help you code.

**What I Can Do:**

📝 **Coding Tasks**
• Build features, fix bugs, refactor code
• Multi-file changes across your project
• Generate tests, documentation, types

🔍 **Exploration**
• Explain how code works
• Find files, functions, patterns
• Answer questions about your codebase

🎤 **Voice & Vision**
• Send voice notes - I'll transcribe them
• Send images - I'll analyze code screenshots, errors, diagrams

💾 **Memory**
• I remember your preferences
• I track project context
• I learn from our conversations

**Quick Commands:**
\`/help\` - This message
\`/status\` - Current state
\`/commands\` - All commands
\`/stop\` - Halt current task
\`/undo\` - Revert last change
\`/clear\` - Reset session

**Harnesses (My Pack):**
• 🔷 Claude - Complex refactoring, analysis
• 💎 Gemini - Quick edits, multi-file
• 🐙 Copilot - Explanations, suggestions

Just tell me what you need! 🐾`;

export const helpInstinct: Instinct = {
  name: 'help',
  description: 'Returns complete capabilities list',
  triggers: [
    'help',
    '/help',
    'what can you do',
    'what can you do?',
    'what do you do',
    'what do you do?',
    '?',
    'hi',
    'hello',
    'hey',
  ],
  patterns: [
    /^help\s*me$/i,
    /^i need help$/i,
    /^can you help/i,
    /^what('s| is) fetch/i,
    /^who are you/i,
  ],
  priority: 10,
  enabled: true,
  category: 'info',

  handler: (_ctx: InstinctContext): InstinctResponse => {
    return {
      matched: true,
      response: HELP_RESPONSE,
      continueProcessing: false,
    };
  },
};
