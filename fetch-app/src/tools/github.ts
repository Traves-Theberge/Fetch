/**
 * @fileoverview GitHub tools
 *
 * Tool handlers for GitHub operations (PRs, issues, branches, CI, search).
 * All commands execute inside the fetch-kennel container via `dockerExec`.
 *
 * @module tools/github
 * @see {@link WorkspaceManager} - Backend GitHub methods
 *
 * ## Tools
 *
 * - `github_pr_create`    - Create a pull request
 * - `github_pr_list`      - List pull requests
 * - `github_pr_view`      - View a specific pull request
 * - `github_issue_create` - Create a GitHub issue
 * - `github_issue_list`   - List issues
 * - `github_branch_create`- Create a new branch
 * - `github_action_status`- Get GitHub Actions status
 * - `github_search_repos` - Search GitHub repositories
 */

import { workspaceManager } from '../workspace/manager.js';
import {
    GitHubPRCreateInputSchema,
    GitHubPRListInputSchema,
    GitHubPRViewInputSchema,
    GitHubIssueCreateInputSchema,
    GitHubIssueListInputSchema,
    GitHubBranchCreateInputSchema,
    GitHubActionStatusInputSchema,
    GitHubSearchReposInputSchema,
    type GitHubPRCreateInput,
    type GitHubPRListInput,
    type GitHubPRViewInput,
    type GitHubIssueCreateInput,
    type GitHubIssueListInput,
    type GitHubBranchCreateInput,
    type GitHubActionStatusInput,
    type GitHubSearchReposInput,
} from '../validation/tools.js';
import type { ToolResult } from './types.js';

// ============================================================================
// Helper: resolve workspace path
// ============================================================================

async function resolveWorkspacePath(workspace?: string): Promise<string | null> {
    const wsId = workspace ?? workspaceManager.getActiveWorkspaceId();
    if (!wsId) return null;
    return `/workspace/${wsId}`;
}

// ============================================================================
// github_pr_create
// ============================================================================

export async function handleGitHubPRCreate(input: unknown): Promise<ToolResult> {
    const start = Date.now();

    const parseResult = GitHubPRCreateInputSchema.safeParse(input);
    if (!parseResult.success) {
        return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
    }

    const { title, body, base, draft, workspace } = parseResult.data as GitHubPRCreateInput;

    try {
        const wsPath = await resolveWorkspacePath(workspace);
        if (!wsPath) {
            return { success: false, output: '', error: 'No workspace specified and no active workspace selected.', duration: Date.now() - start };
        }

        const result = await workspaceManager.createPullRequest(wsPath, title, body, base, draft);
        return {
            success: true,
            output: JSON.stringify(result, null, 2),
            duration: Date.now() - start,
            metadata: { tool: 'github_pr_create', prUrl: result.url },
        };
    } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err), duration: Date.now() - start };
    }
}

// ============================================================================
// github_pr_list
// ============================================================================

export async function handleGitHubPRList(input: unknown): Promise<ToolResult> {
    const start = Date.now();

    const parseResult = GitHubPRListInputSchema.safeParse(input);
    if (!parseResult.success) {
        return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
    }

    const { state, repo, limit, workspace } = parseResult.data as GitHubPRListInput;

    try {
        const wsPath = await resolveWorkspacePath(workspace);
        if (!wsPath) {
            return { success: false, output: '', error: 'No workspace specified and no active workspace selected.', duration: Date.now() - start };
        }

        const result = await workspaceManager.listPullRequests(wsPath, state, repo, limit);
        return {
            success: true,
            output: JSON.stringify(result, null, 2),
            duration: Date.now() - start,
            metadata: { tool: 'github_pr_list', count: result.length },
        };
    } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err), duration: Date.now() - start };
    }
}

// ============================================================================
// github_pr_view
// ============================================================================

export async function handleGitHubPRView(input: unknown): Promise<ToolResult> {
    const start = Date.now();

    const parseResult = GitHubPRViewInputSchema.safeParse(input);
    if (!parseResult.success) {
        return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
    }

    const { number: prNumber, repo, workspace } = parseResult.data as GitHubPRViewInput;

    try {
        const wsPath = await resolveWorkspacePath(workspace);
        if (!wsPath) {
            return { success: false, output: '', error: 'No workspace specified and no active workspace selected.', duration: Date.now() - start };
        }

        const result = await workspaceManager.viewPullRequest(wsPath, prNumber, repo);
        return {
            success: true,
            output: JSON.stringify(result, null, 2),
            duration: Date.now() - start,
            metadata: { tool: 'github_pr_view', prNumber },
        };
    } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err), duration: Date.now() - start };
    }
}

// ============================================================================
// github_issue_create
// ============================================================================

export async function handleGitHubIssueCreate(input: unknown): Promise<ToolResult> {
    const start = Date.now();

    const parseResult = GitHubIssueCreateInputSchema.safeParse(input);
    if (!parseResult.success) {
        return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
    }

    const { title, body, labels, workspace } = parseResult.data as GitHubIssueCreateInput;

    try {
        const wsPath = await resolveWorkspacePath(workspace);
        if (!wsPath) {
            return { success: false, output: '', error: 'No workspace specified and no active workspace selected.', duration: Date.now() - start };
        }

        const result = await workspaceManager.createIssue(wsPath, title, body, labels);
        return {
            success: true,
            output: JSON.stringify(result, null, 2),
            duration: Date.now() - start,
            metadata: { tool: 'github_issue_create', issueUrl: result.url },
        };
    } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err), duration: Date.now() - start };
    }
}

// ============================================================================
// github_issue_list
// ============================================================================

export async function handleGitHubIssueList(input: unknown): Promise<ToolResult> {
    const start = Date.now();

    const parseResult = GitHubIssueListInputSchema.safeParse(input);
    if (!parseResult.success) {
        return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
    }

    const { state, assignee, labels, workspace } = parseResult.data as GitHubIssueListInput;

    try {
        const wsPath = await resolveWorkspacePath(workspace);
        if (!wsPath) {
            return { success: false, output: '', error: 'No workspace specified and no active workspace selected.', duration: Date.now() - start };
        }

        const result = await workspaceManager.listIssues(wsPath, state, assignee, labels);
        return {
            success: true,
            output: JSON.stringify(result, null, 2),
            duration: Date.now() - start,
            metadata: { tool: 'github_issue_list', count: result.length },
        };
    } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err), duration: Date.now() - start };
    }
}

// ============================================================================
// github_branch_create
// ============================================================================

export async function handleGitHubBranchCreate(input: unknown): Promise<ToolResult> {
    const start = Date.now();

    const parseResult = GitHubBranchCreateInputSchema.safeParse(input);
    if (!parseResult.success) {
        return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
    }

    const { name, from, workspace } = parseResult.data as GitHubBranchCreateInput;

    try {
        const wsPath = await resolveWorkspacePath(workspace);
        if (!wsPath) {
            return { success: false, output: '', error: 'No workspace specified and no active workspace selected.', duration: Date.now() - start };
        }

        const result = await workspaceManager.createBranch(wsPath, name, from);
        return {
            success: true,
            output: JSON.stringify(result, null, 2),
            duration: Date.now() - start,
            metadata: { tool: 'github_branch_create', branch: name },
        };
    } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err), duration: Date.now() - start };
    }
}

// ============================================================================
// github_action_status
// ============================================================================

export async function handleGitHubActionStatus(input: unknown): Promise<ToolResult> {
    const start = Date.now();

    const parseResult = GitHubActionStatusInputSchema.safeParse(input);
    if (!parseResult.success) {
        return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
    }

    const { workspace } = parseResult.data as GitHubActionStatusInput;

    try {
        const wsPath = await resolveWorkspacePath(workspace);
        if (!wsPath) {
            return { success: false, output: '', error: 'No workspace specified and no active workspace selected.', duration: Date.now() - start };
        }

        const result = await workspaceManager.getActionStatus(wsPath);
        return {
            success: true,
            output: JSON.stringify(result, null, 2),
            duration: Date.now() - start,
            metadata: { tool: 'github_action_status', count: result.length },
        };
    } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err), duration: Date.now() - start };
    }
}

// ============================================================================
// github_search_repos
// ============================================================================

export async function handleGitHubSearchRepos(input: unknown): Promise<ToolResult> {
    const start = Date.now();

    const parseResult = GitHubSearchReposInputSchema.safeParse(input);
    if (!parseResult.success) {
        return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
    }

    const { query, limit } = parseResult.data as GitHubSearchReposInput;

    try {
        const result = await workspaceManager.searchRepos(query, limit);
        return {
            success: true,
            output: JSON.stringify(result, null, 2),
            duration: Date.now() - start,
            metadata: { tool: 'github_search_repos', count: result.length },
        };
    } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err), duration: Date.now() - start };
    }
}

// ============================================================================
// Tool Descriptions (for registry)
// ============================================================================

export const githubTools: Record<string, { description: string }> = {
    github_pr_create: { description: 'Create a pull request on GitHub from the current branch' },
    github_pr_list: { description: 'List pull requests for the current repository' },
    github_pr_view: { description: 'View details of a specific pull request including reviews and comments' },
    github_issue_create: { description: 'Create a GitHub issue in the current repository' },
    github_issue_list: { description: 'List issues for the current repository with optional filters' },
    github_branch_create: { description: 'Create a new git branch and push it to GitHub' },
    github_action_status: { description: 'Get the status of recent GitHub Actions workflow runs' },
    github_search_repos: { description: 'Search GitHub repositories by keyword' },
};
