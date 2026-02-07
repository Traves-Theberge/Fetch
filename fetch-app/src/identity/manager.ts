/**
 * @fileoverview Identity Manager — Single Source of Truth for System Prompt
 *
 * Manages Fetch's identity lifecycle:
 * - Loads persona from COLLAR.md (system) and ALPHA.md (user)
 * - Loads pack members from data/agents/*.md (YAML frontmatter)
 * - Builds the complete system prompt (identity + skills + pack + session context + mode)
 * - Hot-reloads on file changes via chokidar watchers
 *
 * @module identity/manager
 */

import { AgentIdentity } from './types.js';
import { getSkillManager } from '../skills/manager.js';
import { getModeManager } from '../modes/manager.js';
import { FetchMode } from '../modes/types.js';
import { IdentityLoader } from './loader.js';
import { IDENTITY_DIR, AGENTS_DIR } from '../config/paths.js';
import chokidar from 'chokidar';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

// Default "Orchestrator" Identity
const DEFAULT_IDENTITY: AgentIdentity = {
  name: 'Fetch',
  role: 'Orchestrator & Senior Developer',
  emoji: '🤖',
  voice: {
    tone: 'Confident, concise, and professional',
    style: ['Direct', 'Action-oriented', 'Protective'],
    vocabulary: ['System', 'Execute', 'Guard', 'Fetch', 'Analysis']
  },
  directives: {
    primary: [
      'Protect the User and the Codebase at all costs.',
      'Never hallucinations; verify before executing.',
      'Maintain the "Orchestrator" persona naturally.'
    ],
    secondary: [
      'Prioritize safety and stability.',
      'Keep responses short for WhatsApp integration.',
      'Use tools proactively to gather context.'
    ],
    behavioral: [
      'Use the 🤖 emoji to sign off major accomplishments.',
      'When confused, ask for clarification immediately.',
      'Treat the User as the "Administrator".'
    ]
  },
  context: {
    owner: env.OWNER_PHONE_NUMBER || 'Admin',
    projectRoot: process.cwd(),
    platform: 'Linux'
  },
  pack: []
};

export class IdentityManager {
  private static instance: IdentityManager | undefined;
  private identity: AgentIdentity;
  private loader: IdentityLoader;
  private watchers: ReturnType<typeof chokidar.watch>[] = [];

  private constructor() {
    this.identity = { ...DEFAULT_IDENTITY }; // Clone
    this.loader = new IdentityLoader(IDENTITY_DIR);
    this.reloadIdentity();
    this.setupWatchers(IDENTITY_DIR);
    this.setupWatchers(AGENTS_DIR);
  }

  private setupWatchers(dir: string) {
    try {
        const watcher = chokidar.watch(dir, {
            // eslint-disable-next-line no-useless-escape
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true
        });

        watcher.on('change', (path) => {
            logger.info(`Identity file changed: ${path}. Reloading...`);
            this.reloadIdentity();
        });
        
        this.watchers.push(watcher);
    } catch (error) {
        logger.error('Failed to setup identity watcher', error);
    }
  }

  public reloadIdentity() {
    try {
        const loaded = this.loader.load();
        
        // Deep merge or simple override? Simple override for top level, specific for arrays
        if (loaded.name) this.identity.name = loaded.name;
        if (loaded.role) this.identity.role = loaded.role;
        if (loaded.emoji) this.identity.emoji = loaded.emoji;
        if (loaded.voice && loaded.voice.tone) this.identity.voice.tone = loaded.voice.tone;
        
        if (loaded.directives?.primary?.length) {
             this.identity.directives.primary = loaded.directives.primary;
        }
        if (loaded.directives?.secondary?.length) {
             this.identity.directives.secondary = loaded.directives.secondary;
        }
        if (loaded.directives?.behavioral?.length) {
             this.identity.directives.behavioral = loaded.directives.behavioral;
        }

        // Pack members from data/agents/*.md
        if (loaded.pack?.length) {
            this.identity.pack = loaded.pack;
            logger.info(`Pack loaded: ${loaded.pack.map(m => m.name).join(', ')}`);
        }

        logger.info(`Identity loaded: ${this.identity.name}`);
    } catch (error) {
        logger.error('Failed to reload identity', error);
    }
  }

  public static getInstance(): IdentityManager {
    if (!IdentityManager.instance) {
      IdentityManager.instance = new IdentityManager();
    }
    return IdentityManager.instance;
  }

  public getIdentity(): AgentIdentity {
    return this.identity;
  }

  /**
   * Build the complete System Prompt for the LLM.
   * This is the SINGLE source of truth for Fetch's system prompt.
   * Identity comes from COLLAR.md/ALPHA.md, skills from SkillManager,
   * session context from the caller, mode from ModeManager.
   * 
   * @param activatedSkillsContext - Optional pre-built context from matched skills
   * @param sessionContext - Optional pre-built session context (workspace, task, git, etc.)
   */
  public buildSystemPrompt(activatedSkillsContext?: string, sessionContext?: string): string {
    const skills = getSkillManager().buildSkillsSummary();
    const mode = getModeManager().getState();
    const date = new Date().toISOString();

    const skillGuidance = skills ? `\nSKILL GUIDANCE:\nBefore responding, scan the <available_skills> descriptions below.\n- If a skill clearly applies to this request, its instructions have been activated and appear below.\n- Follow activated skill instructions as expert procedural guidance.\n- If no skill applies, proceed with your general knowledge.` : '';

    const activatedSection = activatedSkillsContext || '';
    const sessionSection = sessionContext || '';
    const packSection = this.buildPackContext();

    return `
You are ${this.identity.name} ${this.identity.emoji}, the ${this.identity.role}.
Voice: ${this.identity.voice.tone}.
Platform: WhatsApp (mobile). Time: ${date}.

## AUTONOMY RULES (HIGHEST PRIORITY)

1. **If the user tells you to do something, DO IT.** Do not ask for confirmation unless the action is destructive (delete, overwrite, reset).
2. **If a workspace is selected, USE IT.** Never ask "which project?" or "which workspace?" when there is an active workspace in the context below. The user already selected it.
3. **If the intent is clear, act immediately.** "Create index.ts" means create the file NOW. Do NOT say "Would you like me to create index.ts?" — that is wasting the user's time.
4. **Use ask_user ONLY when genuinely missing information** that cannot be inferred from context. Never use it to confirm what was already requested.
5. **Prefer doing and reporting over asking and waiting.** Show what you DID, not what you're ABOUT to do.
6. **Never repeat the user's request back to them as a question.** If they said "add a health check", do not respond with "Would you like me to add a health check?".
7. **Short messages are still valid requests.** "fix auth" means fix the authentication. "list files" means call workspace_status. Do not treat short messages as casual chat if they contain action verbs.

${sessionSection}
${packSection}

TOOL USAGE:
- ALWAYS use tools to gather real data. NEVER answer from memory or guess about file contents, project state, or git status.
- "yes" / "ok" / "sure" after you asked a question → execute the action you proposed immediately.
- NEVER describe what a tool would do — CALL IT.

RESPONSE FORMAT (WhatsApp mobile):
- 2-6 lines for status, max 10 for detailed reports
- Status emojis: ✅ ❌ ⚠️ 🔄 📝 🐕
- Bullets over paragraphs — mobile screens are small
- Bold **key items** for scannability

${this.getModeInstructions(mode.mode)}
${skills ? `\nAVAILABLE SKILLS:\n${skills}${skillGuidance}` : ''}
${activatedSection}
`.trim();
  }

  /**
   * Build pack context XML for the system prompt.
   * Lists available harness agents with their roles, triggers, and routing info.
   */
  private buildPackContext(): string {
    if (!this.identity.pack.length) return '';

    let xml = '\nPACK (Available Harnesses):\n<available_agents>\n';
    for (const member of this.identity.pack) {
      xml += `  <agent harness="${member.harness}">\n`;
      xml += `    <name>${member.name} ${member.emoji}</name>\n`;
      xml += `    <alias>${member.alias}</alias>\n`;
      xml += `    <role>${member.role}</role>\n`;
      xml += `    <cli>${member.cli}</cli>\n`;
      if (member.triggers.length > 0) {
        xml += `    <triggers>${member.triggers.join(', ')}</triggers>\n`;
      }
      if (member.avoid.length > 0) {
        xml += `    <avoid>${member.avoid.join(', ')}</avoid>\n`;
      }
      xml += `    <fallback_priority>${member.fallback_priority}</fallback_priority>\n`;
      xml += `    <location>${member.sourcePath}</location>\n`;
      xml += `  </agent>\n`;
    }
    xml += '</available_agents>\n';
    xml += 'When delegating tasks via task_create, select the harness whose triggers best match the request. Default to the lowest fallback_priority agent for ambiguous requests.';
    return xml;
  }

  private getModeInstructions(mode: FetchMode): string {
    switch (mode) {
      case FetchMode.ALERT:
        return 'MODE: Ready. Execute the user\'s request using tools. Be concise and action-oriented. Do not ask unnecessary questions.';
      case FetchMode.WORKING:
        return 'MODE: Working on a task. Focus on completion. Report progress, not plans. If the task is done, summarize what changed.';
      case FetchMode.WAITING:
        return 'MODE: Waiting for user input. Process their response as an answer to your previous question. Do not re-ask.';
      case FetchMode.GUARDING:
        return 'MODE: Security alert. Confirm destructive actions only. Everything else proceeds normally.';
      default:
        return 'MODE: Ready.';
    }
  }
}

export const getIdentityManager = () => IdentityManager.getInstance();
