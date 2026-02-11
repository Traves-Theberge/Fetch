/**
 * @fileoverview Workspace Manager Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceManager } from '../../src/workspace/manager.js';
import * as dockerUtils from '../../src/utils/docker.js';

// Mock Docker utilities
vi.mock('../../src/utils/docker.js', () => ({
  dockerExec: vi.fn(),
  getWorkspacePath: vi.fn((name: string) => `/workspace/${name}`),
  isKennelRunning: vi.fn(() => Promise.resolve(true)),
}));

describe('WorkspaceManager', () => {
  let manager: WorkspaceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new WorkspaceManager();
  });

  describe('createWorkspace', () => {
    it('should create an empty workspace by default', async () => {
      // Mock directory doesn't exist
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 1, // Doesn't exist
        stdout: '',
        stderr: '',
        timedOut: false,
      });

      // Mock mkdir success
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
      });

      // Mock README creation
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
      });

      // Mock git init
      vi.mocked(dockerUtils.dockerExec).mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
      });

      const workspace = await manager.createWorkspace({ name: 'test-project' });

      expect(workspace).toBeDefined();
      expect(workspace.name).toBe('test-project');
      expect(dockerUtils.dockerExec).toHaveBeenCalledWith('mkdir', ['-p', '/workspace/test-project']);
    });

    it('should scaffold a node project', async () => {
      vi.mocked(dockerUtils.dockerExec)
        .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '', timedOut: false }) // exists check
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // mkdir
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // npm init
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // index.js
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // readme
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // gitignore
        .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false }); // git calls

      const workspace = await manager.createWorkspace({ name: 'node-app', template: 'node' });

      expect(workspace.name).toBe('node-app');
      expect(dockerUtils.dockerExec).toHaveBeenCalledWith('npm', ['init', '-y'], expect.any(Object));
    });

    it('should scaffold a python project with venv', async () => {
      vi.mocked(dockerUtils.dockerExec)
        .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '', timedOut: false }) // exists check
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // mkdir
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // main.py
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // reqs.txt
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // venv
        .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false }); // rest

      await manager.createWorkspace({ name: 'py-app', template: 'python' });

      expect(dockerUtils.dockerExec).toHaveBeenCalledWith('python3', ['-m', 'venv', 'venv'], expect.any(Object));
    });

    it('should scaffold a Next.js project', async () => {
      vi.mocked(dockerUtils.dockerExec)
        .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '', timedOut: false }) // exists check
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // mkdir
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // rm -rf *
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // npx create-next-app
        .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false }); // rest

      await manager.createWorkspace({ name: 'my-next-app', template: 'next' });

      expect(dockerUtils.dockerExec).toHaveBeenCalledWith('npx', expect.arrayContaining(['create-next-app@latest', '.']), expect.any(Object));
    });

    it('should scaffold a Rust project', async () => {
      vi.mocked(dockerUtils.dockerExec)
        .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '', timedOut: false }) // exists check
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // mkdir
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // cargo init
        .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false }); // rest

      await manager.createWorkspace({ name: 'rust-app', template: 'rust' });

      expect(dockerUtils.dockerExec).toHaveBeenCalledWith('cargo', ['init', '--name', 'rust-app'], expect.any(Object));
    });

    it('should scaffold a Go project', async () => {
      vi.mocked(dockerUtils.dockerExec)
        .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '', timedOut: false }) // exists check
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // mkdir
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // go mod init
        .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false }); // rest

      await manager.createWorkspace({ name: 'go-app', template: 'go' });

      expect(dockerUtils.dockerExec).toHaveBeenCalledWith('go', ['mod', 'init', 'go-app'], expect.any(Object));
    });

    it('should fail if workspace already exists', async () => {
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 0, // Exists
        stdout: '',
        stderr: '',
        timedOut: false,
      });

      await expect(manager.createWorkspace({ name: 'existing' })).rejects.toThrow('Workspace already exists');
    });
  });

  describe('GitHub Sync', () => {
    it('should check if GitHub is available', async () => {
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
      });

      const available = await manager.isGitHubAvailable();
      expect(available).toBe(true);
    });

    it('should report GitHub unavailable when GH_TOKEN not set', async () => {
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'not logged in',
        timedOut: false,
      });

      const available = await manager.isGitHubAvailable();
      expect(available).toBe(false);
    });

    it('should create a GitHub repo for a workspace', async () => {
      // isGitHubAvailable: env check (test -n "$GH_TOKEN")
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 0, stdout: '', stderr: '', timedOut: false,
      });
      // isGitHubAvailable: gh api user connectivity check
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 0, stdout: 'TestUser', stderr: '', timedOut: false,
      });

      // gh repo create
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'https://github.com/TestUser/my-project\n',
        stderr: '',
        timedOut: false,
      });

      const url = await manager.createGitHubRepo('/workspace/my-project', 'my-project', 'A test project');
      expect(url).toBe('https://github.com/TestUser/my-project');

      // Verify gh repo create was called with correct args
      expect(dockerUtils.dockerExec).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['repo', 'create', 'my-project', '--private']),
        expect.any(Object)
      );
    });

    it('should handle repo already exists by linking', async () => {
      // isGitHubAvailable: env check (test -n "$GH_TOKEN")
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 0, stdout: '', stderr: '', timedOut: false,
      });
      // isGitHubAvailable: gh api user connectivity check
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 0, stdout: 'TestUser', stderr: '', timedOut: false,
      });

      // gh repo create → already exists
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'already exists',
        timedOut: false,
      });

      // linkExistingRepo: gh api user (for username)
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 0, stdout: 'TestUser', stderr: '', timedOut: false,
      });

      // git remote get-url (no remote)
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 1, stdout: '', stderr: '', timedOut: false,
      });

      // git remote add
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 0, stdout: '', stderr: '', timedOut: false,
      });

      // git push
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 0, stdout: '', stderr: '', timedOut: false,
      });

      const url = await manager.createGitHubRepo('/workspace/existing', 'existing');
      expect(url).toBe('https://github.com/TestUser/existing');
    });

    it('should return undefined when GitHub is not available', async () => {
      // isGitHubAvailable: env check fails (no GH_TOKEN)
      vi.mocked(dockerUtils.dockerExec).mockResolvedValueOnce({
        exitCode: 1, stdout: '', stderr: '', timedOut: false,
      });

      const url = await manager.createGitHubRepo('/workspace/test', 'test');
      expect(url).toBeUndefined();
    });

    it('should sync workspace with commit and push', async () => {
      const mockWorkspace = {
        id: 'test-project',
        name: 'test-project',
        path: '/workspace/test-project',
        projectType: 'node' as const,
        isActive: false,
      };

      // Pre-populate cache and mark it fresh
      (manager as any).workspaceCache.set('test-project', mockWorkspace);
      (manager as any).lastCacheRefresh = Date.now();

      vi.mocked(dockerUtils.dockerExec)
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // test -d .git
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // git add -A
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'M  src/index.ts\n', stderr: '', timedOut: false }) // git status --porcelain
        .mockResolvedValueOnce({ exitCode: 0, stdout: ' 1 file changed, 10 insertions(+)\n', stderr: '', timedOut: false }) // git diff --cached --stat
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) // git commit
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'abc1234', stderr: '', timedOut: false }) // git log -1 --format=%h
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'https://github.com/TestUser/test-project', stderr: '', timedOut: false }) // git remote get-url origin
        .mockResolvedValueOnce({ exitCode: 0, stdout: '1', stderr: '', timedOut: false }) // git rev-list --count origin/main..main
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', timedOut: false }); // git push

      const result = await manager.syncWorkspace('test-project');

      expect(result.success).toBe(true);
      expect(result.filesChanged).toBe(1);
      expect(result.pushed).toBe(true);
      expect(result.commitHash).toBe('abc1234');
    });

    it('should return error for non-existent workspace', async () => {
      // Pre-set lastCacheRefresh to make cache "fresh"
      (manager as any).lastCacheRefresh = Date.now();
      
      // fetchWorkspace calls docker to check if dir exists — return not found
      vi.mocked(dockerUtils.dockerExec).mockResolvedValue({
        exitCode: 1, stdout: '', stderr: 'not found', timedOut: false,
      });
      
      const result = await manager.syncWorkspace('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
