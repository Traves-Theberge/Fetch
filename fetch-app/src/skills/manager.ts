/**
 * @fileoverview Skill Manager
 * 
 * Manages the lifecycle, registry, and retrieval of skills.
 * 
 * @module skills/manager
 */

import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger.js';
import type { Skill, SkillConfig } from './types.js';
import { loadSkill, checkRequirements } from './loader.js';
import { SKILLS_DIR } from '../config/paths.js';
import chokidar from 'chokidar';

const DEFAULT_SKILL_CONFIG: SkillConfig = {
  userSkillsDir: SKILLS_DIR,
  builtinSkillsDir: path.join(process.cwd(), 'src/skills/builtin'),
  disabledSkills: [],
};

export class SkillManager {
  private skills: Map<string, Skill> = new Map();
  private config: SkillConfig;
  private initialized: boolean = false;
  private watchers: ReturnType<typeof chokidar.watch>[] = [];

  constructor(config: Partial<SkillConfig> = {}) {
    this.config = { ...DEFAULT_SKILL_CONFIG, ...config };
  }

  /**
   * Initialize the manager and load all skills
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing SkillManager...');

    // Ensure user skills directory exists (builtin dir is part of the codebase)
    await fs.mkdir(this.config.userSkillsDir, { recursive: true });

    // Load built-in skills
    await this.loadSkillsFromDir(this.config.builtinSkillsDir, true);

    // Load user skills
    await this.loadSkillsFromDir(this.config.userSkillsDir, false);

    // Setup watcher for user skills
    this.setupWatcher(this.config.userSkillsDir);

    this.initialized = true;
    logger.info(`SkillManager initialized. Loaded ${this.skills.size} skills.`);
  }

  private setupWatcher(dir: string) {
     try {
         const watcher = chokidar.watch(dir, {
             ignored: /(^|[/\\])\../,
             persistent: true,
             depth: 2 // Watch for SKILL.md inside folders
         });

         watcher.on('add', (filePath) => this.handleFileChange(filePath));
         watcher.on('change', (filePath) => this.handleFileChange(filePath));
         watcher.on('unlink', (filePath) => this.handleFileDelete(filePath));
         watcher.on('error', (error) => {
             logger.error(`Skill watcher error for ${dir}`, error);
         });

         this.watchers.push(watcher);
     } catch (err) {
         logger.error('Failed to setup skill watcher', err);
     }
  }

  private async handleFileChange(filePath: string) {
      if (!filePath.endsWith('SKILL.md')) return;
      
      const dirPath = path.dirname(filePath);
      logger.info(`Skill updated at ${dirPath}, reloading...`);
      
      const skill = await loadSkill(dirPath, false); // User skill
      if (skill) {
          if (await checkRequirements(skill.requirements)) {
              this.skills.set(skill.id, skill);
              logger.info(`Skill loaded/reloaded: ${skill.id}`);
          } else {
               logger.warn(`Skill ${skill.id} requirements not met, skipping.`);
          }
      }
  }

  private handleFileDelete(filePath: string) {
       if (!filePath.endsWith('SKILL.md')) return;
       const dirPath = path.dirname(filePath);
       const id = path.basename(dirPath);
       
       if (this.skills.has(id)) {
           this.skills.delete(id);
           logger.info(`Skill removed: ${id}`);
       }
  }


  /**
   * Match skills based on a query/message
   * Currently implements simple keyword matching on triggers and name
   */
  async matchSkills(message: string): Promise<Skill[]> {
    const matches: Skill[] = [];
    const normalizedMessage = message.toLowerCase();

    for (const skill of this.skills.values()) {
      if (!skill.enabled) continue;

      // Check specific triggers
      if (skill.triggers.some(t => normalizedMessage.includes(t.toLowerCase()))) {
        matches.push(skill);
        continue;
      }

      // Check name/ID matches (e.g. "use git skill")
      if (normalizedMessage.includes(skill.name.toLowerCase()) || 
          normalizedMessage.includes(skill.id.toLowerCase())) {
        matches.push(skill);
      }
    }

    // Verify requirements for matched skills (filter out incompatible ones)
    const validMatches: Skill[] = [];
    for (const skill of matches) {
      if (await checkRequirements(skill.requirements)) {
        validMatches.push(skill);
      }
    }

    return validMatches;
  }

  /**
   * Load skills from a specific directory recursively or flat
   * Structure: dir/SKILL.md or dir/skill-name/SKILL.md
   */
  private async loadSkillsFromDir(baseDir: string, isBuiltin: boolean): Promise<void> {
    try {
      // Check if dir exists
      try {
        await fs.access(baseDir);
      } catch {
        logger.debug(`Skill directory not found: ${baseDir}`);
        return;
      }

      const entries = await fs.readdir(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = path.join(baseDir, entry.name);
          const skill = await loadSkill(skillDir, isBuiltin);
          
          if (skill) {
            this.skills.set(skill.id, skill);
            logger.debug(`Loaded skill: ${skill.id}`, { isBuiltin });
          }
        }
      }
    } catch (error) {
      logger.error(`Error loading skills from ${baseDir}`, { error });
    }
  }

  async shutdown(): Promise<void> {
    for (const watcher of this.watchers) {
      await watcher.close();
    }
    this.watchers = [];
  }

  /**
   * Build an XML summary of enabled skills for the system prompt
   */
  buildSkillsSummary(): string {
    const enabledSkills = Array.from(this.skills.values())
      .filter(s => s.enabled)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (enabledSkills.length === 0) return '';

    let summary = '<available_skills>\n';
    
    for (const skill of enabledSkills) {
      summary += `  <skill id="${skill.id}">\n`;
      summary += `    <name>${skill.name}</name>\n`;
      summary += `    <description>${skill.description}</description>\n`;
      if (skill.triggers.length > 0) {
        summary += `    <triggers>${skill.triggers.join(', ')}</triggers>\n`;
      }
      summary += `    <location>${skill.sourcePath}/SKILL.md</location>\n`;
      summary += `  </skill>\n`;
    }
    
    summary += '</available_skills>';
    return summary;
  }

  /**
   * Build activated skill context from matched skills.
   * Injects the full instruction body for skills that match the user's message.
   * This is the "Phase 2" of the discovery → activation pattern.
   */
  buildActivatedSkillsContext(matchedSkills: Skill[]): string {
    if (matchedSkills.length === 0) return '';

    const blocks = matchedSkills.map(skill => {
      const harnessAttr = skill.harnessHint ? ` harness_hint="${skill.harnessHint}"` : '';
      return `<activated_skill name="${skill.name}"${harnessAttr}>
  <instructions>
${skill.instructions}
  </instructions>
</activated_skill>`;
    });

    return `\n## Activated Skill Instructions\n\nThe following skills matched this request. Follow their specialized guidance:\n\n${blocks.join('\n\n')}`;
  }
}

// Singleton
let instance: SkillManager | null = null;

export function getSkillManager(): SkillManager {
  if (!instance) {
    instance = new SkillManager();
  }
  return instance;
}
