/**
 * @fileoverview Tool Argument Validation Schemas
 * 
 * Zod schemas for runtime validation of tool arguments.
 * Provides type safety, coercion, and constraint checking.
 * 
 * @module tools/schemas
 */

import { z } from 'zod';

// =============================================================================
// COMMON SCHEMAS
// =============================================================================

/**
 * Safe path schema - validates paths don't escape workspace
 */
const SafePath = z.string()
  .min(1, 'Path cannot be empty')
  .refine(
    (path) => !path.includes('..'),
    'Path cannot contain ".." (directory traversal not allowed)'
  )
  .refine(
    (path) => !path.startsWith('/') || path.startsWith('/workspace'),
    'Absolute paths must be within /workspace'
  );

/**
 * Positive integer schema with coercion
 */
const PositiveInt = z.coerce.number().int().positive();

/**
 * Non-negative integer schema with coercion
 */
const NonNegativeInt = z.coerce.number().int().nonnegative();

// =============================================================================
// FILE TOOL SCHEMAS
// =============================================================================

export const ReadFileSchema = z.object({
  path: SafePath.describe('Path to the file (relative to workspace root)'),
  start_line: PositiveInt.optional().describe('Start line number (1-indexed)'),
  end_line: PositiveInt.optional().describe('End line number (1-indexed, inclusive)'),
}).refine(
  (data) => {
    if (data.start_line && data.end_line) {
      return data.start_line <= data.end_line;
    }
    return true;
  },
  { message: 'start_line must be less than or equal to end_line' }
);

export const WriteFileSchema = z.object({
  path: SafePath.describe('Path to the file (relative to workspace root)'),
  content: z.string().describe('Content to write to the file'),
});

export const EditFileSchema = z.object({
  path: SafePath.describe('Path to the file (relative to workspace root)'),
  old_string: z.string().min(1, 'old_string cannot be empty')
    .describe('Exact text to find and replace'),
  new_string: z.string().describe('Text to replace with (can be empty to delete)'),
});

export const ListDirectorySchema = z.object({
  path: SafePath.optional().default('.')
    .describe('Directory path (relative to workspace root)'),
  recursive: z.boolean().optional().default(false)
    .describe('Whether to list recursively'),
  max_depth: NonNegativeInt.optional().default(3)
    .describe('Maximum depth for recursive listing'),
});

export const SearchFilesSchema = z.object({
  pattern: z.string().min(1, 'Search pattern cannot be empty')
    .describe('Glob pattern to match files'),
  path: SafePath.optional().default('.')
    .describe('Directory to search in'),
  include_content: z.boolean().optional().default(false)
    .describe('Include file contents in results'),
});

// =============================================================================
// CODE TOOL SCHEMAS
// =============================================================================

export const RepoMapSchema = z.object({
  depth: NonNegativeInt.optional().default(2)
    .describe('Directory depth to include in map'),
  include_files: z.boolean().optional().default(true)
    .describe('Include file names in output'),
});

export const FindDefinitionSchema = z.object({
  symbol: z.string().min(1, 'Symbol name cannot be empty')
    .describe('Name of the symbol to find'),
  path: SafePath.optional()
    .describe('File path to search in (optional, searches all if not provided)'),
});

export const FindReferencesSchema = z.object({
  symbol: z.string().min(1, 'Symbol name cannot be empty')
    .describe('Name of the symbol to find references to'),
  path: SafePath.optional()
    .describe('File path to search in (optional)'),
});

export const GetDiagnosticsSchema = z.object({
  path: SafePath.optional()
    .describe('File path to check (optional, checks all if not provided)'),
});

// =============================================================================
// SHELL TOOL SCHEMAS
// =============================================================================

export const RunCommandSchema = z.object({
  command: z.string()
    .min(1, 'Command cannot be empty')
    .max(10000, 'Command too long')
    .describe('Shell command to execute'),
  timeout: NonNegativeInt.optional().default(30000)
    .describe('Timeout in milliseconds'),
  cwd: SafePath.optional()
    .describe('Working directory for command'),
});

export const RunTestsSchema = z.object({
  pattern: z.string().optional()
    .describe('Test pattern to run (optional)'),
  path: SafePath.optional()
    .describe('Path to test file or directory'),
});

export const RunLintSchema = z.object({
  path: SafePath.optional()
    .describe('Path to lint (optional, lints all if not provided)'),
  fix: z.boolean().optional().default(false)
    .describe('Automatically fix issues'),
});

// =============================================================================
// GIT TOOL SCHEMAS
// =============================================================================

export const GitStatusSchema = z.object({
  // No required parameters
}).strict();

export const GitDiffSchema = z.object({
  path: SafePath.optional()
    .describe('File path to diff (optional, shows all changes if not provided)'),
  staged: z.boolean().optional().default(false)
    .describe('Show staged changes only'),
});

export const GitCommitSchema = z.object({
  message: z.string()
    .min(1, 'Commit message cannot be empty')
    .max(500, 'Commit message too long')
    .describe('Commit message'),
  files: z.array(SafePath).optional()
    .describe('Specific files to commit (optional, commits all staged if not provided)'),
});

export const GitUndoSchema = z.object({
  path: SafePath.optional()
    .describe('File path to undo (optional, undoes all if not provided)'),
});

export const GitBranchSchema = z.object({
  name: z.string().optional()
    .describe('Branch name (optional, lists branches if not provided)'),
  create: z.boolean().optional().default(false)
    .describe('Create the branch'),
  checkout: z.boolean().optional().default(false)
    .describe('Checkout the branch'),
});

export const GitLogSchema = z.object({
  limit: NonNegativeInt.optional().default(10)
    .describe('Number of commits to show'),
  path: SafePath.optional()
    .describe('File path to filter history'),
});

export const GitStashSchema = z.object({
  action: z.enum(['push', 'pop', 'list', 'drop']).optional().default('push')
    .describe('Stash action to perform'),
  message: z.string().optional()
    .describe('Stash message (for push action)'),
});

// =============================================================================
// CONTROL TOOL SCHEMAS
// =============================================================================

export const AskUserSchema = z.object({
  question: z.string()
    .min(1, 'Question cannot be empty')
    .max(2000, 'Question too long')
    .describe('Question to ask the user'),
  options: z.array(z.string()).optional()
    .describe('Multiple choice options'),
});

export const ReportProgressSchema = z.object({
  message: z.string()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message too long')
    .describe('Progress update message'),
  percent_complete: NonNegativeInt.max(100).optional()
    .describe('Percentage complete (0-100)'),
});

export const TaskCompleteSchema = z.object({
  summary: z.string()
    .min(1, 'Summary cannot be empty')
    .max(5000, 'Summary too long')
    .describe('Summary of completed work'),
  files_modified: z.array(SafePath).optional()
    .describe('List of modified files'),
});

export const TaskBlockedSchema = z.object({
  reason: z.string()
    .min(1, 'Reason cannot be empty')
    .max(2000, 'Reason too long')
    .describe('Why the task is blocked'),
  suggestion: z.string().optional()
    .describe('Suggested resolution'),
});

export const ThinkSchema = z.object({
  thought: z.string()
    .min(1, 'Thought cannot be empty')
    .max(5000, 'Thought too long')
    .describe('Internal reasoning or planning'),
});

// =============================================================================
// INFERRED TYPES
// =============================================================================

/** Inferred type for read_file arguments */
export type ReadFileArgs = z.infer<typeof ReadFileSchema>;
/** Inferred type for write_file arguments */
export type WriteFileArgs = z.infer<typeof WriteFileSchema>;
/** Inferred type for edit_file arguments */
export type EditFileArgs = z.infer<typeof EditFileSchema>;
/** Inferred type for list_directory arguments */
export type ListDirectoryArgs = z.infer<typeof ListDirectorySchema>;
/** Inferred type for search_files arguments */
export type SearchFilesArgs = z.infer<typeof SearchFilesSchema>;
/** Inferred type for run_command arguments */
export type RunCommandArgs = z.infer<typeof RunCommandSchema>;
/** Inferred type for git_commit arguments */
export type GitCommitArgs = z.infer<typeof GitCommitSchema>;
/** Inferred type for ask_user arguments */
export type AskUserArgs = z.infer<typeof AskUserSchema>;
/** Inferred type for task_complete arguments */
export type TaskCompleteArgs = z.infer<typeof TaskCompleteSchema>;

// =============================================================================
// SCHEMA REGISTRY
// =============================================================================

/**
 * Registry mapping tool names to their Zod schemas
 */
export const toolSchemas: Record<string, z.ZodSchema> = {
  // File tools
  read_file: ReadFileSchema,
  write_file: WriteFileSchema,
  edit_file: EditFileSchema,
  list_directory: ListDirectorySchema,
  search_files: SearchFilesSchema,
  
  // Code tools
  repo_map: RepoMapSchema,
  find_definition: FindDefinitionSchema,
  find_references: FindReferencesSchema,
  get_diagnostics: GetDiagnosticsSchema,
  
  // Shell tools
  run_command: RunCommandSchema,
  run_tests: RunTestsSchema,
  run_lint: RunLintSchema,
  
  // Git tools
  git_status: GitStatusSchema,
  git_diff: GitDiffSchema,
  git_commit: GitCommitSchema,
  git_undo: GitUndoSchema,
  git_branch: GitBranchSchema,
  git_log: GitLogSchema,
  git_stash: GitStashSchema,
  
  // Control tools
  ask_user: AskUserSchema,
  report_progress: ReportProgressSchema,
  task_complete: TaskCompleteSchema,
  task_blocked: TaskBlockedSchema,
  think: ThinkSchema,
};

// =============================================================================
// VALIDATION
// =============================================================================

/** Result of tool argument validation */
export interface ToolValidationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  issues?: z.ZodIssue[];
}

/**
 * Validates tool arguments against the schema.
 */
export function validateToolArgs<T = unknown>(
  toolName: string, 
  args: unknown
): ToolValidationResult<T> {
  const schema = toolSchemas[toolName];
  
  if (!schema) {
    return {
      success: false,
      error: `No schema found for tool: ${toolName}`,
    };
  }

  try {
    const result = schema.safeParse(args);
    
    if (result.success) {
      return {
        success: true,
        data: result.data as T,
      };
    }

    // Format error messages nicely
    const issues = result.error.issues;
    const errorMessages = issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    });

    return {
      success: false,
      error: `Invalid arguments for ${toolName}: ${errorMessages.join('; ')}`,
      issues,
    };
  } catch (err) {
    return {
      success: false,
      error: `Validation error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
