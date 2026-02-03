/**
 * @fileoverview Tool input validation schemas
 *
 * Zod schemas for validating all 8 Fetch v2 tool inputs.
 * Each tool has a corresponding schema that validates its parameters.
 *
 * @module validation/tools
 * @see {@link ToolRegistry} - Tool registration and execution
 * @see {@link CommonSchemas} - Shared validation schemas
 */

import { z } from 'zod';
import {
  WorkspaceNameSchema,
  TaskIdSchema,
  TimeoutSchema,
  GoalSchema,
  QuestionSchema,
  ResponseSchema,
  ProgressMessageSchema,
  PercentageSchema,
  DEFAULT_TIMEOUT_MS,
} from './common.js';

// ============================================================================
// Agent Schemas
// ============================================================================

/**
 * Agent type enum schema
 */
export const AgentTypeSchema = z.enum(['claude', 'gemini', 'copilot'], {
  errorMap: () => ({
    message: 'Agent must be one of: claude, gemini, copilot',
  }),
});

/**
 * Agent selection schema (includes 'auto')
 */
export const AgentSelectionSchema = z.enum(
  ['claude', 'gemini', 'copilot', 'auto'],
  {
    errorMap: () => ({
      message: 'Agent must be one of: claude, gemini, copilot, auto',
    }),
  }
);

// ============================================================================
// Workspace Tool Schemas
// ============================================================================

/**
 * workspace_list - List all available workspaces
 *
 * No parameters required.
 */
export const WorkspaceListInputSchema = z
  .object({})
  .strict()
  .describe('List all available workspaces');

/**
 * workspace_select - Select a workspace to work in
 */
export const WorkspaceSelectInputSchema = z
  .object({
    /** Workspace name to select */
    name: WorkspaceNameSchema.describe('Name of the workspace to select'),
  })
  .strict()
  .describe('Select a workspace to work in');

/**
 * workspace_status - Get status of a workspace
 */
export const WorkspaceStatusInputSchema = z
  .object({
    /** Workspace name (optional, uses active workspace if not specified) */
    name: WorkspaceNameSchema.optional().describe(
      'Workspace name (uses active workspace if not specified)'
    ),
  })
  .strict()
  .describe('Get status of a workspace including git info');

// ============================================================================
// Task Tool Schemas
// ============================================================================

/**
 * task_create - Create a new coding task
 */
export const TaskCreateInputSchema = z
  .object({
    /** What the task should accomplish */
    goal: GoalSchema.describe('Clear description of what to accomplish'),

    /** Which agent to use (default: auto) */
    agent: AgentSelectionSchema.optional()
      .default('auto')
      .describe('Agent to use: claude, gemini, copilot, or auto'),

    /** Workspace name (uses active workspace if not specified) */
    workspace: WorkspaceNameSchema.optional().describe(
      'Target workspace (uses active workspace if not specified)'
    ),

    /** Task timeout in milliseconds (default: 300000 = 5 minutes) */
    timeout: TimeoutSchema.optional()
      .default(DEFAULT_TIMEOUT_MS)
      .describe('Task timeout in milliseconds (default: 5 minutes)'),
  })
  .strict()
  .describe('Create a new coding task to be executed by a harness');

/**
 * task_status - Get status of a task
 */
export const TaskStatusInputSchema = z
  .object({
    /** Task ID (optional, returns current task if not specified) */
    taskId: TaskIdSchema.optional().describe(
      'Task ID (returns current task if not specified)'
    ),
  })
  .strict()
  .describe('Get the current status of a task');

/**
 * task_cancel - Cancel a running task
 */
export const TaskCancelInputSchema = z
  .object({
    /** Task ID to cancel */
    taskId: TaskIdSchema.describe('ID of the task to cancel'),
  })
  .strict()
  .describe('Cancel a running or pending task');

/**
 * task_respond - Send a response to a waiting task
 */
export const TaskRespondInputSchema = z
  .object({
    /** Response to send to the harness */
    response: ResponseSchema.describe('Response to send to the waiting task'),

    /** Task ID (optional, uses current task if not specified) */
    taskId: TaskIdSchema.optional().describe(
      'Task ID (uses current waiting task if not specified)'
    ),
  })
  .strict()
  .describe('Send a response to a task that is waiting for user input');

// ============================================================================
// Interaction Tool Schemas
// ============================================================================

/**
 * ask_user - Ask the user a question
 */
export const AskUserInputSchema = z
  .object({
    /** Question to ask the user */
    question: QuestionSchema.describe('Question to ask the user'),

    /** Optional choices for the user to select from */
    options: z
      .array(z.string().max(100, 'Option too long (max 100 characters)'))
      .max(10, 'Maximum 10 options allowed')
      .optional()
      .describe('Optional list of choices for the user'),
  })
  .strict()
  .describe('Ask the user a question and wait for their response');

/**
 * report_progress - Report progress to the user
 */
export const ReportProgressInputSchema = z
  .object({
    /** Progress message to display */
    message: ProgressMessageSchema.describe('Progress message to display'),

    /** Percentage complete (0-100, optional) */
    percent: PercentageSchema.optional().describe(
      'Percentage complete (0-100)'
    ),
  })
  .strict()
  .describe('Report progress to the user during task execution');

// ============================================================================
// Schema Registry
// ============================================================================

/**
 * Map of tool names to their input schemas
 *
 * This registry is used by the tool executor to validate inputs
 * before calling tool handlers.
 */
export const ToolInputSchemas = {
  workspace_list: WorkspaceListInputSchema,
  workspace_select: WorkspaceSelectInputSchema,
  workspace_status: WorkspaceStatusInputSchema,
  task_create: TaskCreateInputSchema,
  task_status: TaskStatusInputSchema,
  task_cancel: TaskCancelInputSchema,
  task_respond: TaskRespondInputSchema,
  ask_user: AskUserInputSchema,
  report_progress: ReportProgressInputSchema,
} as const;

/**
 * Tool name type (union of all tool names)
 */
export type ToolName = keyof typeof ToolInputSchemas;

/**
 * Array of all tool names
 */
export const TOOL_NAMES: ToolName[] = Object.keys(ToolInputSchemas) as ToolName[];

/**
 * Inferred input types for each tool
 */
export type WorkspaceListInput = z.infer<typeof WorkspaceListInputSchema>;
export type WorkspaceSelectInput = z.infer<typeof WorkspaceSelectInputSchema>;
export type WorkspaceStatusInput = z.infer<typeof WorkspaceStatusInputSchema>;
export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>;
export type TaskStatusInput = z.infer<typeof TaskStatusInputSchema>;
export type TaskCancelInput = z.infer<typeof TaskCancelInputSchema>;
export type TaskRespondInput = z.infer<typeof TaskRespondInputSchema>;
export type AskUserInput = z.infer<typeof AskUserInputSchema>;
export type ReportProgressInput = z.infer<typeof ReportProgressInputSchema>;

/**
 * Union type of all tool inputs
 */
export type ToolInput =
  | WorkspaceListInput
  | WorkspaceSelectInput
  | WorkspaceStatusInput
  | TaskCreateInput
  | TaskStatusInput
  | TaskCancelInput
  | TaskRespondInput
  | AskUserInput
  | ReportProgressInput;
