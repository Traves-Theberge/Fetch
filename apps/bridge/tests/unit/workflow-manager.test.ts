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

import { WorkflowManager, summarizeRun, summarizeToolResult, validateCronExpression } from '../../src/workflow/manager.js';

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

  it('validates cron expressions and summary helpers', () => {
    expect(validateCronExpression('* * * * *')).toBe(true);
    expect(validateCronExpression('*/15 9-17 * * 1-5')).toBe(true);
    expect(validateCronExpression('* * * *')).toBe(false);
    expect(validateCronExpression('70 * * * *')).toBe(false);

    expect(summarizeRun({
      id: 'wfr_1',
      workflowId: 'wf_1',
      workflowName: 'nightly',
      trigger: 'manual',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'completed',
      stepResults: [{ name: 'a', tool: 'workspace_status', result: { success: true, output: 'ok' } }],
    })).toContain('completed with 1 step');

    expect(summarizeToolResult({ success: true, output: 'done' })).toBe('done');
    expect(summarizeToolResult({ success: false, error: 'boom' })).toBe('boom');
  });

  it('runs cron workflow and updates cron success metadata', async () => {
    const manager = makeManager() as any;
    const now = new Date().toISOString();

    manager.state.workflows.push({
      id: 'wf_1',
      name: 'nightly',
      steps: [{ name: 'status', tool: 'workspace_status', args: {} }],
      createdAt: now,
      updatedAt: now,
    });
    manager.state.cronJobs.push({
      id: 'cron_1',
      name: 'nightly-cron',
      schedule: '* * * * *',
      workflowId: 'wf_1',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    mockRegistry.execute.mockResolvedValue({ success: true, output: 'ok', duration: 1 });
    const run = await manager.runCronJob('cron_1');

    expect(run.status).toBe('completed');
    expect(run.stepResults.length).toBe(1);
    const cron = manager.state.cronJobs[0];
    expect(cron.lastRunAt).toBeTruthy();
    expect(cron.lastError).toBeUndefined();
    expect(cron.nextRunAt).toBeTruthy();
  });

  it('captures cron failure metadata when a step fails', async () => {
    const manager = makeManager() as any;
    const now = new Date().toISOString();

    manager.state.workflows.push({
      id: 'wf_1',
      name: 'nightly',
      steps: [{ name: 'status', tool: 'workspace_status', args: {} }],
      createdAt: now,
      updatedAt: now,
    });
    manager.state.cronJobs.push({
      id: 'cron_1',
      name: 'nightly-cron',
      schedule: '* * * * *',
      workflowId: 'wf_1',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    mockRegistry.execute.mockResolvedValue({ success: false, output: 'bad', error: 'step failed' });
    const run = await manager.runCronJob('cron_1');

    expect(run.status).toBe('failed');
    expect(run.error).toContain('step failed');
    const cron = manager.state.cronJobs[0];
    expect(cron.lastRunAt).toBeTruthy();
    expect(cron.lastError).toContain('step failed');
    expect(cron.nextRunAt).toBeTruthy();
  });

  it('runs startup catch-up for overdue cron jobs and seeds missing nextRunAt', async () => {
    const manager = makeManager() as any;
    const now = Date.now();
    manager.state.workflows.push({
      id: 'wf_1',
      name: 'nightly',
      steps: [{ name: 'status', tool: 'workspace_status', args: {} }],
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    manager.state.cronJobs.push({
      id: 'cron_1',
      name: 'nightly-cron',
      schedule: '* * * * *',
      workflowId: 'wf_1',
      enabled: true,
      nextRunAt: new Date(now - 60_000).toISOString(),
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    manager.state.cronJobs.push({
      id: 'cron_2',
      name: 'seed-next-run',
      schedule: '* * * * *',
      workflowId: 'wf_1',
      enabled: false,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });

    const runCronSpy = vi.spyOn(manager, 'runCronJob').mockResolvedValue({
      id: 'wfr_mock',
      workflowId: 'wf_1',
      workflowName: 'nightly',
      trigger: 'cron',
      cronJobId: 'cron_1',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'completed',
      stepResults: [],
    });

    await manager.runOverdueCronJobs();

    expect(runCronSpy).toHaveBeenCalledWith('cron_1');
    expect(manager.state.cronJobs[1].nextRunAt).toBeTruthy();
    runCronSpy.mockRestore();
  });
});
