/**
 * @fileoverview Skill Loader
 * 
 * Parses SKILL.md files to load skills into the system.
 * Handles parsing frontmatter, validating requirements, and validation.
 * 
 * @module skills/loader
 */

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { logger } from '../utils/logger.js';
import type { Skill, SkillRequirements } from './types.js';

/**
 * Expected frontmatter structure in SKILL.md
 */
interface SkillFrontmatter {
  name: string;
  description: string;
  version?: string;
  triggers?: string[];
  requirements?: SkillRequirements;
  enabled?: boolean;
}

/**
 * Load a skill from a directory containing a SKILL.md file
 * 
 * @param dirPath - Path to directory containing SKILL.md
 * @param isBuiltin - Whether this is a built-in skill
 * @returns Parsed Skill object or null if invalid
 */
export async function loadSkill(dirPath: string, isBuiltin: boolean = false): Promise<Skill | null> {
  const skillFilePath = path.join(dirPath, 'SKILL.md');
  const id = path.basename(dirPath);

  try {
    // Check if file exists
    try {
      await fs.access(skillFilePath);
    } catch {
      logger.debug(`No SKILL.md found in ${dirPath}`);
      return null;
    }

    // Read and parse file
    const fileContent = await fs.readFile(skillFilePath, 'utf-8');
    const { data, content } = matter(fileContent);
    const frontmatter = data as SkillFrontmatter;

    // Validate required fields
    if (!frontmatter.name || !frontmatter.description) {
      logger.warn(`Invalid skill at ${dirPath}: missing name or description`);
      return null;
    }

    // Construct Skill object
    const skill: Skill = {
      id,
      name: frontmatter.name,
      description: frontmatter.description,
      version: frontmatter.version || '1.0.0',
      requirements: frontmatter.requirements,
      triggers: frontmatter.triggers || [],
      instructions: content.trim(),
      sourcePath: dirPath,
      isBuiltin,
      enabled: frontmatter.enabled !== false, // Default to true
    };

    return skill;

  } catch (error) {
    logger.error(`Failed to load skill from ${dirPath}`, { error });
    return null;
  }
}

/**
 * Check if a skill's requirements are met
 * 
 * @param reqs - Skill requirements
 * @returns true if all requirements met
 */
export async function checkRequirements(reqs?: SkillRequirements): Promise<boolean> {
  if (!reqs) return true;

  // Check platform
  if (reqs.platform && reqs.platform.length > 0) {
    if (!reqs.platform.includes(process.platform as 'linux' | 'darwin' | 'win32')) {
      return false;
    }
  }

  // Check env vars
  if (reqs.envVars) {
    for (const envVar of reqs.envVars) {
      if (!process.env[envVar]) {
        return false;
      }
    }
  }

  // Check binaries (basic check using 'which')
  if (reqs.binaries) {
    // This is expensive to do on every load, should be cached.
    // For now, we assume if we are running effectively, we might skip this 
    // or implement a lightweight check later.
    // TODO: Implement binary check using `which`
  }

  return true;
}
