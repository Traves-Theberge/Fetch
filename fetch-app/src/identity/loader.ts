/**
 * @fileoverview Identity Loader
 *
 * Parses identity markdown files into the AgentIdentity structure:
 * - COLLAR.md — System profile (name, role, voice, directives)
 * - ALPHA.md — User/owner profile (name, preferences)
 *
 * @module identity/loader
 */

import { promises as fsp } from 'fs';
import path from 'path';
import { AgentIdentity } from './types.js';
import { logger } from '../utils/logger.js';

export class IdentityLoader {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  public async load(): Promise<Partial<AgentIdentity>> {
    const collarPath = path.join(this.dataDir, 'COLLAR.md');
    let loaded: Partial<AgentIdentity> = {};

    try {
      const content = await fsp.readFile(collarPath, 'utf-8');
      loaded = this.parseSystem(content);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(`Failed to read COLLAR.md`, err);
      } else {
        logger.warn(`COLLAR.md not found at ${collarPath}`);
      }
    }

    const alphaPath = path.join(this.dataDir, 'ALPHA.md');
    try {
      const content = await fsp.readFile(alphaPath, 'utf-8');
      const user = this.parseUser(content);
      if (user.context) {
        loaded.context = { ...(loaded.context || {}), ...user.context } as any;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(`Failed to read ALPHA.md`, err);
      }
    }

    return loaded;
  }

  private parseUser(content: string): Partial<AgentIdentity> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const identity: Partial<AgentIdentity> = { context: {} as any };
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
