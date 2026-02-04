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
});
