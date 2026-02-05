import { AgentIdentity } from './types.js';
import { getSkillManager } from '../skills/manager.js';
import { getModeManager } from '../modes/manager.js';
import { FetchMode } from '../modes/types.js';
import { IdentityLoader } from './loader.js';
import chokidar from 'chokidar';
import path from 'path';
import { logger } from '../utils/logger.js';

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
    owner: process.env.OWNER_PHONE_NUMBER || 'Admin',
    projectRoot: process.cwd(),
    platform: 'Linux'
  }
};

export class IdentityManager {
  private static instance: IdentityManager | undefined;
  private identity: AgentIdentity;
  private loader: IdentityLoader;
  private watchers: ReturnType<typeof chokidar.watch>[] = [];

  private constructor() {
    this.identity = { ...DEFAULT_IDENTITY }; // Clone
    // Assume data is at ../data/identity relative to CWD if we are in fetch-app
    // Or just look for data/identity in Project Root
    // const possiblePaths = [
    //   path.join(process.cwd(), 'data', 'identity'),
    //   path.join(process.cwd(), '..', 'data', 'identity')
    // ];
    
    // Simplification: Assume 'data/identity' relative to where we run or parent
    // The Dockerfile or standard run sets CWD.
    // Let's default to the one that matches the workspace structure
    const dataDir = path.resolve(process.cwd(), '../data/identity'); 
    
    this.loader = new IdentityLoader(dataDir);
    this.reloadIdentity();
    this.setupWatchers(dataDir);
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
   * Build the complete System Prompt for the LLM
   */
  public buildSystemPrompt(): string {
    const skills = getSkillManager().buildSkillsSummary();
    const mode = getModeManager().getState();
    const date = new Date().toISOString();

    return `
You are ${this.identity.name} ${this.identity.emoji}, the ${this.identity.role}.
Voice: ${this.identity.voice.tone}.

SYSTEM CONTEXT:
Time: ${date}
Mode: ${mode.mode} (Since: ${mode.since})
Platform: ${this.identity.context.platform}
Project: ${this.identity.context.projectRoot}

CORE DIRECTIVES:
${this.identity.directives.primary.map(d => `- ${d}`).join('\n')}

OPERATIONAL GUIDELINES:
${this.identity.directives.secondary.map(d => `- ${d}`).join('\n')}

AVAILABLE SKILLS:
${skills}

CURRENT MODE INSTRUCTIONS:
${this.getModeInstructions(mode.mode)}

Analyze the user's request. If a built-in "Instinct" (Slash Command) was triggered, you may not see this message.
Otherwise, use your tools to execute the user's will.
`.trim();
  }

  private getModeInstructions(mode: FetchMode): string {
    switch (mode) {
      case FetchMode.ALERT:
        return 'You are listening. Route the request to the appropriate tool or answer the question. Be concise.';
      case FetchMode.WORKING:
        return 'You are executing a task. Focus on completion. Report status updates.';
      case FetchMode.WAITING:
        return 'You are waiting for input. Process the user response in the context of the previous query.';
      case FetchMode.GUARDING:
        return 'SECURITY ALERT. Do not execute dangerous commands without explicit confirmation.';
      default:
        return 'Standby.';
    }
  }
}

export const getIdentityManager = () => IdentityManager.getInstance();
