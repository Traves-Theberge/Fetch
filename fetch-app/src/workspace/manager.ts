/**
 * @fileoverview Workspace management
 *
 * The WorkspaceManager handles workspace discovery, selection, and status.
 * Workspaces are project directories mounted into the Kennel container.
 *
 * @module workspace/manager
 * @see {@link Workspace} - Workspace entity
 * @see {@link dockerExec} - Container command execution
 *
 * ## Overview
 *
 * The WorkspaceManager:
 * - Lists available workspaces
 * - Tracks the active workspace
 * - Detects project types (node, python, rust, go)
 * - Gets git status for repositories
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { pipeline } from '../config/pipeline.js';
import { dockerExec, getWorkspacePath, isKennelRunning } from '../utils/docker.js';
import type {
  Workspace,
  WorkspaceId,
  WorkspaceSummary,
  WorkspaceListResult,
  ProjectType,
  GitStatus,
  WorkspaceEvent,
  WorkspaceEventType,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Base workspace path in container
 */
const WORKSPACE_BASE = '/workspace';

/**
 * Files that indicate project type
 */
const PROJECT_INDICATORS: Record<ProjectType, string[]> = {
  typescript: ['tsconfig.json'],
  node: ['package.json'],
  python: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile', 'setup.cfg'],
  rust: ['Cargo.toml'],
  go: ['go.mod'],
  java: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  ruby: ['Gemfile'],
  php: ['composer.json'],
  dotnet: ['*.csproj', '*.sln', '*.fsproj'],
  unknown: [],
};

// ============================================================================
// WorkspaceManager Class
// ============================================================================

/**
 * Workspace manager
 *
 * Manages workspace discovery, selection, and status.
 *
 * @example
 * ```typescript
 * const manager = new WorkspaceManager();
 *
 * // List workspaces
 * const result = await manager.listWorkspaces();
 * console.log(result.workspaces);
 *
 * // Select a workspace
 * await manager.selectWorkspace('my-project');
 *
 * // Get workspace status
 * const status = await manager.getWorkspaceStatus();
 * ```
 */
export class WorkspaceManager extends EventEmitter {
  /** Currently active workspace ID */
  private activeWorkspaceId: WorkspaceId | null = null;

  /** Cached workspace data */
  private workspaceCache: Map<WorkspaceId, Workspace> = new Map();

  /** Cache TTL in milliseconds */
  private cacheTTL = pipeline.workspaceCacheTtl;

  /** Last cache refresh time */
  private lastCacheRefresh = 0;

  // ==========================================================================
  // Workspace Listing
  // ==========================================================================

  /**
   * List all available workspaces
   *
   * @param forceRefresh - Force cache refresh
   * @returns Workspace list result
   */
  async listWorkspaces(forceRefresh = false): Promise<WorkspaceListResult> {
    // Check if Kennel is running
    if (!(await isKennelRunning())) {
      logger.warn('Kennel container not running, returning empty workspace list');
      return {
        workspaces: [],
        count: 0,
      };
    }

    // Refresh cache if needed
    if (forceRefresh || this.shouldRefreshCache()) {
      await this.refreshWorkspaceCache();
    }

    // Build summaries
    const workspaces: WorkspaceSummary[] = Array.from(this.workspaceCache.values()).map(
      (ws) => ({
        id: ws.id,
        name: ws.name,
        projectType: ws.projectType,
        isActive: ws.id === this.activeWorkspaceId,
        branch: ws.git?.branch,
        dirty: ws.git?.dirty,
      })
    );

    return {
      workspaces,
      activeWorkspace: this.activeWorkspaceId ?? undefined,
      count: workspaces.length,
    };
  }

  // ==========================================================================
  // Workspace Selection
  // ==========================================================================

  /**
   * Select a workspace as active
   *
   * @param workspaceId - Workspace to select
   * @returns Selected workspace
   * @throws Error if workspace not found
   */
  async selectWorkspace(workspaceId: WorkspaceId): Promise<Workspace> {
    // Validate workspace exists
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Update active workspace
    const previousActive = this.activeWorkspaceId;
    this.activeWorkspaceId = workspaceId;

    // Update isActive flags in cache
    if (previousActive && this.workspaceCache.has(previousActive)) {
      const prev = this.workspaceCache.get(previousActive)!;
      this.workspaceCache.set(previousActive, { ...prev, isActive: false });
    }

    workspace.isActive = true;
    workspace.lastAccessedAt = new Date().toISOString();
    this.workspaceCache.set(workspaceId, workspace);

    // Emit event
    this.emitEvent('workspace:selected', workspaceId);

    logger.info(`Workspace selected: ${workspaceId}`);

    return workspace;
  }

  /**
   * Get the currently active workspace
   *
   * @returns Active workspace or null
   */
  async getActiveWorkspace(): Promise<Workspace | null> {
    if (!this.activeWorkspaceId) {
      return null;
    }
    return this.getWorkspace(this.activeWorkspaceId);
  }

  /**
   * Get the active workspace ID
   *
   * @returns Active workspace ID or null
   */
  getActiveWorkspaceId(): WorkspaceId | null {
    return this.activeWorkspaceId;
  }

  // ==========================================================================
  // Workspace Status
  // ==========================================================================

  /**
   * Get a workspace by ID
   *
   * @param workspaceId - Workspace ID
   * @returns Workspace or null if not found
   */
  async getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null> {
    // Check cache first
    if (this.workspaceCache.has(workspaceId) && !this.shouldRefreshCache()) {
      return this.workspaceCache.get(workspaceId) ?? null;
    }

    // Fetch fresh data
    const workspace = await this.fetchWorkspace(workspaceId);
    if (workspace) {
      workspace.isActive = workspace.id === this.activeWorkspaceId;
      this.workspaceCache.set(workspaceId, workspace);
    }

    return workspace;
  }

  /**
   * Get workspace status (detailed)
   *
   * @param workspaceId - Workspace ID (uses active if not specified)
   * @returns Workspace with fresh git status
   */
  async getWorkspaceStatus(workspaceId?: WorkspaceId): Promise<Workspace | null> {
    const id = workspaceId ?? this.activeWorkspaceId;
    if (!id) {
      return null;
    }

    // Always fetch fresh for status
    const workspace = await this.fetchWorkspace(id);
    if (workspace) {
      workspace.isActive = workspace.id === this.activeWorkspaceId;
      this.workspaceCache.set(id, workspace);
    }

    return workspace;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Check if cache should be refreshed
   */
  private shouldRefreshCache(): boolean {
    return Date.now() - this.lastCacheRefresh > this.cacheTTL;
  }

  /**
   * Refresh the workspace cache
   */
  private async refreshWorkspaceCache(): Promise<void> {
    try {
      // List directories in /workspace
      const result = await dockerExec('ls', ['-1', WORKSPACE_BASE]);
      if (result.exitCode !== 0) {
        logger.warn('Failed to list workspaces', { stderr: result.stderr });
        return;
      }

      const directories = result.stdout
        .split('\n')
        .map((d) => d.trim())
        .filter((d) => d && !d.startsWith('.'));

      // Fetch workspace info for each
      for (const dir of directories) {
        try {
          const workspace = await this.fetchWorkspace(dir);
          if (workspace) {
            workspace.isActive = workspace.id === this.activeWorkspaceId;
            this.workspaceCache.set(dir, workspace);
          }
        } catch (err) {
          logger.debug(`Failed to fetch workspace: ${dir}`, { error: err });
        }
      }

      this.lastCacheRefresh = Date.now();
      logger.debug(`Refreshed workspace cache: ${this.workspaceCache.size} workspaces`);
    } catch (err) {
      logger.warn('Failed to refresh workspace cache', { error: err });
    }
  }

  /**
   * Fetch workspace data from container
   */
  private async fetchWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null> {
    const path = getWorkspacePath(workspaceId);

    // Check if directory exists
    const existsResult = await dockerExec('test', ['-d', path]);
    if (existsResult.exitCode !== 0) {
      return null;
    }

    // Detect project type
    const projectType = await this.detectProjectType(path);

    // Get git status if it's a git repo
    const git = await this.getGitStatus(path);

    // Try to get description from package.json or README
    const description = await this.getProjectDescription(path, projectType);

    const workspace: Workspace = {
      id: workspaceId,
      name: workspaceId,
      path,
      projectType,
      git: git ?? undefined,
      isActive: false,
      description,
    };

    return workspace;
  }

  /**
   * Detect project type from files
   */
  private async detectProjectType(path: string): Promise<ProjectType> {
    for (const [type, files] of Object.entries(PROJECT_INDICATORS)) {
      if (type === 'unknown') continue;

      for (const file of files) {
        if (file.includes('*')) {
          // Glob pattern — use ls with the pattern via sh -c
          const result = await dockerExec('sh', ['-c', `ls ${path}/${file} 2>/dev/null | head -1`]);
          if (result.exitCode === 0 && result.stdout.trim()) {
            return type as ProjectType;
          }
        } else {
          const result = await dockerExec('test', ['-f', `${path}/${file}`]);
          if (result.exitCode === 0) {
            return type as ProjectType;
          }
        }
      }
    }

    return 'unknown';
  }

  /**
   * Get git status for a repository
   */
  private async getGitStatus(path: string): Promise<GitStatus | null> {
    // Check if it's a git repo
    const gitCheck = await dockerExec('test', ['-d', `${path}/.git`]);
    if (gitCheck.exitCode !== 0) {
      return null;
    }

    try {
      // Get branch name
      const branchResult = await dockerExec(
        'git',
        ['-C', path, 'branch', '--show-current'],
        { timeoutMs: pipeline.gitCommandTimeout }
      );
      const branch = branchResult.stdout.trim() || 'HEAD';

      // Get status (porcelain for parsing)
      const statusResult = await dockerExec(
        'git',
        ['-C', path, 'status', '--porcelain'],
        { timeoutMs: pipeline.gitCommandTimeout }
      );

      const modifiedFiles: string[] = [];
      const stagedFiles: string[] = [];
      const untrackedFiles: string[] = [];

      for (const line of statusResult.stdout.split('\n')) {
        if (!line.trim()) continue;

        const status = line.substring(0, 2);
        const file = line.substring(3).trim();

        if (status[0] === '?' && status[1] === '?') {
          untrackedFiles.push(file);
        } else if (status[0] !== ' ' && status[0] !== '?') {
          stagedFiles.push(file);
        } else if (status[1] !== ' ' && status[1] !== '?') {
          modifiedFiles.push(file);
        }
      }

      // Get ahead/behind counts
      let ahead = 0;
      let behind = 0;

      const aheadBehindResult = await dockerExec(
        'git',
        ['-C', path, 'rev-list', '--left-right', '--count', `@{upstream}...HEAD`],
        { timeoutMs: pipeline.gitCommandTimeout }
      );

      if (aheadBehindResult.exitCode === 0) {
        const parts = aheadBehindResult.stdout.trim().split(/\s+/);
        if (parts.length === 2) {
          behind = parseInt(parts[0], 10) || 0;
          ahead = parseInt(parts[1], 10) || 0;
        }
      }

      // Get last commit info
      const commitResult = await dockerExec(
        'git',
        ['-C', path, 'log', '-1', '--format=%h|%s'],
        { timeoutMs: pipeline.gitCommandTimeout }
      );

      let lastCommit: string | undefined;
      let lastCommitMessage: string | undefined;

      if (commitResult.exitCode === 0 && commitResult.stdout.trim()) {
        const [hash, ...messageParts] = commitResult.stdout.trim().split('|');
        lastCommit = hash;
        lastCommitMessage = messageParts.join('|').substring(0, 100);
      }

      // Get remote URL
      const remoteResult = await dockerExec(
        'git',
        ['-C', path, 'remote', 'get-url', 'origin'],
        { timeoutMs: pipeline.gitCommandTimeout }
      );
      const remoteUrl = remoteResult.exitCode === 0 ? remoteResult.stdout.trim() : undefined;

      return {
        branch,
        dirty: modifiedFiles.length > 0 || stagedFiles.length > 0 || untrackedFiles.length > 0,
        ahead,
        behind,
        modifiedFiles,
        stagedFiles,
        untrackedFiles,
        remoteUrl,
        lastCommit,
        lastCommitMessage,
      };
    } catch (err) {
      logger.debug('Failed to get git status', { path, error: err });
      return null;
    }
  }

  /**
   * Get project description
   */
  private async getProjectDescription(
    path: string,
    projectType: ProjectType
  ): Promise<string | undefined> {
    if (projectType === 'node') {
      // Try package.json
      const result = await dockerExec('cat', [`${path}/package.json`], {
        timeoutMs: 2000,
      });

      if (result.exitCode === 0) {
        try {
          const pkg = JSON.parse(result.stdout);
          return pkg.description;
        } catch {
          // Ignore parse errors
        }
      }
    }

    return undefined;
  }

  /**
   * Emit a workspace event
   */
  private emitEvent(type: WorkspaceEventType, workspaceId: WorkspaceId, data?: unknown): void {
    const event: WorkspaceEvent = {
      type,
      workspaceId,
      timestamp: new Date().toISOString(),
      data,
    };
    this.emit(type, event);
  }

  // ==========================================================================
  // Workspace Creation
  // ==========================================================================

  /**
   * Create a new workspace
   *
   * @param options - Workspace creation options
   * @returns Created workspace
   * @throws Error if workspace already exists or creation fails
   */
  async createWorkspace(options: {
    name: string;
    template?: string;
    description?: string;
    initGit?: boolean;
  }): Promise<Workspace> {
    const { name, template = 'empty', description, initGit = true } = options;

    // Validate workspace name to prevent shell injection
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
      throw new Error('Invalid workspace name: must contain only alphanumeric characters, dots, hyphens, and underscores');
    }

    const path = getWorkspacePath(name);

    // Check if workspace already exists
    const existsResult = await dockerExec('test', ['-d', path]);
    if (existsResult.exitCode === 0) {
      throw new Error(`Workspace already exists: ${name}`);
    }

    // Create directory
    const mkdirResult = await dockerExec('mkdir', ['-p', path]);
    if (mkdirResult.exitCode !== 0) {
      throw new Error(`Failed to create workspace directory: ${mkdirResult.stderr}`);
    }

    // Emit scaffolding event
    this.emitEvent('workspace:scaffolding', name, { template, status: 'starting' });

    // Apply template
    await this.applyTemplate(path, template, name, description);

    // Emit progress event
    this.emitEvent('workspace:scaffolding', name, { template, status: 'scaffolded' });

    // Initialize git if requested
    if (initGit) {
      await this.initializeGit(path);
    }

    // Fetch the workspace data
    const workspace = await this.fetchWorkspace(name);
    if (!workspace) {
      throw new Error('Failed to fetch created workspace');
    }

    // Cache and emit event
    this.workspaceCache.set(name, workspace);
    this.emitEvent('workspace:created', name, { template });

    logger.info(`Created workspace: ${name}`, { template, initGit });

    return workspace;
  }

  /**
   * Apply a project template
   */
  private async applyTemplate(
    path: string,
    template: string,
    name: string,
    description?: string
  ): Promise<void> {
    switch (template) {
      case 'node':
        await this.createNodeProject(path, name, description);
        break;
      case 'python':
        await this.createPythonProject(path, name, description);
        break;
      case 'rust':
        await this.createRustProject(path, name, description);
        break;
      case 'go':
        await this.createGoProject(path, name);
        break;
      case 'react':
        await this.createReactProject(path, name);
        break;
      case 'next':
        await this.createNextProject(path, name);
        break;
      case 'empty':
      default:
        // Just create a README
        await this.createReadme(path, name, description);
        break;
    }
  }

  private async createNodeProject(path: string, name: string, description?: string): Promise<void> {
    // Scaffold using npm init
    await dockerExec('npm', ['init', '-y'], { cwd: path });
    
    // Create a basic index.js (name already validated as safe alphanumeric)
    await dockerExec('sh', ['-c', `cat > ${path}/index.js << 'HEREDOC'\nconsole.log("Hello from ${name}!");\nHEREDOC`]);
    
    // Update package.json description if provided
    if (description) {
      const safeDesc = description.replace(/[\\/"']/g, '');
      await dockerExec('sh', ['-c', `sed -i 's/"description": ""/"description": "${safeDesc}"/' ${path}/package.json`]);
    }

    await this.createReadme(path, name, description);
    await this.createGitignore(path, 'node');
  }

  private async createPythonProject(path: string, name: string, description?: string): Promise<void> {
    // Create basic python structure (name already validated as safe alphanumeric)
    await dockerExec('sh', ['-c', `cat > ${path}/main.py << 'HEREDOC'\n# ${name}\n\nprint("Hello from ${name}!")\nHEREDOC`]);
    await dockerExec('sh', ['-c', `echo '' > ${path}/requirements.txt`]);
    
    // Create venv if python3 is available
    const venvResult = await dockerExec('python3', ['-m', 'venv', 'venv'], { cwd: path, timeoutMs: 60000 });
    if (venvResult.exitCode !== 0) {
      logger.warn(`Failed to create python venv: ${venvResult.stderr}`);
    }

    await this.createReadme(path, name, description);
    await this.createGitignore(path, 'python');
  }

  private async createRustProject(path: string, name: string, description?: string): Promise<void> {
    // Use cargo init if available
    const cargoResult = await dockerExec('cargo', ['init', '--name', name], { cwd: path, timeoutMs: 30000 });
    
    if (cargoResult.exitCode !== 0) {
      logger.warn(`Cargo init failed, creating manual Rust structure: ${cargoResult.stderr}`);
      // Manual creation fallback (name already validated as safe alphanumeric)
      await dockerExec('sh', ['-c', `cat > ${path}/Cargo.toml << 'HEREDOC'\n[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nHEREDOC`]);
      await dockerExec('mkdir', ['-p', `${path}/src`]);
      await dockerExec('sh', ['-c', `cat > ${path}/src/main.rs << 'HEREDOC'\nfn main() { println!("Hello from ${name}!"); }\nHEREDOC`]);
    }

    await this.createReadme(path, name, description);
  }

  private async createGoProject(path: string, name: string): Promise<void> {
    // Use go mod init
    const goResult = await dockerExec('go', ['mod', 'init', name], { cwd: path, timeoutMs: 30000 });
    
    if (goResult.exitCode !== 0) {
      logger.warn(`Go mod init failed, creating manual Go structure: ${goResult.stderr}`);
      await dockerExec('sh', ['-c', `cat > ${path}/go.mod << 'HEREDOC'\nmodule ${name}\n\ngo 1.21\nHEREDOC`]);
    }

    await dockerExec('sh', ['-c', `cat > ${path}/main.go << 'HEREDOC'\npackage main\n\nimport "fmt"\n\nfunc main() { fmt.Println("Hello from ${name}!") }\nHEREDOC`]);
    await this.createReadme(path, name);
    await this.createGitignore(path, 'go');
  }

  private async createReactProject(path: string, name: string): Promise<void> {
    // Scaffold using Vite (non-interactive)
    // We clean the directory first because vite might complain
    await dockerExec('rm', ['-rf', '*'], { cwd: path });
    
    const viteResult = await dockerExec('npm', ['create', 'vite@latest', '.', '--', '--template', 'react'], { 
      cwd: path, 
      timeoutMs: 120000 
    });

    if (viteResult.exitCode !== 0) {
      logger.error(`Vite scaffold failed: ${viteResult.stderr}`);
      // Fallback to manual if needed (omitted for brevity, assume tool exists in Kennel)
    }

    await this.createReadme(path, name, 'React app created with Fetch');
    await this.createGitignore(path, 'node');
  }

  private async createNextProject(path: string, name: string): Promise<void> {
    // Scaffold using create-next-app (non-interactive)
    // We clean the directory first because create-next-app wants it empty
    await dockerExec('rm', ['-rf', '*'], { cwd: path });

    const nextResult = await dockerExec('npx', [
      'create-next-app@latest', 
      '.', 
      '--ts', 
      '--no-tailwind', 
      '--no-eslint', 
      '--app', 
      '--use-npm', 
      '--no-src-dir', 
      '--import-alias', '@/*'
    ], { 
      cwd: path, 
      timeoutMs: 300000 
    });

    if (nextResult.exitCode !== 0) {
      logger.error(`Next.js scaffold failed: ${nextResult.stderr}`);
    }

    await this.createReadme(path, name, 'Next.js app created with Fetch');
    await this.createGitignore(path, 'node');
  }

  private async createReadme(path: string, name: string, description?: string): Promise<void> {
    const content = `# ${name}\\n\\n${description ?? 'A new project created with Fetch.'}`;
    await dockerExec('sh', ['-c', `echo '${content}' > ${path}/README.md`]);
  }

  private async createGitignore(path: string, type: string): Promise<void> {
    let content = '';
    switch (type) {
      case 'node':
        content = 'node_modules/\\n.env\\n.env.local\\ndist/\\n.next/\\n*.log';
        break;
      case 'python':
        content = '__pycache__/\\n*.py[cod]\\n.env\\nvenv/\\n.venv/\\n*.egg-info/';
        break;
      case 'go':
        content = '*.exe\\n*.dll\\n*.so\\n*.dylib\\n*.test\\n*.out\\nvendor/';
        break;
      default:
        content = '.env\\n*.log\\n.DS_Store';
    }
    await dockerExec('sh', ['-c', `echo '${content}' > ${path}/.gitignore`]);
  }

  private async initializeGit(path: string): Promise<void> {
    await dockerExec('git', ['-C', path, 'init']);
    await dockerExec('git', ['-C', path, 'add', '.']);
    await dockerExec('git', ['-C', path, 'commit', '-m', 'Initial commit']);
  }

  // ==========================================================================
  // Workspace Deletion
  // ==========================================================================

  /**
   * Delete a workspace
   *
   * @param workspaceId - Workspace to delete
   * @throws Error if workspace not found or is active
   */
  async deleteWorkspace(workspaceId: WorkspaceId): Promise<void> {
    // Check if workspace exists
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Check if it's the active workspace
    if (workspaceId === this.activeWorkspaceId) {
      throw new Error('Cannot delete the active workspace. Select a different workspace first.');
    }

    const path = getWorkspacePath(workspaceId);

    // Delete the directory
    const result = await dockerExec('rm', ['-rf', path]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to delete workspace: ${result.stderr}`);
    }

    // Remove from cache
    this.workspaceCache.delete(workspaceId);

    // Emit event
    this.emitEvent('workspace:deleted', workspaceId);

    logger.info(`Deleted workspace: ${workspaceId}`);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global workspace manager instance
 */
export const workspaceManager = new WorkspaceManager();
