/**
 * @fileoverview GitHub tool handlers.
 *
 * Wraps workspace GitHub operations for pull requests, issues, branches,
 * workflow status, and repository search.
 *
 * @module tools/github
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
        const output = `Created ${draft ? 'draft ' : ''}PR #${result.number}: "${title}" -> ${base} (${result.url})`;
        return {
            success: true,
            output,
            summary: `Created PR #${result.number}`,
            duration: Date.now() - start,
            metadata: result,
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
        const lines = result.map((pr: Record<string, unknown>) =>
            `#${pr.number} "${pr.title}" (${pr.state}, by ${(pr.author as Record<string, unknown>)?.login ?? pr.author})`
        );
        const output = result.length > 0
            ? `${result.length} ${state ?? 'open'} PR${result.length !== 1 ? 's' : ''}:\n${lines.join('\n')}`
            : `No ${state ?? 'open'} PRs found`;
        return {
            success: true,
            output,
            summary: `${result.length} ${state ?? 'open'} PRs`,
            duration: Date.now() - start,
            metadata: { prs: result, count: result.length },
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
        // PR view returns rich data — provide a readable summary but keep full data in metadata
        const pr = result as Record<string, unknown>;
        const parts: string[] = [`PR #${prNumber}: "${pr.title}" (${pr.state})`];
        if (pr.headRefName && pr.baseRefName) parts.push(`${pr.headRefName} -> ${pr.baseRefName}`);
        if (pr.isDraft) parts.push('DRAFT');
        const commits = pr.commits as unknown[] | undefined;
        if (commits?.length) parts.push(`${commits.length} commit${commits.length !== 1 ? 's' : ''}`);
        const comments = pr.comments as unknown[] | undefined;
        if (comments?.length) parts.push(`${comments.length} comment${comments.length !== 1 ? 's' : ''}`);
        const reviews = pr.reviews as unknown[] | undefined;
        if (reviews?.length) parts.push(`${reviews.length} review${reviews.length !== 1 ? 's' : ''}`);
        if (pr.body) {
          const bodyStr = String(pr.body);
          parts.push(`\nDescription: ${bodyStr.length > 200 ? bodyStr.slice(0, 197) + '...' : bodyStr}`);
        }
        return {
            success: true,
            output: parts.join(' - '),
            summary: `PR #${prNumber}: ${pr.state}`,
            duration: Date.now() - start,
            metadata: result,
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
        const output = `Created issue #${result.number}: "${title}" (${result.url})`;
        return {
            success: true,
            output,
            summary: `Created issue #${result.number}`,
            duration: Date.now() - start,
            metadata: result,
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
        const lines = result.map((issue: Record<string, unknown>) => {
            const issueLbls = issue.labels as Array<Record<string, unknown>> | undefined;
            const labelStr = issueLbls?.length ? ` [${issueLbls.map(l => l.name).join(', ')}]` : '';
            return `#${issue.number} "${issue.title}"${labelStr}`;
        });
        const output = result.length > 0
            ? `${result.length} ${state ?? 'open'} issue${result.length !== 1 ? 's' : ''}:\n${lines.join('\n')}`
            : `No ${state ?? 'open'} issues found`;
        return {
            success: true,
            output,
            summary: `${result.length} ${state ?? 'open'} issues`,
            duration: Date.now() - start,
            metadata: { issues: result, count: result.length },
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
        const output = `Created branch ${result.branch} from ${result.from}${result.pushed ? ', pushed to origin' : ''}`;
        return {
            success: true,
            output,
            summary: `Created branch ${result.branch}`,
            duration: Date.now() - start,
            metadata: result,
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
        const lines = result.map((run: Record<string, unknown>) => {
            const icon = run.conclusion === 'success' ? 'pass' : run.conclusion === 'failure' ? 'fail' : String(run.status);
            return `${run.name} (${icon})`;
        });
        const output = result.length > 0
            ? `${result.length} recent workflow run${result.length !== 1 ? 's' : ''}:\n${lines.join('\n')}`
            : 'No recent workflow runs';
        return {
            success: true,
            output,
            summary: `${result.length} workflow runs`,
            duration: Date.now() - start,
            metadata: { runs: result, count: result.length },
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
        const lines = result.map((repo: Record<string, unknown>) =>
            `${repo.name} (${repo.stars}★) - ${repo.description || 'no description'}`
        );
        const output = result.length > 0
            ? `${result.length} repo${result.length !== 1 ? 's' : ''} found for "${query}":\n${lines.join('\n')}`
            : `No repos found for "${query}"`;
        return {
            success: true,
            output,
            summary: `${result.length} repos found`,
            duration: Date.now() - start,
            metadata: { repos: result, count: result.length },
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
