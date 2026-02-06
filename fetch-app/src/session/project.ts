/**
 * @fileoverview Project Scanner - Workspace Discovery & Management
 * 
 * Scans the workspace for git repositories, detects project types,
 * and provides context about each project for session management.
 * 
 * @module session/project
 * @see {@link scanProjects} - Find all projects in workspace
 * @see {@link getProject} - Get detailed project context
 * @see {@link buildProjectContext} - Build full context for a path
 * 
 * ## Workspace Structure
 * 
 * ```
 * /workspace
 * ├── project-a/          ← git repo → detected
 * │   ├── .git/
 * │   ├── package.json    → type: node
 * │   └── src/
 * ├── project-b/          ← git repo → detected
 * │   ├── .git/
 * │   └── Cargo.toml      → type: rust
 * ├── not-a-repo/         ← no .git → ignored
 * └── .hidden/            ← hidden → ignored
 * ```
 * 
 * ## Project Types
 * 
 * | Type | Detected By | Main Files |
 * |------|-------------|------------|
 * | node | package.json | src/index.ts, index.js |
 * | python | requirements.txt, pyproject.toml | main.py, app.py |
 * | rust | Cargo.toml | src/main.rs, src/lib.rs |
 * | go | go.mod | main.go, cmd/main.go |
 * | java | pom.xml, build.gradle | src/main/java |
 * | unknown | (none match) | README.md, Makefile |
 * 
 * ## Context Information
 * 
 * Each project context includes:
 * - Name and path
 * - Detected type
 * - Git branch
 * - Last commit message
 * - Uncommitted changes flag
 * - Main entry files
 * 
 * @example
 * ```typescript
 * import { scanProjects, getProject } from './project.js';
 * 
 * // Find all projects
 * const projects = await scanProjects();
 * // → ['fetch-app', 'my-api', 'frontend']
 * 
 * // Get details for one
 * const context = await getProject('fetch-app');
 * // → { name: 'fetch-app', type: 'node', gitBranch: 'main', ... }
 * ```
 */

import { readdir, stat, access } from 'fs/promises';
import { join, basename } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ProjectContext, ProjectType } from './types.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Workspace root directory (configurable via WORKSPACE_ROOT env var).
 * @constant {string}
 */
import { env } from '../config/env.js';

const WORKSPACE_ROOT = env.WORKSPACE_ROOT;

// =============================================================================
// TYPE DETECTION
// =============================================================================

/**
 * Detects the project type based on marker files.
 * 
 * Checks for language-specific files in order of priority.
 * Returns 'unknown' if no markers are found.
 * 
 * @param {string} projectPath - Absolute path to project
 * @returns {Promise<ProjectType>} Detected project type
 * @private
 * 
 * @example
 * ```typescript
 * await detectProjectType('/workspace/my-app');
 * // Has package.json → 'node'
 * // Has Cargo.toml → 'rust'
 * // Has nothing → 'unknown'
 * ```
 */
async function detectProjectType(projectPath: string): Promise<ProjectType> {
  const typeIndicators: [string, ProjectType][] = [
    ['package.json', 'node'],
    ['requirements.txt', 'python'],
    ['pyproject.toml', 'python'],
    ['Cargo.toml', 'rust'],
    ['go.mod', 'go'],
    ['pom.xml', 'java'],
    ['build.gradle', 'java'],
  ];

  for (const [file, type] of typeIndicators) {
    try {
      await access(join(projectPath, file));
      return type;
    } catch {
      // File doesn't exist, try next
    }
  }

  return 'unknown';
}

/**
 * Finds the main/entry files for a project.
 * 
 * Checks for common entry points based on project type.
 * Limited to 5 files maximum.
 * 
 * @param {string} projectPath - Absolute path to project
 * @param {ProjectType} type - Detected project type
 * @returns {Promise<string[]>} Array of existing main file paths
 * @private
 */
async function detectMainFiles(projectPath: string, type: ProjectType): Promise<string[]> {
  const mainFiles: string[] = [];
  
  const candidates: Record<ProjectType, string[]> = {
    node: ['package.json', 'src/index.ts', 'src/index.js', 'index.ts', 'index.js'],
    python: ['requirements.txt', 'pyproject.toml', 'main.py', 'app.py', 'src/main.py'],
    rust: ['Cargo.toml', 'src/main.rs', 'src/lib.rs'],
    go: ['go.mod', 'main.go', 'cmd/main.go'],
    java: ['pom.xml', 'build.gradle', 'src/main/java'],
    unknown: ['README.md', 'README', 'Makefile'],
  };

  for (const file of candidates[type]) {
    try {
      await access(join(projectPath, file));
      mainFiles.push(file);
    } catch {
      // File doesn't exist
    }
  }

  return mainFiles.slice(0, 5); // Limit to 5 main files
}

// =============================================================================
// GIT HELPERS
// =============================================================================

/**
 * Gets the current git branch name.
 * 
 * @param {string} projectPath - Path to git repository
 * @returns {Promise<string|null>} Branch name or null if not a git repo
 * @private
 */
async function getGitBranch(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectPath });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Gets the last commit message (truncated).
 * 
 * @param {string} projectPath - Path to git repository
 * @returns {Promise<string|null>} Commit message (max 50 chars) or null
 * @private
 */
async function getLastCommit(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git log -1 --pretty=format:"%s"', { cwd: projectPath });
    const msg = stdout.trim();
    // Truncate long messages
    return msg.length > 50 ? msg.substring(0, 47) + '...' : msg;
  } catch {
    return null;
  }
}

/**
 * Checks if repository has uncommitted changes.
 * 
 * @param {string} projectPath - Path to git repository
 * @returns {Promise<boolean>} True if working tree is dirty
 * @private
 */
async function hasUncommittedChanges(projectPath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: projectPath });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Checks if a directory is a git repository.
 * 
 * @param {string} dirPath - Directory to check
 * @returns {Promise<boolean>} True if .git folder exists
 * @private
 */
async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    await access(join(dirPath, '.git'));
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Builds a complete project context for a directory.
 * 
 * Gathers all available information about a project including
 * type detection, git status, and main files.
 * 
 * @param {string} projectPath - Absolute path to project
 * @returns {Promise<ProjectContext>} Full project context
 * 
 * @example
 * ```typescript
 * const context = await buildProjectContext('/workspace/my-app');
 * // → {
 * //     name: 'my-app',
 * //     path: '/workspace/my-app',
 * //     type: 'node',
 * //     mainFiles: ['package.json', 'src/index.ts'],
 * //     gitBranch: 'main',
 * //     lastCommit: 'Add login feature',
 * //     hasUncommitted: true,
 * //     refreshedAt: '2024-01-15T10:30:00Z'
 * //   }
 * ```
 */
export async function buildProjectContext(projectPath: string): Promise<ProjectContext> {
  const name = basename(projectPath);
  const type = await detectProjectType(projectPath);
  const mainFiles = await detectMainFiles(projectPath, type);
  const gitBranch = await getGitBranch(projectPath);
  const lastCommit = await getLastCommit(projectPath);
  const hasUncommitted = await hasUncommittedChanges(projectPath);

  return {
    name,
    path: projectPath,
    type,
    mainFiles,
    gitBranch,
    lastCommit,
    hasUncommitted,
    refreshedAt: new Date().toISOString(),
  };
}

/**
 * Scans the workspace for all git repositories.
 * 
 * Returns project names (directory names) sorted alphabetically.
 * Only includes top-level directories with .git folders.
 * Hidden directories (starting with .) are ignored.
 * 
 * @returns {Promise<string[]>} Sorted array of project names
 * 
 * @example
 * ```typescript
 * const projects = await scanProjects();
 * // → ['api-server', 'fetch-app', 'web-frontend']
 * ```
 */
export async function scanProjects(): Promise<string[]> {
  const projects: string[] = [];

  try {
    const entries = await readdir(WORKSPACE_ROOT, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const dirPath = join(WORKSPACE_ROOT, entry.name);
        
        if (await isGitRepo(dirPath)) {
          projects.push(entry.name);
        }
      }
    }

    logger.debug(`Found ${projects.length} projects in workspace`, { projects });
  } catch (error) {
    logger.error('Failed to scan workspace', { error });
  }

  return projects.sort();
}

/**
 * Gets detailed project context by name.
 * 
 * Looks up a project in the workspace by name and builds
 * full context if it exists and is a git repository.
 * 
 * @param {string} projectName - Name of the project (directory name)
 * @returns {Promise<ProjectContext|null>} Project context or null if not found
 * 
 * @example
 * ```typescript
 * const project = await getProject('my-app');
 * if (project) {
 *   console.log(`${project.name} is on branch ${project.gitBranch}`);
 * }
 * ```
 */
export async function getProject(projectName: string): Promise<ProjectContext | null> {
  const projectPath = join(WORKSPACE_ROOT, projectName);
  
  try {
    const stats = await stat(projectPath);
    if (!stats.isDirectory()) {
      return null;
    }

    if (!(await isGitRepo(projectPath))) {
      return null;
    }

    return buildProjectContext(projectPath);
  } catch {
    return null;
  }
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Formats project context for WhatsApp display.
 * 
 * Creates a compact, emoji-enhanced summary of project status.
 * 
 * @param {ProjectContext} project - Project to format
 * @returns {string} Formatted project info
 * 
 * @example
 * ```typescript
 * formatProjectInfo(project);
 * // → 📂 my-app (node)
 * //   📍 Branch: main
 * //   📝 Last: "Add login feature"
 * //   ⚠️ Uncommitted changes
 * ```
 */
export function formatProjectInfo(project: ProjectContext): string {
  const lines: string[] = [];
  
  lines.push(`📂 ${project.name} (${project.type})`);
  
  if (project.gitBranch) {
    lines.push(`📍 Branch: ${project.gitBranch}`);
  }
  
  if (project.lastCommit) {
    lines.push(`📝 Last: "${project.lastCommit}"`);
  }
  
  if (project.hasUncommitted) {
    lines.push(`⚠️ Uncommitted changes`);
  } else {
    lines.push(`✨ Clean working tree`);
  }

  return lines.join('\n');
}

/**
 * Formats project list for WhatsApp display.
 * 
 * Shows available projects with current selection indicated.
 * Includes help text for navigation commands.
 * 
 * @param {string[]} projects - Array of project names
 * @param {string|null} currentProject - Currently selected project name
 * @returns {string} Formatted project list
 * 
 * @example
 * ```typescript
 * formatProjectList(['api', 'web', 'mobile'], 'web');
 * // → 📂 Available projects:
 * //   
 * //   • api
 * //   • web ← current
 * //   • mobile
 * //   
 * //   /project <name> to switch
 * ```
 */
export function formatProjectList(projects: string[], currentProject: string | null): string {
  if (projects.length === 0) {
    return `📂 No projects in workspace

Use /clone <url> to clone a repo
Or /init <name> to start new`;
  }

  const lines = ['📂 Available projects:', ''];
  
  for (const name of projects) {
    const isCurrent = name === currentProject;
    lines.push(isCurrent ? `• ${name} ← current` : `• ${name}`);
  }
  
  lines.push('', '/project <name> to switch');

  return lines.join('\n');
}
