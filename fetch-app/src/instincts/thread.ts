import { Instinct, InstinctContext, InstinctResponse } from './types.js';
import { SessionManager } from '../session/manager.js';

export const threadInstinct: Instinct = {
  name: 'thread',
  description: 'Manage conversation threads',
  triggers: ['/thread', 'thread', '/t'],
  patterns: [/^\/thread\b/i, /^\/t\b/i],
  priority: 50,
  category: 'control',
  enabled: true,

  handler: async (ctx: InstinctContext): Promise<InstinctResponse> => {
    const manager = new SessionManager();
    const session = ctx.session;
    
    // Parse command
    // Expected format: /thread [command] [args...]
    // e.g. /thread list
    //      /thread new My Cool Feature
    //      /thread switch thread_123
    
    // Normalize: remove trigger prefix
    let content = ctx.originalMessage.trim();
    if (content.toLowerCase().startsWith('/thread')) {
        content = content.substring(7).trim();
    } else if (content.toLowerCase().startsWith('/t')) {
        content = content.substring(2).trim();
    }
    
    const args = content.split(/\s+/);
    const cmd = args.shift()?.toLowerCase();

    // LIST
    if (!cmd || cmd === 'list' || cmd === 'ls') {
        const tm = manager.getThreadManager();
        const threads = tm.listThreads(session.id);
        const activeId = manager.getActiveThreadId(session);
        
        if (threads.length === 0) {
            return {
                matched: true,
                response: "🧵 No threads found. Start a new one with `/thread new`."
            };
        }

        let output = "🧵 **Conversation Threads**\n\n";
        threads.forEach(t => {
            const isActive = t.id === activeId;
            const marker = isActive ? "🟢" : (t.status === 'paused' ? "⏸️" : "⚪");
            const date = new Date(t.updatedAt).toLocaleDateString();
            output += `${marker} **${t.title}** (\`${t.id}\`)\n`;
            output += `   Last active: ${date}\n\n`;
        });
        
        return { matched: true, response: output };
    }

    // NEW
    if (cmd === 'new' || cmd === 'create') {
        const title = args.join(' ') || undefined;
        const threadId = await manager.startNewThread(session, title);
        
        return {
            matched: true,
            response: `🧵 **New Thread Started**\n\nCreated thread \`${threadId}\`.\nPrevious session context has been paused and saved.`
        };
    }

    // PAUSE
    if (cmd === 'pause') {
        await manager.pauseActiveThread(session);
        return {
            matched: true,
            response: `gw⏸️ **Thread Paused**\n\nSession context has been saved and cleared.`
        };
    }

    // SWITCH / RESUME
    if (cmd === 'switch' || cmd === 'resume' || cmd === 'load') {
        const targetId = args[0]; // Can be ID or Title ideally, but ID is safer for first pass
        if (!targetId) {
            return { matched: true, response: "⚠️ Usage: `/thread switch <thread-id>`" };
        }
        
        const success = await manager.resumeThread(session, targetId);
        if (!success) {
             return { matched: true, response: `⚠️ Thread not found: \`${targetId}\`` };
        }
        
        return {
            matched: true,
            response: `🧵 **Switched to Thread**\n\nResumed conversation context from \`${targetId}\`.`
        };
    }

    return {
        matched: true,
        response: `**Thread Commands:**\n\n/thread list\n/thread new [Topic]\n/thread switch [ID]\n/thread pause`
    };
  }
};
