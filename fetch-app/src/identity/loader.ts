/**
 * @fileoverview Identity Loader
 *
 * Parses identity markdown files into the AgentIdentity structure:
 * - COLLAR.md — System profile (name, role, voice, directives)
 * - ALPHA.md — User/owner profile (name, preferences)
 * - data/agents/*.md — Pack member profiles (YAML frontmatter via gray-matter)
 *
 * @module identity/loader
 */

import { promises as fsp } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { AgentIdentity, PackMember } from './types.js';
import { AGENTS_DIR } from '../config/paths.js';
import { logger } from '../utils/logger.js';

export class IdentityLoader {
  private dataDir: string;
  private agentsDir: string;

  constructor(dataDir: string, agentsDir?: string) {
    this.dataDir = dataDir;
    this.agentsDir = agentsDir ?? AGENTS_DIR;
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

    const pack = await this.loadAgents();
    if (pack.length > 0) {
      loaded.pack = pack;
    }

    return loaded;
  }

  /**
   * Load agent profiles from data/agents/*.md using gray-matter.
   * Each file has YAML frontmatter with structured fields and a markdown body.
   */
  private async loadAgents(): Promise<PackMember[]> {
    const pack: PackMember[] = [];

    try {
      await fsp.access(this.agentsDir);
    } catch {
      return pack;
    }

    const entries = await fsp.readdir(this.agentsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

      const filePath = path.join(this.agentsDir, entry.name);
      try {
        const raw = await fsp.readFile(filePath, 'utf-8');
        const { data, content } = matter(raw);

        if (!data.name || !data.harness) {
          logger.warn(`Skipping ${entry.name}: missing name or harness in frontmatter`);
          continue;
        }

        const member: PackMember = {
          name: data.name,
          alias: data.alias || '',
          emoji: data.emoji || '',
          harness: data.harness,
          cli: data.cli || data.harness,
          role: data.role || '',
          fallback_priority: data.fallback_priority ?? 99,
          triggers: Array.isArray(data.triggers) ? data.triggers : [],
          avoid: Array.isArray(data.avoid) ? data.avoid : [],
          body: content.trim(),
          sourcePath: filePath,
        };

        pack.push(member);
      } catch (err) {
        logger.error(`Failed to parse agent file ${entry.name}:`, err);
      }
    }

    pack.sort((a, b) => a.fallback_priority - b.fallback_priority);
    return pack;
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
