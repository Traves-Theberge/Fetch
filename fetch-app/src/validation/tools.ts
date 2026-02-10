/**
 * @fileoverview Tool input validation schemas
 *
 * Zod schemas for validating all Fetch tool inputs.
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
 * Agent selection schema (includes 'auto')
 */
export const AgentSelectionSchema = z.enum(
  ['copilot', 'gemini', 'claude', 'auto'],
  {
    error: 'Agent must be one of: copilot, gemini, claude, auto',
  }
);

// ============================================================================
// Project Template Schemas
// ============================================================================

/**
 * Project template types
 */
export const ProjectTemplateSchema = z.enum([
  'empty',      // Just creates the directory
  'node',       // package.json + basic structure
  'python',     // requirements.txt + basic structure
  'rust',       // Cargo.toml + basic structure
  'go',         // go.mod + basic structure
  'react',      // Vite React template
  'next',       // Next.js template
], {
  error: 'Template must be one of: empty, node, python, rust, go, react, next',
});

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

/**
 * workspace_create - Create a new workspace/project
 */
export const WorkspaceCreateInputSchema = z
  .object({
    /** Name for the new workspace */
    name: z.string()
      .min(1, 'Workspace name is required')
      .max(64, 'Workspace name too long (max 64 characters)')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Workspace name can only contain letters, numbers, hyphens, and underscores')
      .describe('Name for the new workspace'),

    /** Project template to use */
    template: ProjectTemplateSchema.optional()
      .default('empty')
      .describe('Project template: empty, node, python, rust, go, react, next'),

    /** Optional description for the project */
    description: z.string()
      .max(256, 'Description too long (max 256 characters)')
      .optional()
      .describe('Brief description of the project'),

    /** Initialize git repository */
    initGit: z.boolean()
      .optional()
      .default(true)
      .describe('Initialize a git repository (default: true)'),
  })
  .strict()
  .describe('Create a new workspace/project');

/**
 * workspace_delete - Delete a workspace (requires confirmation)
 */
export const WorkspaceDeleteInputSchema = z
  .object({
    /** Name of workspace to delete */
    name: WorkspaceNameSchema.describe('Name of the workspace to delete'),

    /** Confirmation that user wants to delete */
    confirm: z.boolean()
      .refine((val) => val === true, {
        message: 'Must explicitly confirm deletion by setting confirm: true',
      })
      .describe('Must be true to confirm deletion'),
  })
  .strict()
  .describe('Delete a workspace (requires explicit confirmation)');

/**
 * workspace_sync - Sync workspace to GitHub (commit + push)
 */
export const WorkspaceSyncInputSchema = z
  .object({
    /** Workspace to sync (uses active if not specified) */
    name: WorkspaceNameSchema.optional()
      .describe('Workspace to sync (uses active workspace if not specified)'),

    /** Commit message (auto-generated if not provided) */
    message: z.string()
      .max(256, 'Commit message too long (max 256 characters)')
      .optional()
      .describe('Commit message (auto-generated from changes if not provided)'),
  })
  .strict()
  .describe('Sync workspace to GitHub — stages changes, commits, creates repo if needed, and pushes');

/**
 * workspace_publish - Create a new GitHub repo from an existing workspace
 */
export const WorkspacePublishInputSchema = z
  .object({
    /** Workspace to publish (uses active if not specified) */
    name: WorkspaceNameSchema.optional()
      .describe('Workspace to publish (uses active workspace if not specified)'),

    /** Optional description for the GitHub repo */
    description: z.string()
      .max(256, 'Description too long (max 256 characters)')
      .optional()
      .describe('Description for the new GitHub repository'),

    /** Make the repo public (default: private) */
    isPublic: z.boolean()
      .optional()
      .default(false)
      .describe('Make the repository public (default: private)'),
  })
  .strict()
  .describe('Create a new GitHub repository from an existing workspace and push all commits');

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
      .describe('Agent to use. If multiple agents are enabled AND the user has not specified a preference, you MUST call ask_user BEFORE calling this tool. Omit or use "auto" for system default.'),

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
// GitHub Tool Schemas
// ============================================================================

/**
 * github_pr_create - Create a pull request
 */
export const GitHubPRCreateInputSchema = z
  .object({
    /** PR title */
    title: z.string()
      .min(1, 'PR title is required')
      .max(256, 'PR title too long (max 256 characters)')
      .describe('Title for the pull request'),

    /** PR body/description */
    body: z.string()
      .max(4000, 'PR body too long (max 4000 characters)')
      .optional()
      .describe('Description body for the pull request'),

    /** Base branch to merge into */
    base: z.string()
      .max(100, 'Branch name too long')
      .optional()
      .default('main')
      .describe('Base branch to merge into (default: main)'),

    /** Create as draft PR */
    draft: z.boolean()
      .optional()
      .default(true)
      .describe('Create as a draft pull request (default: true)'),

    /** Workspace (uses active if not specified) */
    workspace: WorkspaceNameSchema.optional()
      .describe('Workspace (uses active workspace if not specified)'),
  })
  .strict()
  .describe('Create a pull request on GitHub from the current branch');

/**
 * github_pr_list - List pull requests
 */
export const GitHubPRListInputSchema = z
  .object({
    /** Filter by state */
    state: z.enum(['open', 'closed', 'all'])
      .optional()
      .default('open')
      .describe('Filter by PR state (default: open)'),

    /** Workspace (uses active if not specified) */
    workspace: WorkspaceNameSchema.optional()
      .describe('Workspace (uses active workspace if not specified)'),
  })
  .strict()
  .describe('List pull requests for the current repository');

/**
 * github_pr_view - View a specific pull request
 */
export const GitHubPRViewInputSchema = z
  .object({
    /** PR number */
    number: z.number()
      .int('PR number must be an integer')
      .positive('PR number must be positive')
      .describe('Pull request number'),

    /** Workspace (uses active if not specified) */
    workspace: WorkspaceNameSchema.optional()
      .describe('Workspace (uses active workspace if not specified)'),
  })
  .strict()
  .describe('View details of a specific pull request');

/**
 * github_issue_create - Create an issue
 */
export const GitHubIssueCreateInputSchema = z
  .object({
    /** Issue title */
    title: z.string()
      .min(1, 'Issue title is required')
      .max(256, 'Issue title too long (max 256 characters)')
      .describe('Title for the issue'),

    /** Issue body */
    body: z.string()
      .max(4000, 'Issue body too long (max 4000 characters)')
      .optional()
      .describe('Description body for the issue'),

    /** Labels */
    labels: z.array(z.string().max(50, 'Label too long'))
      .max(10, 'Maximum 10 labels')
      .optional()
      .describe('Labels to apply to the issue'),

    /** Workspace (uses active if not specified) */
    workspace: WorkspaceNameSchema.optional()
      .describe('Workspace (uses active workspace if not specified)'),
  })
  .strict()
  .describe('Create a GitHub issue in the current repository');

/**
 * github_issue_list - List issues
 */
export const GitHubIssueListInputSchema = z
  .object({
    /** Filter by state */
    state: z.enum(['open', 'closed', 'all'])
      .optional()
      .default('open')
      .describe('Filter by issue state (default: open)'),

    /** Filter by assignee */
    assignee: z.string()
      .max(39, 'GitHub username too long')
      .optional()
      .describe('Filter by assignee username'),

    /** Filter by labels */
    labels: z.array(z.string().max(50, 'Label too long'))
      .max(10, 'Maximum 10 labels')
      .optional()
      .describe('Filter by labels'),

    /** Workspace (uses active if not specified) */
    workspace: WorkspaceNameSchema.optional()
      .describe('Workspace (uses active workspace if not specified)'),
  })
  .strict()
  .describe('List issues for the current repository');

/**
 * github_branch_create - Create a new branch
 */
export const GitHubBranchCreateInputSchema = z
  .object({
    /** Branch name */
    name: z.string()
      .min(1, 'Branch name is required')
      .max(100, 'Branch name too long (max 100 characters)')
      .regex(/^[a-zA-Z0-9._/-]+$/, 'Branch name contains invalid characters')
      .describe('Name for the new branch'),

    /** Base branch to create from */
    from: z.string()
      .max(100, 'Branch name too long')
      .optional()
      .describe('Branch to create from (defaults to current branch)'),

    /** Workspace (uses active if not specified) */
    workspace: WorkspaceNameSchema.optional()
      .describe('Workspace (uses active workspace if not specified)'),
  })
  .strict()
  .describe('Create a new git branch and optionally push it to GitHub');

/**
 * github_action_status - Get GitHub Actions status
 */
export const GitHubActionStatusInputSchema = z
  .object({
    /** Workspace (uses active if not specified) */
    workspace: WorkspaceNameSchema.optional()
      .describe('Workspace (uses active workspace if not specified)'),
  })
  .strict()
  .describe('Get the status of recent GitHub Actions workflow runs');

/**
 * github_search_repos - Search GitHub repositories
 */
export const GitHubSearchReposInputSchema = z
  .object({
    /** Search query */
    query: z.string()
      .min(1, 'Search query is required')
      .max(256, 'Search query too long (max 256 characters)')
      .describe('Search query for GitHub repositories'),

    /** Max results */
    limit: z.number()
      .int('Limit must be an integer')
      .min(1, 'Minimum 1 result')
      .max(20, 'Maximum 20 results')
      .optional()
      .default(5)
      .describe('Maximum number of results (default: 5, max: 20)'),
  })
  .strict()
  .describe('Search GitHub repositories');

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
  // Workspace tools (7)
  workspace_list: WorkspaceListInputSchema,
  workspace_select: WorkspaceSelectInputSchema,
  workspace_status: WorkspaceStatusInputSchema,
  workspace_create: WorkspaceCreateInputSchema,
  workspace_delete: WorkspaceDeleteInputSchema,
  workspace_sync: WorkspaceSyncInputSchema,
  workspace_publish: WorkspacePublishInputSchema,
  // Task tools (4)
  task_create: TaskCreateInputSchema,
  task_status: TaskStatusInputSchema,
  task_cancel: TaskCancelInputSchema,
  task_respond: TaskRespondInputSchema,
  // Interaction tools (2)
  ask_user: AskUserInputSchema,
  report_progress: ReportProgressInputSchema,
  // GitHub tools (8)
  github_pr_create: GitHubPRCreateInputSchema,
  github_pr_list: GitHubPRListInputSchema,
  github_pr_view: GitHubPRViewInputSchema,
  github_issue_create: GitHubIssueCreateInputSchema,
  github_issue_list: GitHubIssueListInputSchema,
  github_branch_create: GitHubBranchCreateInputSchema,
  github_action_status: GitHubActionStatusInputSchema,
  github_search_repos: GitHubSearchReposInputSchema,
} as const;

/**
 * Tool name type (union of all tool names)
 */
export type ToolName = keyof typeof ToolInputSchemas;

/**
 * Inferred input types for each tool
 */
export type WorkspaceListInput = z.infer<typeof WorkspaceListInputSchema>;
export type WorkspaceSelectInput = z.infer<typeof WorkspaceSelectInputSchema>;
export type WorkspaceStatusInput = z.infer<typeof WorkspaceStatusInputSchema>;
export type WorkspaceCreateInput = z.infer<typeof WorkspaceCreateInputSchema>;
export type WorkspaceDeleteInput = z.infer<typeof WorkspaceDeleteInputSchema>;
export type WorkspaceSyncInput = z.infer<typeof WorkspaceSyncInputSchema>;
export type WorkspacePublishInput = z.infer<typeof WorkspacePublishInputSchema>;
export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>;
export type TaskStatusInput = z.infer<typeof TaskStatusInputSchema>;
export type TaskCancelInput = z.infer<typeof TaskCancelInputSchema>;
export type TaskRespondInput = z.infer<typeof TaskRespondInputSchema>;
export type AskUserInput = z.infer<typeof AskUserInputSchema>;
export type ReportProgressInput = z.infer<typeof ReportProgressInputSchema>;
export type GitHubPRCreateInput = z.infer<typeof GitHubPRCreateInputSchema>;
export type GitHubPRListInput = z.infer<typeof GitHubPRListInputSchema>;
export type GitHubPRViewInput = z.infer<typeof GitHubPRViewInputSchema>;
export type GitHubIssueCreateInput = z.infer<typeof GitHubIssueCreateInputSchema>;
export type GitHubIssueListInput = z.infer<typeof GitHubIssueListInputSchema>;
export type GitHubBranchCreateInput = z.infer<typeof GitHubBranchCreateInputSchema>;
export type GitHubActionStatusInput = z.infer<typeof GitHubActionStatusInputSchema>;
export type GitHubSearchReposInput = z.infer<typeof GitHubSearchReposInputSchema>;
