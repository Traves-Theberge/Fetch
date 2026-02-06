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
import type { Skill, SkillConfig, SkillMetadata } from './types.js';
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

    // Ensure directories exist
    await this.ensureDir(this.config.userSkillsDir);
    // Builtin dir should be part of the codebase, so we don't create it if missing,
    // but we check if it exists before reading.

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
   * List all skills with metadata
   */
  listSkills(): SkillMetadata[] {
    return Array.from(this.skills.values()).map(skill => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { instructions, ...metadata } = skill;
      return metadata;
    });
  }

  /**
   * Get a specific skill by ID
   */
  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
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

  private async ensureDir(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EEXIST') throw error;
    }
  }

  // Management methods
  
  async enableSkill(id: string): Promise<boolean> {
    const skill = this.skills.get(id);
    if (!skill) return false;
    skill.enabled = true;
    return true;
  }

  async disableSkill(id: string): Promise<boolean> {
    const skill = this.skills.get(id);
    if (!skill) return false;
    skill.enabled = false;
    return true;
  }

  /**
   * Create a new user skill
   */
  async createSkill(id: string, name: string, description: string): Promise<boolean> {
    if (this.skills.has(id)) {
      throw new Error(`Skill with ID "${id}" already exists`);
    }

    const skillDir = path.join(this.config.userSkillsDir, id);
    const skillFile = path.join(skillDir, 'SKILL.md');

    try {
      await this.ensureDir(skillDir);

      const content = `---
name: ${name}
description: ${description}
triggers:
  - ${name.toLowerCase()}
---

# ${name}

Write your skill instructions here.
`;

      await fs.writeFile(skillFile, content, 'utf-8');
      
      // Load the new skill
      const skill = await loadSkill(skillDir, false);
      if (skill) {
        this.skills.set(skill.id, skill);
        logger.info(`Created new skill: ${id}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Failed to create skill ${id}`, { error });
      throw error;
    }
  }

  /**
   * Delete a user skill
   */
  async deleteSkill(id: string): Promise<boolean> {
    const skill = this.skills.get(id);
    if (!skill) return false;

    if (skill.isBuiltin) {
      throw new Error('Cannot delete built-in skills');
    }

    try {
      // Remove from map
      this.skills.delete(id);
      
      // Remove from disk
      await fs.rm(skill.sourcePath, { recursive: true, force: true });
      
      logger.info(`Deleted skill: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete skill ${id}`, { error });
      throw error;
    }
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
      return `<activated_skill name="${skill.name}">
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
