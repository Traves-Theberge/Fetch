/**
 * @fileoverview Tests for workspace tools
 *
 * Workspace tools wrap the WorkspaceManager singleton. They validate inputs
 * with Zod schemas and delegate to manager methods. We mock the manager
 * to test tool handler logic in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock workspace manager (must be before handler imports) ─────────

const mockListWorkspaces = vi.fn();
const mockSelectWorkspace = vi.fn();
const mockGetWorkspaceStatus = vi.fn();
const mockCreateWorkspace = vi.fn();
const mockDeleteWorkspace = vi.fn();
const mockSyncWorkspace = vi.fn();
const mockGetWorkspace = vi.fn();
const mockGetActiveWorkspaceId = vi.fn();
const mockPublishToGitHub = vi.fn();

vi.mock('../../src/workspace/manager.js', () => ({
  workspaceManager: {
    listWorkspaces: (...args: unknown[]) => mockListWorkspaces(...args),
    selectWorkspace: (...args: unknown[]) => mockSelectWorkspace(...args),
    getWorkspaceStatus: (...args: unknown[]) => mockGetWorkspaceStatus(...args),
    createWorkspace: (...args: unknown[]) => mockCreateWorkspace(...args),
    deleteWorkspace: (...args: unknown[]) => mockDeleteWorkspace(...args),
    syncWorkspace: (...args: unknown[]) => mockSyncWorkspace(...args),
    getWorkspace: (...args: unknown[]) => mockGetWorkspace(...args),
    getActiveWorkspaceId: (...args: unknown[]) => mockGetActiveWorkspaceId(...args),
    publishToGitHub: (...args: unknown[]) => mockPublishToGitHub(...args),
  },
}));

vi.mock('../../src/config/pipeline.js', () => ({
  pipeline: { workspaceCacheTtl: 30000 },
}));

// ── Imports (after mocks) ───────────────────────────────────────────

import {
  handleWorkspaceList,
  handleWorkspaceSelect,
  handleWorkspaceStatus,
  handleWorkspaceCreate,
  handleWorkspaceDelete,
  handleWorkspaceSync,
  handleWorkspacePublish,
} from '../../src/tools/workspace.js';

// ── Test Suite ──────────────────────────────────────────────────────

describe('Workspace Tools', () => {
  beforeEach(() => {
    mockListWorkspaces.mockReset();
    mockSelectWorkspace.mockReset();
    mockGetWorkspaceStatus.mockReset();
    mockCreateWorkspace.mockReset();
    mockDeleteWorkspace.mockReset();
    mockSyncWorkspace.mockReset();
    mockGetWorkspace.mockReset();
    mockGetActiveWorkspaceId.mockReset();
    mockPublishToGitHub.mockReset();
  });

  // ─── workspace_list ───────────────────────────────────────────

  describe('workspace_list', () => {
    it('should return workspace list on success', async () => {
      mockListWorkspaces.mockResolvedValue({
        workspaces: [
          { id: 'my-app', name: 'my-app', projectType: 'node', isActive: true, branch: 'main', dirty: false },
          { id: 'api', name: 'api', projectType: 'python', isActive: false, branch: 'dev', dirty: true },
        ],
        activeWorkspace: 'my-app',
        count: 2,
      });

      const result = await handleWorkspaceList({});

      expect(result.success).toBe(true);
      expect(result.output).toContain('2 workspaces');
      expect(result.output).toContain('my-app');
      expect(result.output).toContain('active');
      expect(result.metadata?.count).toBe(2);
      expect(result.metadata?.activeWorkspace).toBe('my-app');
    });

    it('should return empty list when no workspaces exist', async () => {
      mockListWorkspaces.mockResolvedValue({
        workspaces: [],
        count: 0,
      });

      const result = await handleWorkspaceList({});

      expect(result.success).toBe(true);
      expect(result.output).toContain('0 workspaces');
      expect(result.metadata?.count).toBe(0);
    });

    it('should handle manager errors gracefully', async () => {
      mockListWorkspaces.mockRejectedValue(new Error('Docker socket unavailable'));

      const result = await handleWorkspaceList({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Docker socket unavailable');
    });
  });

  // ─── workspace_select ─────────────────────────────────────────

  describe('workspace_select', () => {
    it('should select workspace with valid name', async () => {
      mockSelectWorkspace.mockResolvedValue({
        id: 'my-project',
        name: 'my-project',
        path: '/workspace/my-project',
        projectType: 'node',
        description: 'A test project',
        isActive: true,
        git: { branch: 'main', dirty: false, ahead: 0, behind: 0 },
      });

      const result = await handleWorkspaceSelect({ name: 'my-project' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Switched to my-project');
      expect(result.output).toContain('main');
      expect(result.metadata?.name).toBe('my-project');
      expect(mockSelectWorkspace).toHaveBeenCalledWith('my-project');
    });

    it('should return validation error for missing name', async () => {
      const result = await handleWorkspaceSelect({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
      expect(mockSelectWorkspace).not.toHaveBeenCalled();
    });

    it('should return error when workspace not found', async () => {
      mockSelectWorkspace.mockRejectedValue(new Error('Workspace not found: nonexistent'));

      const result = await handleWorkspaceSelect({ name: 'nonexistent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Workspace not found');
    });
  });

  // ─── workspace_status ─────────────────────────────────────────

  describe('workspace_status', () => {
    it('should return git status for a named workspace', async () => {
      mockGetWorkspaceStatus.mockResolvedValue({
        id: 'my-app',
        name: 'my-app',
        path: '/workspace/my-app',
        projectType: 'typescript',
        description: 'A TypeScript app',
        isActive: true,
        lastAccessedAt: '2025-01-01T00:00:00Z',
        git: {
          branch: 'feature-x',
          dirty: true,
          ahead: 2,
          behind: 0,
          modifiedFiles: ['src/index.ts'],
          stagedFiles: [],
          untrackedFiles: ['newfile.txt'],
          remoteUrl: 'https://github.com/user/my-app',
          lastCommit: 'abc1234',
          lastCommitMessage: 'feat: add feature',
        },
      });

      const result = await handleWorkspaceStatus({ name: 'my-app' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('my-app');
      expect(result.output).toContain('feature-x');
      expect(result.output).toContain('1 modified');
      expect(result.output).toContain('1 untracked');
      expect(result.metadata?.git?.dirty).toBe(true);
    });

    it('should use active workspace when name is not specified', async () => {
      mockGetActiveWorkspaceId.mockReturnValue('active-project');
      mockGetWorkspaceStatus.mockResolvedValue({
        id: 'active-project',
        name: 'active-project',
        path: '/workspace/active-project',
        projectType: 'node',
        isActive: true,
        git: { branch: 'main', dirty: false },
      });

      const result = await handleWorkspaceStatus({});

      expect(result.success).toBe(true);
      expect(mockGetWorkspaceStatus).toHaveBeenCalledWith('active-project');
    });

    it('should return error when no workspace specified and no active workspace', async () => {
      mockGetActiveWorkspaceId.mockReturnValue(null);

      const result = await handleWorkspaceStatus({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('No workspace specified and no active workspace');
    });
  });

  // ─── workspace_create ─────────────────────────────────────────

  describe('workspace_create', () => {
    it('should create workspace with valid input', async () => {
      mockCreateWorkspace.mockResolvedValue({
        id: 'new-project',
        name: 'new-project',
        path: '/workspace/new-project',
        projectType: 'node',
        description: 'My new project',
        isActive: false,
        git: { branch: 'main' },
      });

      const result = await handleWorkspaceCreate({
        name: 'new-project',
        template: 'node',
        description: 'My new project',
        initGit: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Created new-project');
      expect(result.output).toContain('node');
      expect(result.metadata?.name).toBe('new-project');

      expect(mockCreateWorkspace).toHaveBeenCalledWith({
        name: 'new-project',
        template: 'node',
        description: 'My new project',
        initGit: true,
      });
    });

    it('should return validation error for invalid workspace name', async () => {
      const result = await handleWorkspaceCreate({ name: 'invalid name with spaces' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
      expect(mockCreateWorkspace).not.toHaveBeenCalled();
    });

    it('should return validation error for empty name', async () => {
      const result = await handleWorkspaceCreate({ name: '' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
      expect(mockCreateWorkspace).not.toHaveBeenCalled();
    });

    it('should use default template "empty" when not specified', async () => {
      mockCreateWorkspace.mockResolvedValue({
        id: 'bare',
        name: 'bare',
        path: '/workspace/bare',
        projectType: 'unknown',
        isActive: false,
      });

      const result = await handleWorkspaceCreate({ name: 'bare' });

      expect(result.success).toBe(true);
      expect(mockCreateWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'empty', initGit: true })
      );
    });
  });

  // ─── workspace_delete ─────────────────────────────────────────

  describe('workspace_delete', () => {
    it('should delete workspace with confirmation', async () => {
      mockGetActiveWorkspaceId.mockReturnValue('other-workspace');
      mockDeleteWorkspace.mockResolvedValue(undefined);

      const result = await handleWorkspaceDelete({ name: 'old-project', confirm: true });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Deleted workspace old-project');
      expect(mockDeleteWorkspace).toHaveBeenCalledWith('old-project');
    });

    it('should return error when confirm is false', async () => {
      const result = await handleWorkspaceDelete({ name: 'old-project', confirm: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
      expect(mockDeleteWorkspace).not.toHaveBeenCalled();
    });

    it('should prevent deleting the active workspace', async () => {
      mockGetActiveWorkspaceId.mockReturnValue('my-active');

      const result = await handleWorkspaceDelete({ name: 'my-active', confirm: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot delete the active workspace');
      expect(mockDeleteWorkspace).not.toHaveBeenCalled();
    });
  });

  // ─── workspace_sync ───────────────────────────────────────────

  describe('workspace_sync', () => {
    it('should sync workspace and return push result', async () => {
      mockGetActiveWorkspaceId.mockReturnValue('my-app');
      mockGetWorkspace.mockResolvedValue({
        id: 'my-app',
        name: 'my-app',
        path: '/workspace/my-app',
      });
      mockSyncWorkspace.mockResolvedValue({
        success: true,
        commitHash: 'abc1234',
        commitMessage: 'feat: update code',
        filesChanged: 3,
        remoteUrl: 'https://github.com/user/my-app',
        pushed: true,
        repoCreated: false,
      });

      const result = await handleWorkspaceSync({});

      expect(result.success).toBe(true);
      expect(result.output).toContain('Committed 3 files');
      expect(result.output).toContain('abc1234');
      expect(result.output).toContain('pushed to');
      expect(result.metadata?.pushed).toBe(true);
    });

    it('should return error when no workspace specified and no active workspace', async () => {
      mockGetActiveWorkspaceId.mockReturnValue(null);

      const result = await handleWorkspaceSync({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('No workspace specified and no active workspace');
    });

    it('should return error when workspace does not exist', async () => {
      mockGetWorkspace.mockResolvedValue(null);

      const result = await handleWorkspaceSync({ name: 'nonexistent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Workspace not found: nonexistent');
    });

    it('should pass commit message to syncWorkspace', async () => {
      mockGetWorkspace.mockResolvedValue({
        id: 'my-app',
        name: 'my-app',
        path: '/workspace/my-app',
      });
      mockSyncWorkspace.mockResolvedValue({
        success: true,
        commitHash: 'def5678',
        commitMessage: 'fix: resolve bug',
        filesChanged: 1,
        pushed: true,
        repoCreated: false,
      });

      await handleWorkspaceSync({ name: 'my-app', message: 'fix: resolve bug' });

      expect(mockSyncWorkspace).toHaveBeenCalledWith('my-app', 'fix: resolve bug');
    });

    it('should handle sync failure from manager', async () => {
      mockGetActiveWorkspaceId.mockReturnValue('my-app');
      mockGetWorkspace.mockResolvedValue({
        id: 'my-app',
        name: 'my-app',
        path: '/workspace/my-app',
      });
      mockSyncWorkspace.mockResolvedValue({
        success: false,
        error: 'Push rejected: non-fast-forward',
      });

      const result = await handleWorkspaceSync({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Push rejected');
    });
  });

  // ─── workspace_publish ────────────────────────────────────────

  describe('workspace_publish', () => {
    it('should publish workspace and return repo URL', async () => {
      mockGetActiveWorkspaceId.mockReturnValue('my-app');
      mockGetWorkspace.mockResolvedValue({
        id: 'my-app',
        name: 'my-app',
        path: '/workspace/my-app',
      });
      mockGetWorkspaceStatus.mockResolvedValue({
        id: 'my-app',
        name: 'my-app',
        git: { branch: 'main', remoteUrl: null },
      });
      mockPublishToGitHub.mockResolvedValue('https://github.com/user/my-app');

      const result = await handleWorkspacePublish({});

      expect(result.success).toBe(true);
      expect(result.output).toContain('Published my-app');
      expect(result.output).toContain('https://github.com/user/my-app');
      expect(result.output).toContain('private');
      expect(result.metadata?.repoUrl).toBe('https://github.com/user/my-app');
    });

    it('should return error when workspace already has a remote', async () => {
      mockGetActiveWorkspaceId.mockReturnValue('my-app');
      mockGetWorkspace.mockResolvedValue({
        id: 'my-app',
        name: 'my-app',
        path: '/workspace/my-app',
      });
      mockGetWorkspaceStatus.mockResolvedValue({
        id: 'my-app',
        name: 'my-app',
        git: { remoteUrl: 'https://github.com/user/existing-repo' },
      });

      const result = await handleWorkspacePublish({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('already has a remote');
      expect(mockPublishToGitHub).not.toHaveBeenCalled();
    });

    it('should return error when no workspace specified and no active workspace', async () => {
      mockGetActiveWorkspaceId.mockReturnValue(null);

      const result = await handleWorkspacePublish({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('No workspace specified and no active workspace');
    });
  });
});
