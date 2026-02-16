import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRegistry = {
  get: vi.fn((tool: string) => (tool === 'workspace_status' ? { name: tool } : undefined)),
  execute: vi.fn(async () => ({ success: true, output: 'ok', duration: 1 })),
};

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/tools/registry.js', () => ({
  getToolRegistry: vi.fn(() => mockRegistry),
}));

import { WorkflowManager } from '../../src/workflow/manager.js';

function makeManager(): WorkflowManager {
  const manager = new WorkflowManager();
  (manager as any).initialized = true;
  (manager as any).state = { workflows: [], cronJobs: [], runs: [] };
  (manager as any).saveState = vi.fn(async () => undefined);
  return manager;
}

describe('WorkflowManager safety guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects blocked workflow step tools', async () => {
    const manager = makeManager();

    await expect(manager.createWorkflow({
      name: 'bad-recursive',
      steps: [{ name: 'loop', tool: 'workflow_run', args: {} }],
    })).rejects.toThrow('blocked tool');
  });

  it('rejects unknown workflow step tools', async () => {
    const manager = makeManager();

    await expect(manager.createWorkflow({
      name: 'bad-unknown',
      steps: [{ name: 'mystery', tool: 'not_a_real_tool', args: {} }],
    })).rejects.toThrow('unknown tool');
  });

  it('fails fast when same workflow is already running', async () => {
    const manager = makeManager() as any;
    manager.state.workflows.push({
      id: 'wf_1',
      name: 'nightly',
      steps: [{ name: 'status', tool: 'workspace_status', args: {} }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    manager.runningWorkflows.add('wf_1');

    const run = await manager.runWorkflow('nightly');

    expect(run.status).toBe('failed');
    expect(run.error).toContain('already running');
    expect(mockRegistry.execute).not.toHaveBeenCalled();
  });
});
