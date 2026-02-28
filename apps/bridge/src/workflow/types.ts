/**
 * @fileoverview Type contracts for workflow automation and cron scheduling.
 *
 * @module workflow/types
 */

import type { ToolResult } from '../tools/types.js';

/** One step in a reusable workflow definition. */
export interface WorkflowStep {
  /** Friendly step name shown in run output. */
  name: string;
  /** Registered tool name to execute. */
  tool: string;
  /** Tool input payload. */
  args?: Record<string, unknown>;
}

/** Persisted workflow definition. */
export interface WorkflowDefinition {
  /** Stable workflow id. */
  id: string;
  /** Human-friendly workflow name (unique). */
  name: string;
  /** Optional workflow description. */
  description?: string;
  /** Optional workspace to select before executing steps. */
  workspace?: string;
  /** Ordered steps. */
  steps: WorkflowStep[];
  /** ISO created timestamp. */
  createdAt: string;
  /** ISO update timestamp. */
  updatedAt: string;
}

/** Result for one executed workflow step. */
export interface WorkflowStepRun {
  /** Step name. */
  name: string;
  /** Tool that was invoked. */
  tool: string;
  /** Tool result payload. */
  result: ToolResult;
}

/** Persisted workflow run record. */
export interface WorkflowRun {
  /** Stable run id. */
  id: string;
  /** Workflow id being executed. */
  workflowId: string;
  /** Workflow name at execution time. */
  workflowName: string;
  /** Trigger source for this run. */
  trigger: 'manual' | 'cron';
  /** Optional cron job id when trigger=cron. */
  cronJobId?: string;
  /** Start timestamp. */
  startedAt: string;
  /** Completion timestamp (present when terminal). */
  completedAt?: string;
  /** Run status. */
  status: 'running' | 'completed' | 'failed';
  /** Step-level outcomes. */
  stepResults: WorkflowStepRun[];
  /** Optional failure reason. */
  error?: string;
}

/** Persisted cron job for scheduled workflow execution. */
export interface CronJob {
  /** Stable cron job id. */
  id: string;
  /** Human-friendly cron job name (unique). */
  name: string;
  /** Cron expression in 5-field format. */
  schedule: string;
  /** Workflow id target. */
  workflowId: string;
  /** Enabled state. */
  enabled: boolean;
  /** Last run timestamp. */
  lastRunAt?: string;
  /** Next run timestamp as best-effort projection. */
  nextRunAt?: string;
  /** Last execution error. */
  lastError?: string;
  /** ISO created timestamp. */
  createdAt: string;
  /** ISO update timestamp. */
  updatedAt: string;
}

/** Persisted workflow subsystem state document. */
export interface WorkflowState {
  /** Named workflows. */
  workflows: WorkflowDefinition[];
  /** Scheduled cron jobs. */
  cronJobs: CronJob[];
  /** Recent runs. */
  runs: WorkflowRun[];
}
