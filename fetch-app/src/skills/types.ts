/**
 * @fileoverview Skills Type Definitions
 * @module skills/types
 */

// =============================================================================
// SKILL DEFINITION
// =============================================================================

/**
 * Skill definition loaded from SKILL.md
 */
export interface Skill {
  /** Unqiue ID (e.g., "git-ops") */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Version string */
  version: string;
  /** System requirements */
  requirements?: SkillRequirements;
  /** Example triggers */
  triggers: string[];
  /** Full prompt/instructions content */
  instructions: string;
  /** Where this skill was loaded from */
  sourcePath: string;
  /** Is this a built-in skill? */
  isBuiltin: boolean;
  /** Is this skill currently enabled? */
  enabled: boolean;
}

/**
 * Lightweight metadata for listing skills
 */
export type SkillMetadata = Omit<Skill, 'instructions'>;

/**
 * Requirements for a skill to run
 */
export interface SkillRequirements {
  /** Required binaries in PATH */
  binaries?: string[];
  /** Required environment variables */
  envVars?: string[];
  /** OS platform restrictions */
  platform?: ('linux' | 'darwin' | 'win32')[];
}

// =============================================================================
// SKILL MANAGER TYPES
// =============================================================================

/**
 * Configuration for SkillManager
 */
export interface SkillConfig {
  /** Directory for custom user skills */
  userSkillsDir: string;
  /** Directory for built-in skills */
  builtinSkillsDir: string;
  /** List of disabled skill IDs */
  disabledSkills: string[];
}
