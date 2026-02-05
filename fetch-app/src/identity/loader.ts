import fs from 'fs';
import path from 'path';
import { AgentIdentity } from './types.js';

export class IdentityLoader {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  public load(): Partial<AgentIdentity> {
    const systemPath = path.join(this.dataDir, 'SYSTEM.md');
    let loaded: Partial<AgentIdentity> = {};

    if (fs.existsSync(systemPath)) {
      const content = fs.readFileSync(systemPath, 'utf-8');
      loaded = this.parseSystem(content);
    } else {
      console.warn(`[IdentityLoader] SYSTEM.md not found at ${systemPath}`);
    }

    const userPath = path.join(this.dataDir, 'USER.md');
    if (fs.existsSync(userPath)) {
        const content = fs.readFileSync(userPath, 'utf-8');
        const user = this.parseUser(content);
        // Merge user context
        if (user.context) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            loaded.context = { ...(loaded.context || {}), ...user.context } as any;
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
        for (const line of body) {
          // Assuming directives are bullets "key: value" or just text
          const cleaned = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
          identity.directives.primary.push(cleaned);
        }
      } else if (title.startsWith('instincts') || title.startsWith('behavior')) {
         for (const line of body) {
          const cleaned = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
          identity.directives.behavioral.push(cleaned);
        }
      } else if (title.startsWith('communication style')) {
        // Map to secondary directives or voice style
        for (const line of body) {
           const cleaned = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
           identity.directives.secondary.push(cleaned);
        }
      }
    }

    return identity;
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
