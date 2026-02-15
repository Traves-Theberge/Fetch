/**
 * @fileoverview Workflow, cron, and runtime execution tool handlers.
 *
 * Provides:
 * - `workflow_*` tools for reusable multi-step automations
 * - `cron_*` tools for scheduled workflow execution
 * - runtime tools to run/test apps and browser checks inside Kennel
 *
 * @module tools/workflow
 */

import { dockerExec, getWorkspacePath } from '../utils/docker.js';
import { getWorkflowManager, summarizeRun, summarizeToolResult } from '../workflow/manager.js';
import { workspaceManager } from '../workspace/manager.js';
import { handleBrowserOpen, handleBrowserSnapshot, handleBrowserScreenshot } from './browser.js';
import {
  WorkflowCreateInputSchema,
  WorkflowDeleteInputSchema,
  WorkflowListInputSchema,
  WorkflowRunInputSchema,
  CronCreateInputSchema,
  CronDeleteInputSchema,
  CronListInputSchema,
  CronRunInputSchema,
  AppRunInputSchema,
  AppTestInputSchema,
  BrowserTestInputSchema,
  type WorkflowCreateInput,
  type WorkflowDeleteInput,
  type WorkflowRunInput,
  type CronCreateInput,
  type CronDeleteInput,
  type CronRunInput,
  type AppRunInput,
  type AppTestInput,
  type BrowserTestInput,
} from '../validation/tools.js';
import type { ToolContext, ToolResult } from './types.js';
import type { WorkflowStep } from '../workflow/types.js';

const MAX_OUTPUT_CHARS = 24_000;

function clipOutput(stdout: string, stderr: string): string {
  const merged = [stdout, stderr].filter(Boolean).join('\n').trim();
  if (!merged) return '(no output)';
  if (merged.length <= MAX_OUTPUT_CHARS) return merged;
  return `${merged.slice(0, MAX_OUTPUT_CHARS)}\n... (truncated)`;
}

async function resolveWorkspacePath(workspace?: string): Promise<string> {
  const target = workspace ?? workspaceManager.getActiveWorkspaceId();
  if (!target) {
    throw new Error('No workspace specified and no active workspace selected');
  }

  const ws = await workspaceManager.getWorkspace(target);
  if (!ws) throw new Error(`Workspace not found: ${target}`);
  return getWorkspacePath(ws.id);
}

function normalizeWorkflowSteps(rawSteps: Array<WorkflowStep | string>): WorkflowStep[] {
  return rawSteps.map((step, index) => {
    if (typeof step !== 'string') return step;
    const [toolRaw, nameRaw] = step.split('|', 2);
    const tool = (toolRaw || '').trim();
    const name = (nameRaw || `step-${index + 1}`).trim();
    return {
      name: name || `step-${index + 1}`,
      tool,
      args: {},
    };
  });
}

// ============================================================================
// workflow_*
// ============================================================================

export async function handleWorkflowCreate(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parsed = WorkflowCreateInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, output: '', error: `Invalid input: ${parsed.error.message}`, duration: Date.now() - start };
  }

  try {
    const manager = await getWorkflowManager();
    const data = parsed.data as WorkflowCreateInput;
    const created = await manager.createWorkflow({
      ...data,
      steps: normalizeWorkflowSteps(data.steps as Array<WorkflowStep | string>),
    });
    return {
      success: true,
      output: `Workflow "${created.name}" created with ${created.steps.length} step(s)`,
      summary: `Created workflow ${created.name}`,
      duration: Date.now() - start,
      metadata: { workflow: created },
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

export async function handleWorkflowList(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parsed = WorkflowListInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { success: false, output: '', error: `Invalid input: ${parsed.error.message}`, duration: Date.now() - start };
  }

  try {
    const manager = await getWorkflowManager();
    const workflows = manager.listWorkflows();
    const runs = parsed.data.includeRuns ? manager.listRuns(parsed.data.runLimit) : [];

    const workflowLine = workflows.length
      ? workflows.map((w) => `${w.name}(${w.steps.length})`).join(', ')
      : 'none';
    const runLine = runs.length
      ? ` | recent runs: ${runs.map((r) => `${r.workflowName}:${r.status}`).join(', ')}`
      : '';

    return {
      success: true,
      output: `${workflows.length} workflow(s): ${workflowLine}${runLine}`,
      summary: `${workflows.length} workflows`,
      duration: Date.now() - start,
      metadata: { workflows, runs },
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

export async function handleWorkflowRun(input: unknown, context?: ToolContext): Promise<ToolResult> {
  const start = Date.now();
  const parsed = WorkflowRunInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, output: '', error: `Invalid input: ${parsed.error.message}`, duration: Date.now() - start };
  }

  try {
    const manager = await getWorkflowManager();
    const run = await manager.runWorkflow((parsed.data as WorkflowRunInput).workflow, context);
    const detail = run.stepResults.map((s) => `${s.name}:${s.result.success ? 'ok' : 'fail'}(${summarizeToolResult(s.result)})`).join(' | ');
    return {
      success: run.status === 'completed',
      output: `${summarizeRun(run)}${detail ? `\n${detail}` : ''}`,
      summary: summarizeRun(run),
      error: run.error,
      duration: Date.now() - start,
      metadata: { run },
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

export async function handleWorkflowDelete(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parsed = WorkflowDeleteInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, output: '', error: `Invalid input: ${parsed.error.message}`, duration: Date.now() - start };
  }

  try {
    const manager = await getWorkflowManager();
    const removed = await manager.deleteWorkflow((parsed.data as WorkflowDeleteInput).workflow);
    if (!removed) {
      return {
        success: false,
        output: '',
        error: `Workflow not found: ${(parsed.data as WorkflowDeleteInput).workflow}`,
        duration: Date.now() - start,
      };
    }
    return {
      success: true,
      output: `Deleted workflow ${(parsed.data as WorkflowDeleteInput).workflow}`,
      summary: 'Workflow deleted',
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// cron_*
// ============================================================================

export async function handleCronCreate(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parsed = CronCreateInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, output: '', error: `Invalid input: ${parsed.error.message}`, duration: Date.now() - start };
  }

  try {
    const manager = await getWorkflowManager();
    const data = parsed.data as CronCreateInput;
    const cron = await manager.createCronJob({
      name: data.name,
      schedule: data.schedule,
      workflowNameOrId: data.workflow,
      enabled: data.enabled,
    });
    return {
      success: true,
      output: `Created cron job "${cron.name}" (${cron.schedule}) -> workflow ${data.workflow}`,
      summary: `Created cron job ${cron.name}`,
      duration: Date.now() - start,
      metadata: { cron },
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

export async function handleCronList(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parsed = CronListInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { success: false, output: '', error: `Invalid input: ${parsed.error.message}`, duration: Date.now() - start };
  }

  try {
    const manager = await getWorkflowManager();
    const jobs = manager.listCronJobs();
    const output = jobs.length
      ? jobs.map((j) => `${j.name} [${j.enabled ? 'on' : 'off'}] ${j.schedule} -> ${j.workflowId}`).join('\n')
      : 'No cron jobs configured';
    return {
      success: true,
      output,
      summary: `${jobs.length} cron jobs`,
      duration: Date.now() - start,
      metadata: { jobs },
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

export async function handleCronDelete(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parsed = CronDeleteInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, output: '', error: `Invalid input: ${parsed.error.message}`, duration: Date.now() - start };
  }

  try {
    const manager = await getWorkflowManager();
    const removed = await manager.deleteCronJob((parsed.data as CronDeleteInput).job);
    if (!removed) {
      return {
        success: false,
        output: '',
        error: `Cron job not found: ${(parsed.data as CronDeleteInput).job}`,
        duration: Date.now() - start,
      };
    }
    return {
      success: true,
      output: `Deleted cron job ${(parsed.data as CronDeleteInput).job}`,
      summary: 'Cron job deleted',
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

export async function handleCronRun(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parsed = CronRunInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, output: '', error: `Invalid input: ${parsed.error.message}`, duration: Date.now() - start };
  }

  try {
    const manager = await getWorkflowManager();
    const run = await manager.runCronJob((parsed.data as CronRunInput).job);
    return {
      success: run.status === 'completed',
      output: summarizeRun(run),
      summary: summarizeRun(run),
      error: run.error,
      duration: Date.now() - start,
      metadata: { run },
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// app_run / app_test / browser_test
// ============================================================================

export async function handleAppRun(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parsed = AppRunInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, output: '', error: `Invalid input: ${parsed.error.message}`, duration: Date.now() - start };
  }

  try {
    const data = parsed.data as AppRunInput;
    const cwd = await resolveWorkspacePath(data.workspace);
    const result = await dockerExec('sh', ['-lc', data.command], {
      cwd,
      timeoutMs: data.timeoutMs,
    });

    const output = clipOutput(result.stdout, result.stderr);
    return {
      success: result.exitCode === 0,
      output,
      summary: `app_run exit=${result.exitCode}`,
      error: result.exitCode === 0 ? undefined : `Command failed with exit code ${result.exitCode}`,
      duration: Date.now() - start,
      metadata: { exitCode: result.exitCode, timedOut: result.timedOut, cwd, command: data.command },
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

function inferTestCommand(files: string[]): string | null {
  const has = (name: string) => files.includes(name);
  if (has('package.json')) return 'npm test';
  if (has('go.mod')) return 'go test ./...';
  if (has('Cargo.toml')) return 'cargo test';
  if (has('pyproject.toml') || has('requirements.txt') || has('setup.py')) return 'pytest';
  return null;
}

async function listWorkspaceRootFiles(cwd: string): Promise<string[]> {
  const res = await dockerExec('sh', ['-lc', 'ls -1A'], { cwd, timeoutMs: 10_000 });
  if (res.exitCode !== 0) return [];
  return res.stdout.split('\n').map((v) => v.trim()).filter(Boolean);
}

export async function handleAppTest(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parsed = AppTestInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { success: false, output: '', error: `Invalid input: ${parsed.error.message}`, duration: Date.now() - start };
  }

  try {
    const data = parsed.data as AppTestInput;
    const cwd = await resolveWorkspacePath(data.workspace);
    let command = data.command?.trim();
    if (!command) {
      const rootFiles = await listWorkspaceRootFiles(cwd);
      command = inferTestCommand(rootFiles) ?? '';
      if (!command) {
        return {
          success: false,
          output: '',
          error: 'Could not infer test command. Provide app_test.command explicitly.',
          duration: Date.now() - start,
        };
      }
    }

    const result = await dockerExec('sh', ['-lc', command], {
      cwd,
      timeoutMs: data.timeoutMs,
    });

    return {
      success: result.exitCode === 0,
      output: clipOutput(result.stdout, result.stderr),
      summary: `app_test exit=${result.exitCode}`,
      error: result.exitCode === 0 ? undefined : `Tests failed with exit code ${result.exitCode}`,
      duration: Date.now() - start,
      metadata: { exitCode: result.exitCode, timedOut: result.timedOut, cwd, command },
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

export async function handleBrowserTest(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parsed = BrowserTestInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, output: '', error: `Invalid input: ${parsed.error.message}`, duration: Date.now() - start };
  }

  const data = parsed.data as BrowserTestInput;
  const checks = (data.mustInclude ?? []).map((v) => v.trim()).filter(Boolean);

  const opened = await handleBrowserOpen({ url: data.url, waitUntil: data.waitUntil });
  if (!opened.success) {
    return { ...opened, duration: Date.now() - start };
  }

  const snap = await handleBrowserSnapshot({});
  if (!snap.success) {
    return { ...snap, duration: Date.now() - start };
  }

  const snapshot = snap.output || '';
  const missing = checks.filter((needle) => !snapshot.toLowerCase().includes(needle.toLowerCase()));
  const screenshot = data.includeScreenshot ? await handleBrowserScreenshot({}) : undefined;

  const passed = missing.length === 0;
  const outputParts = [
    `Browser test for ${data.url}: ${passed ? 'PASS' : 'FAIL'}`,
    checks.length ? `checks: ${checks.join(', ')}` : 'checks: none',
    missing.length ? `missing: ${missing.join(', ')}` : 'missing: none',
  ];

  return {
    success: passed,
    output: outputParts.join('\n'),
    summary: passed ? 'browser_test passed' : 'browser_test failed',
    error: passed ? undefined : `Missing ${missing.length} expected item(s) in snapshot`,
    duration: Date.now() - start,
    metadata: {
      snapshot,
      screenshot: screenshot?.success ? screenshot.output : undefined,
    },
  };
}

// ============================================================================
// Tool description catalog
// ============================================================================

export const workflowTools: Record<string, { description: string }> = {
  workflow_create: { description: 'Create a named multi-step workflow using existing tools.' },
  workflow_list: { description: 'List saved workflows and optionally recent workflow runs.' },
  workflow_run: { description: 'Run a saved workflow immediately and return step-level results.' },
  workflow_delete: { description: 'Delete a saved workflow and any cron jobs bound to it.' },
  cron_create: { description: 'Create a cron job that triggers a saved workflow on a schedule (UTC).' },
  cron_list: { description: 'List all configured cron jobs and their schedule state.' },
  cron_delete: { description: 'Delete a cron job by name or id.' },
  cron_run: { description: 'Trigger a cron job immediately for testing.' },
  app_run: { description: 'Run an application command inside a workspace in Kennel.' },
  app_test: { description: 'Run project tests inside a workspace (auto-detect command when possible).' },
  browser_test: { description: 'Open a URL and assert expected content appears in browser snapshot.' },
};
