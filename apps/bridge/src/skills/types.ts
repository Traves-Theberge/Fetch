/**
 * @fileoverview Skills domain types.
 *
 * Defines the parsed skill model, optional runtime requirements,
 * and manager configuration for built-in and user skill directories.
 *
 * @module skills/types
 */

// =============================================================================
// SKILL DEFINITION
// =============================================================================

/**
 * Parsed skill definition loaded from a `SKILL.md` file.
 */
export interface Skill {
  /** Unique ID (e.g., "git-ops") */
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
 * Optional runtime constraints for loading/activating a skill.
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
 * Skill manager configuration values.
 */
export interface SkillConfig {
  /** Directory for custom user skills */
  userSkillsDir: string;
  /** Directory for built-in skills */
  builtinSkillsDir: string;
  /** List of disabled skill IDs */
  disabledSkills: string[];
}
