/**
 * @fileoverview Project & Git Command Handlers
 *
 * Handlers for /projects, /project, /clone, /init, /git, /diff, /log.
 *
 * @module commands/project
 */

import { Session } from '../session/types.js';
import { SessionManager } from '../session/manager.js';
import { scanProjects, getProject, formatProjectList, formatProjectInfo } from '../session/project.js';
import { logger } from '../utils/logger.js';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { env } from '../config/env.js';
import type { CommandResult } from './types.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/** Workspace root for project operations */
const WORKSPACE_ROOT = env.WORKSPACE_ROOT;

// ── List Projects ────────────────────────────────────────────────────────────

export async function handleListProjects(
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const projects = await scanProjects();
  session.availableProjects = projects;
  await sessionManager.updateSession(session);

  const currentName = session.currentProject?.name ?? null;

  return { handled: true, responses: [formatProjectList(projects, currentName)] };
}

// ── Switch Project ───────────────────────────────────────────────────────────

export async function handleSwitchProject(
  projectName: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const projects = await scanProjects();
  session.availableProjects = projects;

  if (!projects.includes(projectName)) {
    const matches = projects.filter((p) =>
      p.toLowerCase().includes(projectName.toLowerCase())
    );

    if (matches.length === 0) {
      return {
        handled: true,
        responses: [
          `Project "${projectName}" not found.\n\nAvailable: ${projects.join(', ') || 'none'}`,
        ],
      };
    }

    if (matches.length > 1) {
      return {
        handled: true,
        responses: [`Multiple matches: ${matches.join(', ')}\n\nBe more specific.`],
      };
    }

    projectName = matches[0];
  }

  const project = await getProject(projectName);

  if (!project) {
    return { handled: true, responses: [`Failed to load project "${projectName}".`] };
  }

  session.currentProject = project;
  session.activeFiles = [];
  session.repoMap = null;
  await sessionManager.updateSession(session);

  logger.info('Switched project', { project: projectName, userId: session.userId });

  return {
    handled: true,
    responses: [`🐕 Now working on: ${project.name}\n\n${formatProjectInfo(project)}`],
  };
}

// ── Clone ────────────────────────────────────────────────────────────────────

function extractRepoName(url: string): string | null {
  const httpsMatch = url.match(/\/([^/]+?)(\.git)?$/);
  const sshMatch = url.match(/:([^/]+\/)?([^/]+?)(\.git)?$/);

  if (httpsMatch) return httpsMatch[1].replace('.git', '');
  if (sshMatch) return sshMatch[2].replace('.git', '');
  return null;
}

export async function handleClone(
  url: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  if (!url) {
    return {
      handled: true,
      responses: ['Usage: /clone <git-url>\n\nExample: /clone https://github.com/user/repo'],
    };
  }

  const repoName = extractRepoName(url);
  if (!repoName) {
    return { handled: true, responses: ['Invalid git URL. Use HTTPS or SSH format.'] };
  }

  const targetPath = join(WORKSPACE_ROOT, repoName);

  try {
    logger.info('Cloning repository', { url, target: targetPath });

    await execFileAsync('git', ['clone', '--depth', '1', url, targetPath], {
      timeout: 120000,
    });

    const projects = await scanProjects();
    session.availableProjects = projects;

    const project = await getProject(repoName);
    if (project) {
      session.currentProject = project;
      session.activeFiles = [];
      session.repoMap = null;
      await sessionManager.updateSession(session);

      return { handled: true, responses: [`✅ Cloned ${repoName}\n\n${formatProjectInfo(project)}`] };
    }

    await sessionManager.updateSession(session);
    return {
      handled: true,
      responses: [`✅ Cloned ${repoName}\n\nUse /project ${repoName} to switch to it.`],
    };
  } catch (error) {
    logger.error('Clone failed', { url, error });
    const errMsg = error instanceof Error ? error.message : String(error);

    if (errMsg.includes('already exists')) {
      return {
        handled: true,
        responses: [
          `Project ${repoName} already exists.\n\nUse /project ${repoName} to switch to it.`,
        ],
      };
    }

    return { handled: true, responses: [`❌ Clone failed: ${errMsg.substring(0, 100)}`] };
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

export async function handleInit(
  projectName: string,
  session: Session,
  sessionManager: SessionManager
): Promise<CommandResult> {
  if (!projectName) {
    return {
      handled: true,
      responses: ['Usage: /init <project-name>\n\nExample: /init my-new-app'],
    };
  }

  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const targetPath = join(WORKSPACE_ROOT, safeName);

  try {
    await mkdir(targetPath, { recursive: true });
    await execAsync('git init', { cwd: targetPath });
    await execAsync(`echo "# ${safeName}" > README.md`, { cwd: targetPath });
    await execAsync('git add README.md', { cwd: targetPath });
    await execAsync('git commit -m "Initial commit"', { cwd: targetPath });

    logger.info('Initialized project', { name: safeName, path: targetPath });

    const projects = await scanProjects();
    session.availableProjects = projects;

    const project = await getProject(safeName);
    if (project) {
      session.currentProject = project;
      session.activeFiles = [];
      session.repoMap = null;
      await sessionManager.updateSession(session);

      return { handled: true, responses: [`✅ Created ${safeName}\n\n${formatProjectInfo(project)}`] };
    }

    await sessionManager.updateSession(session);
    return { handled: true, responses: [`✅ Created ${safeName} at ${targetPath}`] };
  } catch (error) {
    logger.error('Init failed', { projectName, error });
    return { handled: true, responses: [`❌ Failed to initialize project: ${error}`] };
  }
}

// ── Git Helpers ──────────────────────────────────────────────────────────────

export async function handleGitStatus(session: Session): Promise<CommandResult> {
  if (!session.currentProject) {
    return {
      handled: true,
      responses: ['No project selected.\n\nUse /project <name> to select one.'],
    };
  }

  try {
    const { stdout } = await execAsync('git status --short --branch', {
      cwd: session.currentProject.path,
    });
    const output = stdout.trim() || 'Working tree clean';
    return {
      handled: true,
      responses: [`📊 ${session.currentProject.name}\n\n\`\`\`\n${output}\n\`\`\``],
    };
  } catch (_error) {
    return { handled: true, responses: ['Failed to get git status.'] };
  }
}

export async function handleGitDiff(session: Session): Promise<CommandResult> {
  if (!session.currentProject) {
    return {
      handled: true,
      responses: ['No project selected.\n\nUse /project <name> to select one.'],
    };
  }

  try {
    const { stdout } = await execAsync('git diff --stat', {
      cwd: session.currentProject.path,
    });

    if (!stdout.trim()) {
      return { handled: true, responses: ['No changes to show.'] };
    }

    const lines = stdout.split('\n');
    const truncated =
      lines.length > 20
        ? [...lines.slice(0, 20), `... and ${lines.length - 20} more lines`].join('\n')
        : stdout;

    return {
      handled: true,
      responses: [`📝 Changes in ${session.currentProject.name}\n\n\`\`\`\n${truncated}\n\`\`\``],
    };
  } catch (_error) {
    return { handled: true, responses: ['Failed to get diff.'] };
  }
}

export async function handleGitLog(
  countArg: string,
  session: Session
): Promise<CommandResult> {
  if (!session.currentProject) {
    return {
      handled: true,
      responses: ['No project selected.\n\nUse /project <name> to select one.'],
    };
  }

  const count = parseInt(countArg) || 5;
  const safeCount = Math.min(Math.max(count, 1), 20);

  try {
    const { stdout } = await execAsync(`git log --oneline -n ${safeCount}`, {
      cwd: session.currentProject.path,
    });

    if (!stdout.trim()) {
      return { handled: true, responses: ['No commits found.'] };
    }

    return {
      handled: true,
      responses: [
        `📜 Recent commits (${session.currentProject.name})\n\n\`\`\`\n${stdout.trim()}\n\`\`\``,
      ],
    };
  } catch (_error) {
    return { handled: true, responses: ['Failed to get git log.'] };
  }
}
