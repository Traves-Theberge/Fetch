/**
 * @fileoverview Zod schemas for all orchestrator tool inputs.
 *
 * This file is the canonical source for accepted tool names and arguments.
 *
 * @module validation/tools
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
  SafePathSchema,
  DEFAULT_TIMEOUT_MS,
} from './common.js';

// ============================================================================
// Agent Schemas
// ============================================================================

/** Allowed agent identifiers for `task_create`. */
export const AGENT_SELECTION_VALUES = ['copilot', 'gemini', 'claude', 'opencode', 'codex', 'auto'] as const;

/** Allowed agent identifiers for `task_create`. */
export const AgentSelectionSchema = z.enum(
  AGENT_SELECTION_VALUES,
  {
    error: 'Agent must be one of: copilot, gemini, claude, opencode, codex, auto',
  }
);

// ============================================================================
// Project Template Schemas
// ============================================================================

/** Allowed workspace templates for `workspace_create`. */
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

/** Input schema for `workspace_list` (no params). */
export const WorkspaceListInputSchema = z
  .object({})
  .strict()
  .describe('List all available workspaces');

/** Input schema for `workspace_select`. */
export const WorkspaceSelectInputSchema = z
  .object({
    /** Workspace name to select */
    name: WorkspaceNameSchema.describe('Name of the workspace to select'),
  })
  .strict()
  .describe('Select a workspace to work in');

/** Input schema for `workspace_status`. */
export const WorkspaceStatusInputSchema = z
  .object({
    /** Workspace name (optional, uses active workspace if not specified) */
    name: WorkspaceNameSchema.optional().describe(
      'Workspace name (uses active workspace if not specified)'
    ),
  })
  .strict()
  .describe('Get status of a workspace including git info');

/** Input schema for `workspace_create`. */
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

/** Input schema for `workspace_delete`. */
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

/** Input schema for `file_delete`. */
export const FileDeleteInputSchema = z
  .object({
    /** Path to the file to delete */
    path: SafePathSchema.describe('Relative path to the file to delete'),

    /** Workspace name (optional, uses active workspace if not specified) */
    workspace: WorkspaceNameSchema.optional().describe(
      'Workspace name (uses active workspace if not specified)'
    ),

    /** Confirmation that user wants to delete */
    confirm: z.boolean()
      .refine((val) => val === true, {
        message: 'Must explicitly confirm deletion by setting confirm: true',
      })
      .describe('Must be true to confirm deletion'),
  })
  .strict()
  .describe('Delete a specific file from a workspace. Use this for simple file removal or deleting untracked files.');

/** Input schema for `folder_delete`. */
export const FolderDeleteInputSchema = z
  .object({
    /** Path to the folder to delete */
    path: SafePathSchema.describe('Relative path to the folder to delete'),

    /** Workspace name (optional, uses active workspace if not specified) */
    workspace: WorkspaceNameSchema.optional().describe(
      'Workspace name (uses active workspace if not specified)'
    ),

    /** Confirmation that user wants to delete */
    confirm: z.boolean()
      .refine((val) => val === true, {
        message: 'Must explicitly confirm deletion by setting confirm: true',
      })
      .describe('Must be true to confirm deletion'),
  })
  .strict()
  .describe('Delete a directory and all its contents. Use this for recursive folder removal.');

/** Input schema for `workspace_sync`. */
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

/** Input schema for `workspace_publish`. */
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

/** Input schema for `task_create`. */
export const TaskCreateInputSchema = z
  .object({
    /** What the task should accomplish */
    goal: GoalSchema.describe('Clear description of what to accomplish'),

    /** Which agent to use (default: auto) */
    agent: AgentSelectionSchema.optional()
      .default('auto')
      .describe('Coding agent to use for specialized work. If multiple agents are enabled AND the user has not specified a preference, you MUST call ask_user BEFORE calling this tool to clarify the choice.'),

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
  .describe('Create a new coding task for complex work (refactoring, features). NEVER use this for simple file deletion or single-file removal.');

/** Input schema for `task_status`. */
export const TaskStatusInputSchema = z
  .object({
    /** Task ID (optional, returns current task if not specified) */
    taskId: TaskIdSchema.optional().describe(
      'Task ID (returns current task if not specified)'
    ),
  })
  .strict()
  .describe('Get the current status of a task');

/** Input schema for `task_cancel`. */
export const TaskCancelInputSchema = z
  .object({
    /** Task ID to cancel */
    taskId: TaskIdSchema.describe('ID of the task to cancel'),
  })
  .strict()
  .describe('Cancel a running or pending task');

/** Input schema for `task_respond`. */
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

/** Input schema for `ask_user`. */
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

/** Input schema for `report_progress`. */
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

/** Input schema for `github_pr_create`. */
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

/** Input schema for `github_pr_list`. */
export const GitHubPRListInputSchema = z
  .object({
    /** Filter by state */
    state: z.enum(['open', 'closed', 'all'])
      .optional()
      .default('open')
      .describe('Filter by PR state (default: open)'),

    /** Target repository (org/repo) */
    repo: z.string()
      .regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, 'Invalid repo format (expected org/repo)')
      .optional()
      .describe('Target repository (e.g. "facebook/react")'),

    /** Result limit */
    limit: z.number()
      .int()
      .positive()
      .max(100)
      .optional()
      .default(10)
      .describe('Maximum number of results to return (max 100)'),

    /** Workspace (uses active if not specified) */
    workspace: WorkspaceNameSchema.optional()
      .describe('Workspace (uses active workspace if not specified)'),
  })
  .strict()
  .describe('List pull requests for the current or specified repository');

/** Input schema for `github_pr_view`. */
export const GitHubPRViewInputSchema = z
  .object({
    /** PR number */
    number: z.number()
      .int('PR number must be an integer')
      .positive('PR number must be positive')
      .describe('Pull request number'),

    /** Target repository (org/repo) */
    repo: z.string()
      .regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, 'Invalid repo format (expected org/repo)')
      .optional()
      .describe('Target repository (e.g. "facebook/react")'),

    /** Workspace (uses active if not specified) */
    workspace: WorkspaceNameSchema.optional()
      .describe('Workspace (uses active workspace if not specified)'),
  })
  .strict()
  .describe('View details of a specific pull request');

/** Input schema for `github_issue_create`. */
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

/** Input schema for `github_issue_list`. */
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

/** Input schema for `github_branch_create`. */
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

/** Input schema for `github_action_status`. */
export const GitHubActionStatusInputSchema = z
  .object({
    /** Workspace (uses active if not specified) */
    workspace: WorkspaceNameSchema.optional()
      .describe('Workspace (uses active workspace if not specified)'),
  })
  .strict()
  .describe('Get the status of recent GitHub Actions workflow runs');

/** Input schema for `github_search_repos`. */
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
// Web Tool Schemas
// ============================================================================

/** Input schema for `web_fetch`. */
export const WebFetchInputSchema = z
  .object({
    /** URL to fetch */
    url: z.string()
      .url('Must be a valid URL')
      .describe('URL to fetch (must be a valid http/https URL)'),

    /** Optional CSS selector to extract specific content */
    selector: z.string()
      .max(200, 'Selector too long (max 200 characters)')
      .optional()
      .describe('Optional CSS selector to extract specific content from the page'),
  })
  .strict()
  .describe('Fetch a web page and extract its readable content as markdown');

/** Input schema for `web_search`. */
export const WebSearchInputSchema = z
  .object({
    /** Search query */
    query: z.string()
      .min(1, 'Search query is required')
      .max(400, 'Search query too long (max 400 characters)')
      .describe('Search query'),

    /** Number of results to return */
    count: z.number()
      .int('Count must be an integer')
      .min(1, 'Minimum 1 result')
      .max(20, 'Maximum 20 results')
      .optional()
      .default(5)
      .describe('Number of results to return (default: 5, max: 20)'),

    /** Search category */
    category: z.enum(['general', 'images', 'news', 'science', 'it'])
      .optional()
      .default('general')
      .describe('Search category (default: general)'),
  })
  .strict()
  .describe('Search the web using the meta search engine');

// ============================================================================
// Browser Tool Schemas
// ============================================================================

/** Input schema for `browser_open`. */
export const BrowserOpenInputSchema = z
  .object({
    /** URL to navigate to */
    url: z.string()
      .url('Must be a valid URL')
      .describe('URL to navigate to in the browser'),

    /** Wait condition before returning */
    waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle'])
      .optional()
      .default('load')
      .describe('Wait condition: load, domcontentloaded, or networkidle'),
  })
  .strict()
  .describe('Open a URL in a headless browser and return an accessibility tree snapshot');

/** Input schema for `browser_snapshot` (no params). */
export const BrowserSnapshotInputSchema = z
  .object({})
  .strict()
  .describe('Get the accessibility tree snapshot of the current browser page');

/** Input schema for `browser_action`. */
export const BrowserActionInputSchema = z
  .object({
    /** Action to perform */
    action: z.enum(['click', 'type', 'scroll_down', 'scroll_up', 'back', 'forward'])
      .describe('Action to perform on the page'),

    /** Element reference number from snapshot (required for click, type) */
    ref: z.number()
      .int('Ref must be an integer')
      .min(0)
      .optional()
      .describe('Element reference number from browser_snapshot (required for click and type)'),

    /** Text to type (required for type action) */
    text: z.string()
      .max(2000, 'Text too long (max 2000 characters)')
      .optional()
      .describe('Text to type into the element (required for type action)'),

    /** X coordinate for click (optional, for coordinate-based clicks) */
    x: z.number().optional().describe('X coordinate for coordinate-based click'),

    /** Y coordinate for click (optional, for coordinate-based clicks) */
    y: z.number().optional().describe('Y coordinate for coordinate-based click'),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasCoordinates = value.x !== undefined || value.y !== undefined;
    const hasCompleteCoordinates = value.x !== undefined && value.y !== undefined;
    if (hasCoordinates && !hasCompleteCoordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: value.x === undefined ? ['x'] : ['y'],
        message: 'Both x and y are required for coordinate-based clicks',
      });
    }

    if (value.action === 'click') {
      if (value.ref === undefined && !hasCompleteCoordinates) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ref'],
          message: 'click requires ref or both x and y coordinates',
        });
      }
      return;
    }

    if (value.action === 'type') {
      if (value.ref === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ref'],
          message: 'type requires ref',
        });
      }
      if (!value.text || value.text.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['text'],
          message: 'type requires non-empty text',
        });
      }
    }
  })
  .describe('Perform an action on the browser page using element references from snapshot');

/** Input schema for `browser_screenshot`. */
export const BrowserScreenshotInputSchema = z
  .object({
    prompt: z
      .string()
      .max(500, 'Prompt too long (max 500 characters)')
      .optional()
      .describe('Optional prompt describing what to analyze in the screenshot (e.g. "describe the colors used on this page")'),
  })
  .strict()
  .describe('Capture and visually analyze a screenshot of the current browser page');

// ============================================================================
// Workflow / Cron / Runtime Tool Schemas
// ============================================================================

/** Input schema for one workflow step definition. */
export const WorkflowStepSchema = z.strictObject({
  /** Step display name */
  name: z.string()
    .min(1, 'Step name is required')
    .max(80, 'Step name too long (max 80 characters)')
    .describe('Friendly step name shown in run output'),

  /** Tool to execute */
  tool: z.string()
    .min(1, 'Step tool is required')
    .max(80, 'Tool name too long (max 80 characters)')
    .regex(/^[a-z0-9_]+$/, 'Tool name must contain lowercase letters, numbers, or underscores')
    .describe('Registered tool name to execute for this step'),

  /** Tool args */
  args: z.record(z.string(), z.unknown())
    .optional()
    .describe('Arguments to send to the step tool'),
});

/** Input schema for string shorthand workflow steps. */
export const WorkflowStepShorthandSchema = z.string()
  .min(1, 'Step shorthand cannot be empty')
  .max(160, 'Step shorthand too long (max 160 characters)')
  .describe('Step shorthand: "tool" or "tool|Step Name"');

/** Input schema for `workflow_create`. */
export const WorkflowCreateInputSchema = z
  .object({
    /** Workflow name */
    name: z.string()
      .min(1, 'Workflow name is required')
      .max(80, 'Workflow name too long (max 80 characters)')
      .describe('Name of the workflow'),

    /** Optional description */
    description: z.string()
      .max(300, 'Description too long (max 300 characters)')
      .optional()
      .describe('Optional workflow description'),

    /** Optional workspace to select before running steps */
    workspace: WorkspaceNameSchema.optional()
      .describe('Optional workspace selected before workflow steps run'),

    /** Ordered workflow steps */
    steps: z.array(z.union([WorkflowStepSchema, WorkflowStepShorthandSchema]))
      .min(1, 'At least one workflow step is required')
      .max(30, 'Maximum 30 workflow steps')
      .describe('Ordered list of workflow steps (object or "tool|name" shorthand)'),
  })
  .strict()
  .describe('Create a reusable multi-step workflow using existing tools');

/** Input schema for `workflow_list`. */
export const WorkflowListInputSchema = z
  .object({
    /** Include recent run history */
    includeRuns: z.boolean()
      .optional()
      .default(false)
      .describe('Include recent workflow runs in the response'),

    /** Number of runs to include when includeRuns=true */
    runLimit: z.number()
      .int('runLimit must be an integer')
      .min(1, 'runLimit must be >= 1')
      .max(50, 'runLimit must be <= 50')
      .optional()
      .default(10)
      .describe('Recent run count to include when includeRuns is true'),
  })
  .strict()
  .describe('List saved workflows and optionally include recent workflow runs');

/** Input schema for `workflow_run`. */
export const WorkflowRunInputSchema = z
  .object({
    /** Workflow name or id */
    workflow: z.string()
      .min(1, 'Workflow is required')
      .max(120, 'Workflow name/id too long')
      .describe('Workflow name or id to execute'),
  })
  .strict()
  .describe('Execute a saved workflow immediately');

/** Input schema for `workflow_delete`. */
export const WorkflowDeleteInputSchema = z
  .object({
    /** Workflow name or id */
    workflow: z.string()
      .min(1, 'Workflow is required')
      .max(120, 'Workflow name/id too long')
      .describe('Workflow name or id to delete'),
  })
  .strict()
  .describe('Delete a saved workflow');

/** Input schema for `cron_create`. */
export const CronCreateInputSchema = z
  .object({
    /** Cron job name */
    name: z.string()
      .min(1, 'Cron job name is required')
      .max(80, 'Cron job name too long (max 80 characters)')
      .describe('Name of the cron job'),

    /** Cron schedule expression */
    schedule: z.string()
      .min(9, 'Cron schedule must be in 5-field format')
      .max(100, 'Cron schedule too long')
      .describe('Cron expression in UTC (minute hour day month weekday)'),

    /** Workflow target */
    workflow: z.string()
      .min(1, 'Workflow is required')
      .max(120, 'Workflow name/id too long')
      .describe('Workflow name or id to trigger'),

    /** Enabled state */
    enabled: z.boolean()
      .optional()
      .default(true)
      .describe('Whether this cron job is enabled'),
  })
  .strict()
  .describe('Create a cron job that executes a saved workflow on schedule (UTC)');

/** Input schema for `cron_list`. */
export const CronListInputSchema = z
  .object({})
  .strict()
  .describe('List configured cron jobs');

/** Input schema for `cron_delete`. */
export const CronDeleteInputSchema = z
  .object({
    /** Cron job name or id */
    job: z.string()
      .min(1, 'Cron job is required')
      .max(120, 'Cron job name/id too long')
      .describe('Cron job name or id to delete'),
  })
  .strict()
  .describe('Delete a cron job');

/** Input schema for `cron_run`. */
export const CronRunInputSchema = z
  .object({
    /** Cron job name or id */
    job: z.string()
      .min(1, 'Cron job is required')
      .max(120, 'Cron job name/id too long')
      .describe('Cron job name or id to run immediately'),
  })
  .strict()
  .describe('Execute a cron job immediately for testing');

/** Input schema for `app_run`. */
export const AppRunInputSchema = z
  .object({
    /** Shell command to run */
    command: z.string()
      .min(1, 'command is required')
      .max(4000, 'command too long')
      .describe('Command to run inside the workspace'),

    /** Workspace target (uses active if omitted) */
    workspace: WorkspaceNameSchema.optional()
      .describe('Workspace to run in (defaults to active workspace)'),

    /** Command timeout in milliseconds */
    timeoutMs: z.number()
      .int('timeoutMs must be an integer')
      .min(1_000, 'timeoutMs must be at least 1000')
      .max(1_800_000, 'timeoutMs too large (max 30 minutes)')
      .optional()
      .default(120_000)
      .describe('Execution timeout in milliseconds (default: 120000)'),
  })
  .strict()
  .describe('Run an application command inside a workspace in Kennel');

/** Input schema for `app_test`. */
export const AppTestInputSchema = z
  .object({
    /** Optional explicit test command */
    command: z.string()
      .min(1, 'command cannot be empty')
      .max(4000, 'command too long')
      .optional()
      .describe('Optional test command override (auto-detected if omitted)'),

    /** Workspace target (uses active if omitted) */
    workspace: WorkspaceNameSchema.optional()
      .describe('Workspace to run tests in (defaults to active workspace)'),

    /** Command timeout in milliseconds */
    timeoutMs: z.number()
      .int('timeoutMs must be an integer')
      .min(1_000, 'timeoutMs must be at least 1000')
      .max(1_800_000, 'timeoutMs too large (max 30 minutes)')
      .optional()
      .default(300_000)
      .describe('Test timeout in milliseconds (default: 300000)'),
  })
  .strict()
  .describe('Run project tests inside a workspace');

/** Input schema for `browser_test`. */
export const BrowserTestInputSchema = z
  .object({
    /** URL to open for test */
    url: z.string()
      .url('Must be a valid URL')
      .describe('URL to validate in browser'),

    /** Navigation wait mode */
    waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle'])
      .optional()
      .default('load')
      .describe('Browser wait condition before assertions'),

    /** Required strings to assert in snapshot output */
    mustInclude: z.array(z.string().min(1, 'mustInclude entries cannot be empty'))
      .max(30, 'Maximum 30 assertions')
      .optional()
      .default([])
      .describe('Case-insensitive substrings that must appear in the browser snapshot'),

    /** Include screenshot payload in metadata */
    includeScreenshot: z.boolean()
      .optional()
      .default(false)
      .describe('Capture and include screenshot data in tool metadata'),
  })
  .strict()
  .describe('Run a lightweight browser smoke test against a URL');

// ============================================================================
// Schema Registry
// ============================================================================

/** Tool name -> input schema map used by the registry execution path. */
export const ToolInputSchemas = {
  // Workspace tools (7)
  workspace_list: WorkspaceListInputSchema,
  workspace_select: WorkspaceSelectInputSchema,
  workspace_status: WorkspaceStatusInputSchema,
  workspace_create: WorkspaceCreateInputSchema,
  workspace_delete: WorkspaceDeleteInputSchema,
  workspace_sync: WorkspaceSyncInputSchema,
  workspace_publish: WorkspacePublishInputSchema,
  file_delete: FileDeleteInputSchema,
  folder_delete: FolderDeleteInputSchema,
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
  // Web tools (2)
  web_fetch: WebFetchInputSchema,
  web_search: WebSearchInputSchema,
  // Browser tools (4)
  browser_open: BrowserOpenInputSchema,
  browser_snapshot: BrowserSnapshotInputSchema,
  browser_action: BrowserActionInputSchema,
  browser_screenshot: BrowserScreenshotInputSchema,
  // Workflow/Cron/Runtime tools (11)
  workflow_create: WorkflowCreateInputSchema,
  workflow_list: WorkflowListInputSchema,
  workflow_run: WorkflowRunInputSchema,
  workflow_delete: WorkflowDeleteInputSchema,
  cron_create: CronCreateInputSchema,
  cron_list: CronListInputSchema,
  cron_delete: CronDeleteInputSchema,
  cron_run: CronRunInputSchema,
  app_run: AppRunInputSchema,
  app_test: AppTestInputSchema,
  browser_test: BrowserTestInputSchema,
} as const;

/** Union of all valid tool names. */
export type ToolName = keyof typeof ToolInputSchemas;

/** Inferred input types per tool schema. */
export type WorkspaceListInput = z.infer<typeof WorkspaceListInputSchema>;
export type WorkspaceSelectInput = z.infer<typeof WorkspaceSelectInputSchema>;
export type WorkspaceStatusInput = z.infer<typeof WorkspaceStatusInputSchema>;
export type WorkspaceCreateInput = z.infer<typeof WorkspaceCreateInputSchema>;
export type WorkspaceDeleteInput = z.infer<typeof WorkspaceDeleteInputSchema>;
export type FileDeleteInput = z.infer<typeof FileDeleteInputSchema>;
export type FolderDeleteInput = z.infer<typeof FolderDeleteInputSchema>;
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
export type WebFetchInput = z.infer<typeof WebFetchInputSchema>;
export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;
export type BrowserOpenInput = z.infer<typeof BrowserOpenInputSchema>;
export type BrowserSnapshotInput = z.infer<typeof BrowserSnapshotInputSchema>;
export type BrowserActionInput = z.infer<typeof BrowserActionInputSchema>;
export type BrowserScreenshotInput = z.infer<typeof BrowserScreenshotInputSchema>;
export type WorkflowCreateInput = z.infer<typeof WorkflowCreateInputSchema>;
export type WorkflowListInput = z.infer<typeof WorkflowListInputSchema>;
export type WorkflowRunInput = z.infer<typeof WorkflowRunInputSchema>;
export type WorkflowDeleteInput = z.infer<typeof WorkflowDeleteInputSchema>;
export type CronCreateInput = z.infer<typeof CronCreateInputSchema>;
export type CronListInput = z.infer<typeof CronListInputSchema>;
export type CronDeleteInput = z.infer<typeof CronDeleteInputSchema>;
export type CronRunInput = z.infer<typeof CronRunInputSchema>;
export type AppRunInput = z.infer<typeof AppRunInputSchema>;
export type AppTestInput = z.infer<typeof AppTestInputSchema>;
export type BrowserTestInput = z.infer<typeof BrowserTestInputSchema>;
