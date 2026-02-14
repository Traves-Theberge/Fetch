import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWorkspaceManager = {
  getActiveWorkspaceId: vi.fn(),
  createPullRequest: vi.fn(),
  searchRepos: vi.fn(),
};

vi.mock('../../src/workspace/manager.js', () => ({
  workspaceManager: mockWorkspaceManager,
}));

describe('github tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns workspace error when no workspace is specified or active', async () => {
    mockWorkspaceManager.getActiveWorkspaceId.mockReturnValue(null);

    const { handleGitHubPRCreate } = await import('../../src/tools/github.js');
    const result = await handleGitHubPRCreate({ title: 'PR title', body: 'body' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No workspace specified');
  });

  it('returns formatted repo search output and metadata', async () => {
    mockWorkspaceManager.searchRepos.mockResolvedValue([
      { name: 'repo-one', stars: 10, description: 'First repo' },
      { name: 'repo-two', stars: 8, description: '' },
    ]);

    const { handleGitHubSearchRepos } = await import('../../src/tools/github.js');
    const result = await handleGitHubSearchRepos({ query: 'fetch', limit: 2 });

    expect(result.success).toBe(true);
    expect(result.output).toContain('repo-one');
    expect(result.metadata).toEqual({ repos: expect.any(Array), count: 2 });
  });
});
