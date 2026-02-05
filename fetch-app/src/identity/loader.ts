import fs from 'fs';
import path from 'path';
import { AgentIdentity } from './types.js';

export class IdentityLoader {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  public load(): Partial<AgentIdentity> {
    const collarPath = path.join(this.dataDir, 'COLLAR.md');
    let loaded: Partial<AgentIdentity> = {};

    if (fs.existsSync(collarPath)) {
      const content = fs.readFileSync(collarPath, 'utf-8');
      loaded = this.parseSystem(content);
    } else {
      console.warn(`[IdentityLoader] COLLAR.md not found at ${collarPath}`);
    }

    const alphaPath = path.join(this.dataDir, 'ALPHA.md');
    if (fs.existsSync(alphaPath)) {
        const content = fs.readFileSync(alphaPath, 'utf-8');
        const user = this.parseUser(content);
        // Merge user context
        if (user.context) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            loaded.context = { ...(loaded.context || {}), ...user.context } as any;
        }
    }

    const agentsPath = path.join(this.dataDir, 'AGENTS.md');
    if (fs.existsSync(agentsPath)) {
        const content = fs.readFileSync(agentsPath, 'utf-8');
        const agents = this.parseAgents(content);
        if (agents.pack) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            loaded.context = { ...(loaded.context || {}), pack: agents.pack } as any;
        }
    }

    return loaded;
  }

  private parseUser(content: string): Partial<AgentIdentity> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const identity: Partial<AgentIdentity> = { context: {} as any };
      // Simple parsing like parseSystem
       const sections = content.split(/^## /m);
       for (const section of sections) {
            const lines = section.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const title = lines[0].toLowerCase();
            const body = lines.slice(1);
            
            if (title.startsWith('user profile') || title.startsWith('administrator')) {
                for (const line of body) {
                    if (line.startsWith('- **Name:**')) identity.context!.owner = this.extractValue(line);
                }
            }
       }
       return identity;
  }

  private parseSystem(content: string): Partial<AgentIdentity> {
    const sections = content.split(/^## /m);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const identity: any = { 
      voice: {},
      directives: {
        primary: [],
        secondary: [],
        behavioral: []
      }
    };

    for (const section of sections) {
      const lines = section.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const title = lines[0].toLowerCase();
      const body = lines.slice(1);

      if (title.startsWith('core identity') || title.startsWith('system profile')) {
        for (const line of body) {
          if (line.startsWith('- **Name:**')) identity.name = this.extractValue(line);
          if (line.startsWith('- **Role:**')) identity.role = this.extractValue(line);
          if (line.startsWith('- **Voice:**')) identity.voice.tone = this.extractValue(line);
          if (line.startsWith('- **Emoji:**')) identity.emoji = this.extractValue(line);
        }
      } else if (title.startsWith('directives')) {
        // Parse ### subsections: Primary Directives, Operational Guidelines, Behavioral Traits
        let currentBucket: 'primary' | 'secondary' | 'behavioral' = 'primary';
        for (const line of body) {
          // Detect ### subsection headings
          if (line.startsWith('### ')) {
            const sub = line.replace('### ', '').toLowerCase();
            if (sub.includes('primary')) currentBucket = 'primary';
            else if (sub.includes('operational') || sub.includes('guideline')) currentBucket = 'secondary';
            else if (sub.includes('behavioral') || sub.includes('personality')) currentBucket = 'behavioral';
            continue;
          }
          // Skip table headers and separator rows
          if (line.startsWith('|') || line.startsWith('---')) continue;
          const cleaned = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
          if (cleaned.length > 0) {
            identity.directives[currentBucket].push(cleaned);
          }
        }
      } else if (title.startsWith('instincts') || title.startsWith('behavior')) {
        for (const line of body) {
          if (line.startsWith('### ') || line.startsWith('|') || line.startsWith('---')) continue;
          const cleaned = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
          if (cleaned.length > 0) identity.directives.behavioral.push(cleaned);
        }
      } else if (title.startsWith('communication style')) {
        for (const line of body) {
          if (line.startsWith('### ') || line.startsWith('|') || line.startsWith('---')) continue;
          const cleaned = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
          if (cleaned.length > 0) identity.directives.secondary.push(cleaned);
        }
      }
    }

    return identity;
  }

  private parseAgents(content: string): { pack: Array<{ name: string; harness: string; role: string; strengths: string }> } {
    const pack: Array<{ name: string; harness: string; role: string; strengths: string }> = [];
    const memberBlocks = content.split(/^### /m).slice(1);

    for (const block of memberBlocks) {
      const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const member: { name: string; harness: string; role: string; strengths: string } = {
        name: '', harness: '', role: '', strengths: ''
      };

      for (const line of lines) {
        if (line.startsWith('- **Harness:**')) member.harness = this.extractValue(line);
        if (line.startsWith('- **Role:**')) member.role = this.extractValue(line);
        if (line.startsWith('- **Strengths:**')) member.strengths = this.extractValue(line);
      }

      // Extract name from heading (e.g., "1. Claude (The Sage)")
      const heading = lines[0] || '';
      const nameMatch = heading.match(/\d+\.\s+(.+?)\s*(?:\(|$)/);
      if (nameMatch) member.name = nameMatch[1].trim();

      if (member.name && member.harness) pack.push(member);
    }

    return { pack };
  }

  private extractValue(line: string): string {
    const parts = line.split('**');
    if (parts.length >= 3) {
        // - **Key:** Value
        // parts[0] = "- "
        // parts[1] = "Key:"
        // parts[2] = " Value"
        return parts[2].trim();
    }
    return '';
  }
}
