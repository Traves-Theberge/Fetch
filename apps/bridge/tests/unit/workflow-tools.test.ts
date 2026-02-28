/**
 * @fileoverview Unit tests for workflow/cron/runtime tool handlers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockManager = {
  createWorkflow: vi.fn(),
  listWorkflows: vi.fn(),
  listRuns: vi.fn(),
  runWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  createCronJob: vi.fn(),
  listCronJobs: vi.fn(),
  deleteCronJob: vi.fn(),
  runCronJob: vi.fn(),
};

const mockDockerExec = vi.fn();
const mockWorkspaceGet = vi.fn();
const mockActiveWorkspace = vi.fn();
const mockBrowserOpen = vi.fn();
const mockBrowserSnapshot = vi.fn();
const mockBrowserScreenshot = vi.fn();

vi.mock('../../src/workflow/manager.js', () => ({
  getWorkflowManager: vi.fn(async () => mockManager),
  summarizeRun: vi.fn((run: { workflowName: string; status: string }) => `${run.workflowName}:${run.status}`),
  summarizeToolResult: vi.fn(() => 'ok'),
}));

vi.mock('../../src/utils/docker.js', () => ({
  dockerExec: (...args: unknown[]) => mockDockerExec(...args),
  getWorkspacePath: vi.fn((name: string) => `/workspace/${name}`),
}));

vi.mock('../../src/workspace/manager.js', () => ({
  workspaceManager: {
    getWorkspace: (...args: unknown[]) => mockWorkspaceGet(...args),
    getActiveWorkspaceId: (...args: unknown[]) => mockActiveWorkspace(...args),
  },
}));

vi.mock('../../src/tools/browser.js', () => ({
  handleBrowserOpen: (...args: unknown[]) => mockBrowserOpen(...args),
  handleBrowserSnapshot: (...args: unknown[]) => mockBrowserSnapshot(...args),
  handleBrowserScreenshot: (...args: unknown[]) => mockBrowserScreenshot(...args),
}));

import {
  handleWorkflowCreate,
  handleCronCreate,
  handleAppTest,
  handleBrowserTest,
} from '../../src/tools/workflow.js';

describe('workflow tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a workflow', async () => {
    mockManager.createWorkflow.mockResolvedValue({
      id: 'wf_1',
      name: 'nightly',
      steps: [{ name: 'status', tool: 'workspace_status' }],
    });

    const result = await handleWorkflowCreate({
      name: 'nightly',
      steps: [{ name: 'status', tool: 'workspace_status', args: {} }],
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Workflow "nightly" created');
    expect(mockManager.createWorkflow).toHaveBeenCalledOnce();
  });

  it('creates a cron job', async () => {
    mockManager.createCronJob.mockResolvedValue({
      id: 'cron_1',
      name: 'nightly',
      schedule: '0 3 * * *',
    });

    const result = await handleCronCreate({
      name: 'nightly',
      schedule: '0 3 * * *',
      workflow: 'nightly-workflow',
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Created cron job "nightly"');
  });

  it('runs app_test with inferred npm test command', async () => {
    mockActiveWorkspace.mockReturnValue('demo');
    mockWorkspaceGet.mockResolvedValue({ id: 'demo' });
    mockDockerExec
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'package.json\nsrc\n', stderr: '', timedOut: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'ok', stderr: '', timedOut: false });

    const result = await handleAppTest({});

    expect(result.success).toBe(true);
    expect(mockDockerExec).toHaveBeenNthCalledWith(
      2,
      'sh',
      ['-lc', 'npm test'],
      expect.objectContaining({ cwd: '/workspace/demo' })
    );
  });

  it('runs browser_test checks and fails when expectation missing', async () => {
    mockBrowserOpen.mockResolvedValue({ success: true, output: '', duration: 1 });
    mockBrowserSnapshot.mockResolvedValue({ success: true, output: 'home page content', duration: 1 });
    mockBrowserScreenshot.mockResolvedValue({ success: true, output: 'base64', duration: 1 });

    const result = await handleBrowserTest({
      url: 'https://example.com',
      mustInclude: ['Login'],
      includeScreenshot: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing');
    expect(result.metadata?.screenshot).toBe('base64');
  });
});
