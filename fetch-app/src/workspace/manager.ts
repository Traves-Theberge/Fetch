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
    const { template = 'empty', description, initGit = true } = options;

    // Normalize name to lowercase (npm naming restriction)
    const name = options.name.toLowerCase();

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

      // Create GitHub repo and push (non-blocking — workspace creation succeeds even if this fails)
      const repoUrl = await this.createGitHubRepo(path, name, description);
      if (repoUrl) {
        this.emitEvent('workspace:scaffolding', name, { template, status: 'github-synced', repoUrl });
      }
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
  // GitHub Sync
  // ==========================================================================

  /**
   * Check if GitHub integration is available (GH_TOKEN set in kennel)
   */
  async isGitHubAvailable(): Promise<boolean> {
    // Basic env check
    const envResult = await dockerExec('sh', ['-c', 'test -n "$GH_TOKEN"']);
    if (envResult.exitCode !== 0) {
      logger.debug('GitHub unavailable: GH_TOKEN not set');
      return false;
    }

    // Connectivity test (similar to github-mcp-server "get_me")
    // gh auth status is too strict and fails on minor sync issues; 
    // gh api user is a direct proof of connectivity.
    const authResult = await dockerExec('gh', ['api', 'user', '--jq', '.login'], {
      timeoutMs: 10000,
    });

    if (authResult.exitCode !== 0) {
      logger.warn('GitHub authentication check failed', { error: authResult.stderr });
      return false;
    }

    return true;
  }

  /**
   * Create a private GitHub repository and push the initial commit
   *
   * Uses `gh repo create` to create a private repo under the authenticated
   * user's account, then pushes the local workspace to it.
   *
   * @param workspacePath - Absolute path to workspace in kennel
   * @param name - Workspace/repo name
   * @param description - Optional repo description
   * @returns The GitHub repo URL, or undefined if sync failed
   */
  async createGitHubRepo(
    workspacePath: string,
    name: string,
    description?: string
  ): Promise<string | undefined> {
    if (!(await this.isGitHubAvailable())) {
      logger.warn('GitHub not available — skipping repo creation');
      return undefined;
    }

    try {
      // Build gh repo create command
      // --private: default to private repos
      // --source=.: use current directory as source
      // --push: push the initial commit
      const args = [
        'repo', 'create', name,
        '--private',
        `--source=${workspacePath}`,
        '--push',
      ];

      if (description) {
        args.push('--description', description);
      }

      this.emitEvent('workspace:scaffolding', name, { status: 'github-creating' });

      const result = await dockerExec('gh', args, {
        cwd: workspacePath,
        timeoutMs: 30000,
      });

      if (result.exitCode !== 0) {
        // Repo might already exist — try to add remote and push instead
        if (result.stderr.includes('already exists')) {
          logger.info(`GitHub repo ${name} already exists, linking...`);
          return await this.linkExistingRepo(workspacePath, name);
        }
        logger.error(`Failed to create GitHub repo: ${result.stderr}`);
        return undefined;
      }

      // Extract repo URL from output
      const urlMatch = result.stdout.match(/https:\/\/github\.com\/[^\n\s]+/);
      const url = urlMatch ? urlMatch[0] : result.stdout.trim().split('\n').pop()?.trim();

      this.emitEvent('workspace:scaffolding', name, { status: 'github-created', url });
      logger.info(`Created GitHub repo: ${url}`);

      return url;
    } catch (err) {
      logger.error('GitHub repo creation failed', { error: err });
      return undefined;
    }
  }

  /**
   * Link a workspace to an existing GitHub repo
   */
  private async linkExistingRepo(
    workspacePath: string,
    name: string
  ): Promise<string | undefined> {
    // Get the authenticated user's GitHub username
    const userResult = await dockerExec('gh', ['api', 'user', '--jq', '.login'], {
      timeoutMs: 10000,
    });

    if (userResult.exitCode !== 0) return undefined;

    const username = userResult.stdout.trim();
    const repoUrl = `https://github.com/${username}/${name}`;

    // Check if remote already exists
    const remoteCheck = await dockerExec('git', ['-C', workspacePath, 'remote', 'get-url', 'origin']);

    if (remoteCheck.exitCode !== 0) {
      // No remote — add it
      await dockerExec('git', ['-C', workspacePath, 'remote', 'add', 'origin', repoUrl]);
    }

    // Push
    const pushResult = await dockerExec('git', ['-C', workspacePath, 'push', '-u', 'origin', 'main'], {
      timeoutMs: 30000,
    });

    if (pushResult.exitCode !== 0) {
      logger.warn(`Push to ${repoUrl} failed: ${pushResult.stderr}`);
      return undefined;
    }

    return repoUrl;
  }

  /**
   * Sync a workspace to GitHub
   *
   * Stages all changes, commits with the provided message (or auto-generates one),
   * and pushes to the remote. If no remote exists, creates a GitHub repo first.
   *
   * @param workspaceId - Workspace to sync
   * @param message - Optional commit message (auto-generated if not provided)
   * @returns Sync result with commit info and remote URL
   */
  async syncWorkspace(
    workspaceId: WorkspaceId,
    message?: string
  ): Promise<{
    success: boolean;
    commitHash?: string;
    commitMessage: string;
    remoteUrl?: string;
    filesChanged: number;
    pushed: boolean;
    repoCreated: boolean;
    error?: string;
  }> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      return {
        success: false,
        commitMessage: '',
        filesChanged: 0,
        pushed: false,
        repoCreated: false,
        error: `Workspace not found: ${workspaceId}`,
      };
    }

    const wsPath = getWorkspacePath(workspaceId);

    // Check if it's a git repo
    const gitCheck = await dockerExec('test', ['-d', `${wsPath}/.git`]);
    if (gitCheck.exitCode !== 0) {
      // Initialize git if not already
      await this.initializeGit(wsPath);
    }

    // Stage all changes
    await dockerExec('git', ['-C', wsPath, 'add', '-A']);

    // Check if there are changes to commit
    const statusResult = await dockerExec('git', ['-C', wsPath, 'status', '--porcelain']);
    const changedFiles = statusResult.stdout.trim().split('\n').filter(l => l.trim()).length;

    let commitHash: string | undefined;
    let commitMessage = message || '';
    let repoCreated = false;

    if (changedFiles > 0) {
      // Auto-generate commit message if not provided
      if (!commitMessage) {
        commitMessage = await this.generateCommitMessage(wsPath, changedFiles);
      }

      // Commit
      const commitResult = await dockerExec(
        'git', ['-C', wsPath, 'commit', '-m', commitMessage],
        { timeoutMs: 10000 }
      );

      if (commitResult.exitCode !== 0) {
        return {
          success: false,
          commitMessage,
          filesChanged: changedFiles,
          pushed: false,
          repoCreated: false,
          error: `Commit failed: ${commitResult.stderr}`,
        };
      }

      // Get the commit hash
      const hashResult = await dockerExec('git', ['-C', wsPath, 'log', '-1', '--format=%h']);
      commitHash = hashResult.stdout.trim();
    } else {
      commitMessage = 'No changes to commit';
    }

    // Check if remote exists
    const remoteResult = await dockerExec('git', ['-C', wsPath, 'remote', 'get-url', 'origin']);
    let remoteUrl = remoteResult.exitCode === 0 ? remoteResult.stdout.trim() : undefined;

    // If no remote, create GitHub repo
    if (!remoteUrl && await this.isGitHubAvailable()) {
      remoteUrl = await this.createGitHubRepo(wsPath, workspaceId, workspace.description);
      if (remoteUrl) {
        repoCreated = true;
        // Repo creation includes the push, so we're done
        this.emitEvent('workspace:synced', workspaceId, { remoteUrl, commitHash });
        return {
          success: true,
          commitHash,
          commitMessage,
          remoteUrl,
          filesChanged: changedFiles,
          pushed: true,
          repoCreated: true,
        };
      }
    }

    // Push if remote exists
    let pushed = false;
    if (remoteUrl) {
      // Check if we actually have anything to push (local commits vs remote)
      const unpushedResult = await dockerExec('git', ['-C', wsPath, 'rev-list', '--count', 'origin/main..main']);
      const hasUnpushed = unpushedResult.exitCode === 0 && parseInt(unpushedResult.stdout.trim()) > 0;

      if (hasUnpushed || changedFiles > 0 || commitHash) {
        logger.info(`Pushing changes to GitHub for workspace ${workspaceId}...`);
        const pushResult = await dockerExec(
          'git', ['-C', wsPath, 'push', '-u', 'origin', 'main'],
          { timeoutMs: 30000 }
        );
        pushed = pushResult.exitCode === 0;

        if (!pushed) {
          logger.warn(`Push failed for ${workspaceId}: ${pushResult.stderr}`);
        }
      } else {
        logger.info(`Workspace ${workspaceId} is already up to date with remote.`);
      }
    }

    if (commitHash || pushed) {
      this.emitEvent('workspace:synced', workspaceId, { remoteUrl, commitHash });
    }

    return {
      success: true,
      commitHash,
      commitMessage,
      remoteUrl,
      filesChanged: changedFiles,
      pushed,
      repoCreated,
    };
  }

  /**
   * Publish a workspace to GitHub as a new repository
   *
   * Unlike syncWorkspace, this explicitly creates a new GitHub repo
   * from an existing local project that doesn't have a remote yet.
   * All existing commits are pushed to the new remote.
   *
   * @param workspaceId - Workspace to publish
   * @param description - Optional description for the GitHub repo
   * @param isPublic - Whether to create a public repo (default: private)
   * @returns GitHub repo URL if successful, undefined if failed
   */
  async publishToGitHub(
    workspaceId: WorkspaceId,
    description?: string,
    isPublic = false
  ): Promise<string | undefined> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      logger.error(`Workspace not found: ${workspaceId}`);
      return undefined;
    }

    const wsPath = getWorkspacePath(workspaceId);

    // Ensure git repo exists
    const gitCheck = await dockerExec('test', ['-d', `${wsPath}/.git`]);
    if (gitCheck.exitCode !== 0) {
      // Initialize git if not already
      await this.initializeGit(wsPath);
      // Make initial commit if no commits
      await dockerExec('git', ['-C', wsPath, 'add', '-A']);
      await dockerExec('git', ['-C', wsPath, 'commit', '-m', 'Initial commit'], {
        timeoutMs: 10000,
      });
    }

    // Check if remote already exists
    const remoteResult = await dockerExec('git', ['-C', wsPath, 'remote', 'get-url', 'origin']);
    if (remoteResult.exitCode === 0 && remoteResult.stdout.trim()) {
      logger.warn(`Workspace ${workspaceId} already has remote: ${remoteResult.stdout.trim()}`);
      return remoteResult.stdout.trim();
    }

    // Create GitHub repo
    if (!(await this.isGitHubAvailable())) {
      logger.warn('GitHub integration not available or authentication failed');
      return undefined;
    }

    // Double check if repo already exists on GitHub side before creating
    const checkResult = await dockerExec('gh', ['repo', 'view', workspaceId], {
      cwd: wsPath,
    });

    if (checkResult.exitCode === 0) {
      logger.info(`GitHub repo ${workspaceId} already exists, linking...`);
      return await this.linkExistingRepo(wsPath, workspaceId);
    }

    const visibility = isPublic ? '--public' : '--private';
    const args = [
      'repo', 'create', workspaceId,
      visibility,
      `--source=${wsPath}`,
      '--push',
    ];

    if (description) {
      args.push('--description', description);
    }

    this.emitEvent('workspace:scaffolding', workspaceId, { status: 'github-creating' });

    const result = await dockerExec('gh', args, {
      cwd: wsPath,
      timeoutMs: 60000,
    });

    if (result.exitCode !== 0) {
      logger.error(`Failed to create GitHub repo: ${result.stderr}`);
      this.emitEvent('workspace:scaffolding', workspaceId, { status: 'github-failed', error: result.stderr });
      return undefined;
    }

    // Extract repo URL from output
    const urlMatch = result.stdout.match(/https:\/\/github\.com\/[^\n\s]+/);
    const repoUrl = urlMatch ? urlMatch[0] : result.stdout.trim().split('\n').pop()?.trim();

    if (repoUrl) {
      this.emitEvent('workspace:scaffolding', workspaceId, { status: 'github-created', repoUrl });
      this.emitEvent('workspace:synced', workspaceId, { remoteUrl: repoUrl });
      logger.info(`Published to GitHub: ${repoUrl}`);
    }

    return repoUrl;
  }

  /**
   * Generate a descriptive commit message from the staged changes
   */
  private async generateCommitMessage(wsPath: string, fileCount: number): Promise<string> {
    // Get a summary of what changed
    const diffResult = await dockerExec(
      'git', ['-C', wsPath, 'diff', '--cached', '--stat'],
      { timeoutMs: 5000 }
    );

    if (diffResult.exitCode === 0 && diffResult.stdout.trim()) {
      const lines = diffResult.stdout.trim().split('\n');
      const summary = lines[lines.length - 1]?.trim() || '';
      // e.g. "3 files changed, 45 insertions(+), 12 deletions(-)"
      return `Update: ${summary}`;
    }

    return `Update ${fileCount} file${fileCount !== 1 ? 's' : ''}`;
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

  // ============================================================================
  // GitHub: Pull Requests
  // ============================================================================

  /**
   * Create a pull request on GitHub.
   *
   * @param wsPath - Workspace path in container
   * @param title - PR title
   * @param body - Optional PR body
   * @param base - Base branch (default: main)
   * @param draft - Create as draft (default: true)
   */
  async createPullRequest(
    wsPath: string,
    title: string,
    body?: string,
    base = 'main',
    draft = true
  ): Promise<{ url: string; number: number; draft: boolean }> {
    if (!await this.isGitHubAvailable()) {
      throw new Error('GitHub integration is not available. Ensure GH_TOKEN is set.');
    }

    const args = ['pr', 'create', '--title', title, '--base', base];
    if (body) args.push('--body', body);
    if (draft) args.push('--draft');

    const result = await dockerExec('gh', args, { cwd: wsPath, timeoutMs: 30000 });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to create PR: ${result.stderr || result.stdout}`);
    }

    // gh pr create outputs the URL on success
    const url = result.stdout.trim();

    // Extract PR number from URL
    const prMatch = url.match(/\/pull\/(\d+)/);
    const prNumber = prMatch ? parseInt(prMatch[1], 10) : 0;

    return { url, number: prNumber, draft };
  }

  /**
   * List pull requests for the current repo.
   */
  async listPullRequests(
    wsPath: string,
    state = 'open',
    repo?: string,
    limit = 10
  ): Promise<Array<{ number: number; title: string; state: string; url: string; author: string }>> {
    if (!await this.isGitHubAvailable()) {
      throw new Error('GitHub integration is not available. Ensure GH_TOKEN is set.');
    }

    const args = ['pr', 'list', '--state', state, '--json', 'number,title,state,url,author', '--limit', limit.toString()];
    if (repo) {
      args.push('--repo', repo);
    }
    const result = await dockerExec('gh', args, { cwd: wsPath, timeoutMs: 15000 });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to list PRs: ${result.stderr || result.stdout}`);
    }

    try {
      return JSON.parse(result.stdout);
    } catch {
      return [];
    }
  }

  /**
   * View a specific pull request.
   */
  async viewPullRequest(
    wsPath: string,
    number: number,
    repo?: string
  ): Promise<any> {
    if (!await this.isGitHubAvailable()) {
      throw new Error('GitHub integration is not available. Ensure GH_TOKEN is set.');
    }

    const args = ['pr', 'view', number.toString(), '--json', 'number,title,body,state,url,author,createdAt,updatedAt,baseRefName,headRefName,isDraft,mergeable,commits,comments,reviews'];
    if (repo) {
      args.push('--repo', repo);
    }
    const result = await dockerExec('gh', args, { cwd: wsPath, timeoutMs: 15000 });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to view PR #${number}: ${result.stderr || result.stdout}`);
    }

    try {
      return JSON.parse(result.stdout);
    } catch {
      return { raw: result.stdout };
    }
  }

  // ============================================================================
  // GitHub: Issues
  // ============================================================================

  /**
   * Create a GitHub issue.
   */
  async createIssue(
    wsPath: string,
    title: string,
    body?: string,
    labels?: string[]
  ): Promise<{ url: string; number: number }> {
    if (!await this.isGitHubAvailable()) {
      throw new Error('GitHub integration is not available. Ensure GH_TOKEN is set.');
    }

    const args = ['issue', 'create', '--title', title];
    if (body) args.push('--body', body);
    if (labels && labels.length > 0) {
      args.push('--label', labels.join(','));
    }

    const result = await dockerExec('gh', args, { cwd: wsPath, timeoutMs: 15000 });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to create issue: ${result.stderr || result.stdout}`);
    }

    const url = result.stdout.trim();
    const issueMatch = url.match(/\/issues\/(\d+)/);
    const issueNumber = issueMatch ? parseInt(issueMatch[1], 10) : 0;

    return { url, number: issueNumber };
  }

  /**
   * List issues for the current repo.
   */
  async listIssues(
    wsPath: string,
    state = 'open',
    assignee?: string,
    labels?: string[]
  ): Promise<Array<{ number: number; title: string; state: string; labels: string[]; url: string }>> {
    if (!await this.isGitHubAvailable()) {
      throw new Error('GitHub integration is not available. Ensure GH_TOKEN is set.');
    }

    const args = ['issue', 'list', '--state', state, '--json', 'number,title,state,labels,url', '--limit', '10'];
    if (assignee) args.push('--assignee', assignee);
    if (labels && labels.length > 0) {
      args.push('--label', labels.join(','));
    }

    const result = await dockerExec('gh', args, { cwd: wsPath, timeoutMs: 15000 });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to list issues: ${result.stderr || result.stdout}`);
    }

    try {
      return JSON.parse(result.stdout);
    } catch {
      return [];
    }
  }

  // ============================================================================
  // GitHub: Branches
  // ============================================================================

  /**
   * Create a new git branch and optionally push it to GitHub.
   */
  async createBranch(
    wsPath: string,
    name: string,
    from?: string
  ): Promise<{ branch: string; pushed: boolean; from: string }> {
    // If a base branch is specified, check it out first
    if (from) {
      const checkoutBase = await dockerExec('git', ['-C', wsPath, 'checkout', from]);
      if (checkoutBase.exitCode !== 0) {
        throw new Error(`Failed to checkout base branch '${from}': ${checkoutBase.stderr}`);
      }
    }

    // Get the current branch name for the 'from' field
    const currentBranch = await dockerExec('git', ['-C', wsPath, 'branch', '--show-current']);
    const fromBranch = from || currentBranch.stdout.trim() || 'unknown';

    // Create and switch to new branch
    const createResult = await dockerExec('git', ['-C', wsPath, 'checkout', '-b', name]);
    if (createResult.exitCode !== 0) {
      throw new Error(`Failed to create branch '${name}': ${createResult.stderr}`);
    }

    // Try to push the branch to origin
    let pushed = false;
    if (await this.isGitHubAvailable()) {
      const pushResult = await dockerExec('git', ['-C', wsPath, 'push', '-u', 'origin', name], { timeoutMs: 15000 });
      pushed = pushResult.exitCode === 0;
    }

    return { branch: name, pushed, from: fromBranch };
  }

  // ============================================================================
  // GitHub: Actions / CI
  // ============================================================================

  /**
   * Get the status of recent GitHub Actions workflow runs.
   */
  async getActionStatus(
    wsPath: string
  ): Promise<Array<{ name: string; status: string; conclusion: string; url: string; createdAt: string }>> {
    if (!await this.isGitHubAvailable()) {
      throw new Error('GitHub integration is not available. Ensure GH_TOKEN is set.');
    }

    const args = ['run', 'list', '--json', 'name,status,conclusion,url,createdAt', '--limit', '5'];
    const result = await dockerExec('gh', args, { cwd: wsPath, timeoutMs: 15000 });

    if (result.exitCode !== 0) {
      // No runs or no Actions configured is not necessarily an error
      if (result.stderr.includes('no runs') || result.stderr.includes('not found')) {
        return [];
      }
      throw new Error(`Failed to get action status: ${result.stderr || result.stdout}`);
    }

    try {
      return JSON.parse(result.stdout);
    } catch {
      return [];
    }
  }

  // ============================================================================
  // GitHub: Search
  // ============================================================================

  /**
   * Search GitHub repositories.
   * This does not require a workspace context.
   */
  async searchRepos(
    query: string,
    limit = 5
  ): Promise<Array<{ name: string; url: string; description: string; stars: number }>> {
    if (!await this.isGitHubAvailable()) {
      throw new Error('GitHub integration is not available. Ensure GH_TOKEN is set.');
    }

    const args = ['search', 'repos', query, '--json', 'name,url,description,stargazersCount', '--limit', String(limit)];
    const result = await dockerExec('gh', args, { timeoutMs: 15000 });

    if (result.exitCode !== 0) {
      throw new Error(`Failed to search repos: ${result.stderr || result.stdout}`);
    }

    try {
      const parsed = JSON.parse(result.stdout);
      return parsed.map((r: Record<string, unknown>) => ({
        name: r.name || r.fullName,
        url: r.url,
        description: r.description || '',
        stars: r.stargazersCount || 0,
      }));
    } catch {
      return [];
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global workspace manager instance
 */
export const workspaceManager = new WorkspaceManager();
