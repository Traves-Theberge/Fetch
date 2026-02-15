/**
 * @fileoverview Workflow and cron scheduler manager.
 *
 * Persists workflow definitions and cron jobs, executes workflows via the tool
 * registry, and runs a lightweight cron loop.
 *
 * @module workflow/manager
 */

import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { WORKFLOWS_JSON } from '../config/paths.js';
import { logger } from '../utils/logger.js';
import { getToolRegistry } from '../tools/registry.js';
import type { ToolContext, ToolResult } from '../tools/types.js';
import type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowState,
  WorkflowStep,
  WorkflowStepRun,
  CronJob,
} from './types.js';

const DEFAULT_STATE: WorkflowState = {
  workflows: [],
  cronJobs: [],
  runs: [],
};

const CRON_TICK_MS = 15_000;
const MAX_RUN_HISTORY = 200;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function createId(prefix: string): string {
  return `${prefix}_${nanoid(10)}`;
}

function splitCron(expr: string): string[] {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error('Cron expression must have exactly 5 fields: minute hour day month weekday');
  }
  return parts;
}

function toInt(v: string): number {
  const parsed = Number.parseInt(v, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid cron value: ${v}`);
  }
  return parsed;
}

function parseFieldPart(part: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  const normalized = part.trim();
  if (normalized === '*') {
    for (let i = min; i <= max; i += 1) out.add(i);
    return out;
  }

  if (normalized.includes('/')) {
    const [base, stepRaw] = normalized.split('/');
    const step = toInt(stepRaw);
    if (step <= 0) throw new Error(`Invalid cron step: ${normalized}`);

    const source = base === '*' ? `${min}-${max}` : base;
    const baseSet = parseFieldPart(source, min, max);
    const sorted = Array.from(baseSet).sort((a, b) => a - b);
    if (sorted.length === 0) return out;
    const start = sorted[0];
    for (const v of sorted) {
      if ((v - start) % step === 0) out.add(v);
    }
    return out;
  }

  if (normalized.includes(',')) {
    for (const token of normalized.split(',')) {
      for (const v of parseFieldPart(token, min, max)) out.add(v);
    }
    return out;
  }

  if (normalized.includes('-')) {
    const [startRaw, endRaw] = normalized.split('-');
    const start = toInt(startRaw);
    const end = toInt(endRaw);
    if (start > end) throw new Error(`Invalid cron range: ${normalized}`);
    if (start < min || end > max) throw new Error(`Cron range out of bounds: ${normalized}`);
    for (let i = start; i <= end; i += 1) out.add(i);
    return out;
  }

  const value = toInt(normalized);
  if (value < min || value > max) throw new Error(`Cron value out of bounds: ${normalized}`);
  out.add(value);
  return out;
}

function matchesCron(expr: string, date: Date): boolean {
  const [m, h, d, mo, w] = splitCron(expr);
  const minute = parseFieldPart(m, 0, 59);
  const hour = parseFieldPart(h, 0, 23);
  const day = parseFieldPart(d, 1, 31);
  const month = parseFieldPart(mo, 1, 12);
  const weekday = parseFieldPart(w, 0, 6);

  return minute.has(date.getUTCMinutes())
    && hour.has(date.getUTCHours())
    && day.has(date.getUTCDate())
    && month.has(date.getUTCMonth() + 1)
    && weekday.has(date.getUTCDay());
}

function buildMinuteKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${date.getUTCHours()}-${date.getUTCMinutes()}`;
}

function sameMinute(aIso: string | undefined, b: Date): boolean {
  if (!aIso) return false;
  return buildMinuteKey(new Date(aIso)) === buildMinuteKey(b);
}

function computeNextRun(schedule: string, fromDate = new Date()): string | undefined {
  // Search up to 1 year ahead in minute increments.
  const cursor = new Date(fromDate.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  const maxChecks = 60 * 24 * 366;
  for (let i = 0; i < maxChecks; i += 1) {
    if (matchesCron(schedule, cursor)) return cursor.toISOString();
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return undefined;
}

/** Manages workflow definitions, run execution, and cron scheduling. */
export class WorkflowManager {
  private state: WorkflowState = { ...DEFAULT_STATE };
  private initialized = false;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private runningCronJobs = new Set<string>();

  async init(): Promise<void> {
    if (this.initialized) return;
    this.state = await this.loadState();
    this.initialized = true;
    this.startCronTicker();
    logger.info('WorkflowManager initialized', {
      workflows: this.state.workflows.length,
      cronJobs: this.state.cronJobs.length,
      runs: this.state.runs.length,
    });
  }

  async shutdown(): Promise<void> {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    if (this.initialized) {
      await this.saveState();
    }
    this.initialized = false;
  }

  private ensureInit(): void {
    if (!this.initialized) {
      throw new Error('WorkflowManager is not initialized');
    }
  }

  private async loadState(): Promise<WorkflowState> {
    try {
      const parentDir = path.dirname(WORKFLOWS_JSON);
      if (parentDir) {
        await fs.promises.mkdir(parentDir, { recursive: true });
      }
      const raw = await fs.promises.readFile(WORKFLOWS_JSON, 'utf8').catch(() => '');
      if (!raw.trim()) return { ...DEFAULT_STATE };

      const parsed = JSON.parse(raw) as Partial<WorkflowState>;
      return {
        workflows: Array.isArray(parsed.workflows) ? parsed.workflows : [],
        cronJobs: Array.isArray(parsed.cronJobs) ? parsed.cronJobs : [],
        runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      };
    } catch (error) {
      logger.warn('Failed to load workflow state; starting fresh', { error });
      return { ...DEFAULT_STATE };
    }
  }

  private async saveState(): Promise<void> {
    try {
      const json = JSON.stringify(this.state, null, 2);
      await fs.promises.writeFile(WORKFLOWS_JSON, `${json}\n`, 'utf8');
    } catch (error) {
      logger.error('Failed to persist workflow state', { error });
    }
  }

  listWorkflows(): WorkflowDefinition[] {
    this.ensureInit();
    return this.state.workflows.map((w) => ({ ...w, steps: [...w.steps] }));
  }

  getWorkflow(nameOrId: string): WorkflowDefinition | undefined {
    this.ensureInit();
    const normalized = normalizeName(nameOrId);
    return this.state.workflows.find((w) => w.id === nameOrId || normalizeName(w.name) === normalized);
  }

  async createWorkflow(input: {
    name: string;
    description?: string;
    workspace?: string;
    steps: WorkflowStep[];
  }): Promise<WorkflowDefinition> {
    this.ensureInit();
    const normalized = normalizeName(input.name);
    if (!normalized) throw new Error('Workflow name is required');
    if (this.state.workflows.some((w) => normalizeName(w.name) === normalized)) {
      throw new Error(`Workflow already exists: ${input.name}`);
    }

    const now = nowIso();
    const workflow: WorkflowDefinition = {
      id: createId('wf'),
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      workspace: input.workspace?.trim() || undefined,
      steps: input.steps.map((step, i) => ({
        name: step.name?.trim() || `step-${i + 1}`,
        tool: step.tool.trim(),
        args: step.args ?? {},
      })),
      createdAt: now,
      updatedAt: now,
    };

    this.state.workflows.push(workflow);
    await this.saveState();
    return workflow;
  }

  async deleteWorkflow(nameOrId: string): Promise<boolean> {
    this.ensureInit();
    const workflow = this.getWorkflow(nameOrId);
    if (!workflow) return false;

    this.state.workflows = this.state.workflows.filter((w) => w.id !== workflow.id);
    this.state.cronJobs = this.state.cronJobs.filter((c) => c.workflowId !== workflow.id);
    await this.saveState();
    return true;
  }

  listCronJobs(): CronJob[] {
    this.ensureInit();
    return this.state.cronJobs.map((c) => ({ ...c }));
  }

  async createCronJob(input: {
    name: string;
    schedule: string;
    workflowNameOrId: string;
    enabled?: boolean;
  }): Promise<CronJob> {
    this.ensureInit();
    splitCron(input.schedule); // validates structure early
    // verify each field parses
    matchesCron(input.schedule, new Date());

    const normalized = normalizeName(input.name);
    if (!normalized) throw new Error('Cron job name is required');
    if (this.state.cronJobs.some((c) => normalizeName(c.name) === normalized)) {
      throw new Error(`Cron job already exists: ${input.name}`);
    }

    const workflow = this.getWorkflow(input.workflowNameOrId);
    if (!workflow) throw new Error(`Workflow not found: ${input.workflowNameOrId}`);

    const now = nowIso();
    const cron: CronJob = {
      id: createId('cron'),
      name: input.name.trim(),
      schedule: input.schedule.trim(),
      workflowId: workflow.id,
      enabled: input.enabled ?? true,
      nextRunAt: computeNextRun(input.schedule),
      createdAt: now,
      updatedAt: now,
    };

    this.state.cronJobs.push(cron);
    await this.saveState();
    return cron;
  }

  async deleteCronJob(nameOrId: string): Promise<boolean> {
    this.ensureInit();
    const normalized = normalizeName(nameOrId);
    const before = this.state.cronJobs.length;
    this.state.cronJobs = this.state.cronJobs.filter((c) => c.id !== nameOrId && normalizeName(c.name) !== normalized);
    const changed = this.state.cronJobs.length !== before;
    if (changed) await this.saveState();
    return changed;
  }

  listRuns(limit = 20): WorkflowRun[] {
    this.ensureInit();
    return this.state.runs.slice(-limit).reverse().map((r) => ({ ...r, stepResults: [...r.stepResults] }));
  }

  async runWorkflow(nameOrId: string, context?: ToolContext): Promise<WorkflowRun> {
    this.ensureInit();
    const workflow = this.getWorkflow(nameOrId);
    if (!workflow) throw new Error(`Workflow not found: ${nameOrId}`);
    return this.executeWorkflow(workflow, 'manual', undefined, context);
  }

  async runCronJob(nameOrId: string): Promise<WorkflowRun> {
    this.ensureInit();
    const normalized = normalizeName(nameOrId);
    const cron = this.state.cronJobs.find((c) => c.id === nameOrId || normalizeName(c.name) === normalized);
    if (!cron) throw new Error(`Cron job not found: ${nameOrId}`);
    const workflow = this.state.workflows.find((w) => w.id === cron.workflowId);
    if (!workflow) throw new Error(`Workflow for cron job not found: ${cron.workflowId}`);
    return this.executeWorkflow(workflow, 'cron', cron.id);
  }

  private startCronTicker(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      void this.tickCron();
    }, CRON_TICK_MS);
    this.ticker.unref();
  }

  private async tickCron(): Promise<void> {
    const now = new Date();
    for (const cron of this.state.cronJobs) {
      if (!cron.enabled) continue;
      if (this.runningCronJobs.has(cron.id)) continue;
      if (!matchesCron(cron.schedule, now)) continue;
      if (sameMinute(cron.lastRunAt, now)) continue;

      this.runningCronJobs.add(cron.id);
      void this.runCronJob(cron.id)
        .catch((error) => {
          logger.error('Cron job execution failed', { cronJobId: cron.id, error });
        })
        .finally(() => {
          this.runningCronJobs.delete(cron.id);
        });
    }
  }

  private async executeWorkflow(
    workflow: WorkflowDefinition,
    trigger: 'manual' | 'cron',
    cronJobId?: string,
    context?: ToolContext
  ): Promise<WorkflowRun> {
    const startedAt = nowIso();
    const run: WorkflowRun = {
      id: createId('wfr'),
      workflowId: workflow.id,
      workflowName: workflow.name,
      trigger,
      cronJobId,
      startedAt,
      status: 'running',
      stepResults: [],
    };
    this.state.runs.push(run);
    if (this.state.runs.length > MAX_RUN_HISTORY) {
      this.state.runs = this.state.runs.slice(-MAX_RUN_HISTORY);
    }
    await this.saveState();

    const registry = getToolRegistry();
    const stepResults: WorkflowStepRun[] = [];

    try {
      if (workflow.workspace) {
        const wsResult = await registry.execute('workspace_select', { name: workflow.workspace }, context);
        stepResults.push({
          name: 'select-workspace',
          tool: 'workspace_select',
          result: wsResult,
        });
        if (!wsResult.success) {
          throw new Error(wsResult.error || wsResult.output || 'Failed to select workflow workspace');
        }
      }

      for (const step of workflow.steps) {
        const stepResult = await registry.execute(step.tool, step.args ?? {}, context);
        stepResults.push({
          name: step.name,
          tool: step.tool,
          result: stepResult,
        });

        if (!stepResult.success) {
          throw new Error(stepResult.error || stepResult.output || `Step failed: ${step.name}`);
        }
      }

      run.status = 'completed';
      run.stepResults = stepResults;
      run.completedAt = nowIso();
      await this.markCronRunSuccess(cronJobId);
      await this.saveState();
      return run;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      run.status = 'failed';
      run.error = message;
      run.stepResults = stepResults;
      run.completedAt = nowIso();
      await this.markCronRunFailure(cronJobId, message);
      await this.saveState();
      return run;
    }
  }

  private async markCronRunSuccess(cronJobId?: string): Promise<void> {
    if (!cronJobId) return;
    const cron = this.state.cronJobs.find((c) => c.id === cronJobId);
    if (!cron) return;
    const now = new Date();
    cron.lastRunAt = now.toISOString();
    cron.lastError = undefined;
    cron.nextRunAt = computeNextRun(cron.schedule, now);
    cron.updatedAt = nowIso();
  }

  private async markCronRunFailure(cronJobId: string | undefined, error: string): Promise<void> {
    if (!cronJobId) return;
    const cron = this.state.cronJobs.find((c) => c.id === cronJobId);
    if (!cron) return;
    const now = new Date();
    cron.lastRunAt = now.toISOString();
    cron.lastError = error;
    cron.nextRunAt = computeNextRun(cron.schedule, now);
    cron.updatedAt = nowIso();
  }
}

let workflowManagerInstance: WorkflowManager | null = null;
let workflowManagerInitPromise: Promise<WorkflowManager> | null = null;

/** Returns the shared WorkflowManager singleton, initializing on first use. */
export async function getWorkflowManager(): Promise<WorkflowManager> {
  if (workflowManagerInstance) return workflowManagerInstance;
  if (workflowManagerInitPromise) return workflowManagerInitPromise;

  workflowManagerInitPromise = (async () => {
    const manager = new WorkflowManager();
    await manager.init();
    workflowManagerInstance = manager;
    return manager;
  })();

  try {
    return await workflowManagerInitPromise;
  } finally {
    workflowManagerInitPromise = null;
  }
}

/** Shutdown helper used by runtime teardown. */
export async function shutdownWorkflowManager(): Promise<void> {
  if (!workflowManagerInstance) return;
  await workflowManagerInstance.shutdown();
  workflowManagerInstance = null;
}

/** Lightweight cron format validator shared by tools and tests. */
export function validateCronExpression(expr: string): boolean {
  try {
    splitCron(expr);
    matchesCron(expr, new Date());
    return true;
  } catch {
    return false;
  }
}

/** Summarize one workflow run into a compact human-readable line. */
export function summarizeRun(run: WorkflowRun): string {
  const status = run.status === 'completed' ? 'completed' : 'failed';
  const steps = run.stepResults.length;
  return `${run.workflowName} (${run.id}) ${status} with ${steps} step${steps !== 1 ? 's' : ''}`;
}

/** Summarize one tool result for workflow step outputs. */
export function summarizeToolResult(result: ToolResult): string {
  if (result.success) return result.summary || result.output || 'ok';
  return result.error || result.output || 'failed';
}
