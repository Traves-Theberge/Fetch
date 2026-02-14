/**
 * @fileoverview Skill registry, matching, and hot-reload management.
 *
 * Responsibilities:
 * - load built-in and user skills
 * - watch user skill files for add/change/delete
 * - match enabled skills to incoming messages
 * - build prompt-ready summaries and activated instruction blocks
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class SkillManager {
  private skills: Map<string, Skill> = new Map();
  private config: SkillConfig;
  private initialized: boolean = false;
  private watchers: ReturnType<typeof chokidar.watch>[] = [];

  constructor(config: Partial<SkillConfig> = {}) {
    this.config = { ...DEFAULT_SKILL_CONFIG, ...config };
  }

  /**
   * Initializes directories, loads skills, and starts user-skill watcher.
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

  /**
   * Starts chokidar watcher for user skill changes.
   */
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

  /**
   * Reloads one user skill on file add/change events.
   */
  private async handleFileChange(filePath: string) {
      if (!filePath.endsWith('SKILL.md')) return;
      
      const dirPath = path.dirname(filePath);
      logger.info(`Skill updated at ${dirPath}, reloading...`);
      
      const skill = await loadSkill(dirPath, false); // User skill
      if (skill) {
          if (await this.isSkillAvailable(skill)) {
              this.skills.set(skill.id, skill);
              logger.info(`Skill loaded/reloaded: ${skill.id}`);
          } else {
               if (this.skills.delete(skill.id)) {
                 logger.info(`Skill removed after reload because it is now unavailable: ${skill.id}`);
               } else {
                 logger.warn(`Skill ${skill.id} unavailable, skipping.`);
               }
          }
      }
  }

  /**
   * Removes skill from registry when its `SKILL.md` is deleted.
   */
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
   * Matches enabled skills using case-insensitive trigger/name substring checks.
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

    return matches;
  }

  /**
   * Loads skills from a directory of subfolders containing `SKILL.md`.
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
            if (await this.isSkillAvailable(skill)) {
              this.skills.set(skill.id, skill);
              logger.debug(`Loaded skill: ${skill.id}`, { isBuiltin });
            } else {
              logger.debug(`Skipped unavailable skill: ${skill.id}`, { isBuiltin });
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Error loading skills from ${baseDir}`, { error });
    }
  }

  /**
   * Closes active file watchers.
   */
  async shutdown(): Promise<void> {
    for (const watcher of this.watchers) {
      await watcher.close();
    }
    this.watchers = [];
  }

  /**
   * Builds XML summary of enabled skills for system prompt context.
   */
  buildSkillsSummary(): string {
    const enabledSkills = Array.from(this.skills.values())
      .filter(s => s.enabled)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (enabledSkills.length === 0) return '';

    let summary = '<available_skills>\n';
    
    for (const skill of enabledSkills) {
      summary += `  <skill id="${escapeXml(skill.id)}">\n`;
      summary += `    <name>${escapeXml(skill.name)}</name>\n`;
      summary += `    <description>${escapeXml(skill.description)}</description>\n`;
      if (skill.triggers.length > 0) {
        summary += `    <triggers>${escapeXml(skill.triggers.join(', '))}</triggers>\n`;
      }
      summary += `    <location>${escapeXml(skill.sourcePath)}/SKILL.md</location>\n`;
      summary += `  </skill>\n`;
    }
    
    summary += '</available_skills>';
    return summary;
  }

  /**
   * Builds activated skill XML blocks containing full instruction content.
   */
  buildActivatedSkillsContext(matchedSkills: Skill[]): string {
    if (matchedSkills.length === 0) return '';

    const blocks = matchedSkills.map(skill => {
      return `<activated_skill name="${escapeXml(skill.name)}">
  <instructions>
${escapeXml(skill.instructions)}
  </instructions>
</activated_skill>`;
    });

    return `\n## Activated Skill Instructions\n\nThe following skills matched this request. Follow their specialized guidance:\n\n${blocks.join('\n\n')}`;
  }

  private async isSkillAvailable(skill: Skill): Promise<boolean> {
    if (!skill.enabled) {
      return false;
    }
    if (this.config.disabledSkills.includes(skill.id)) {
      return false;
    }
    return checkRequirements(skill.requirements);
  }
}

// Singleton
let instance: SkillManager | null = null;

/**
 * Returns process-wide `SkillManager` singleton.
 */
export function getSkillManager(): SkillManager {
  if (!instance) {
    instance = new SkillManager();
  }
  return instance;
}
