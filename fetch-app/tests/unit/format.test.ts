import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatHelp } from '../../src/agent/format.js';

describe('agent/format', () => {
  describe('formatHelp', () => {
    it('includes the version string', async () => {
      const help = formatHelp();
      // VERSION is resolved at import time; just verify it appears
      expect(help).toMatch(/Fetch v[\d.]+ — AI Coding Assistant|Fetch v0\.0\.0/);
    });

    it('lists all expected slash commands', () => {
      const help = formatHelp();
      const expectedCommands = [
        '/stop',
        '/undo',
        '/clear',
        '/help',
        '/status',
        '/version',
        '/usage',
        '/trust',
      ];
      for (const cmd of expectedCommands) {
        expect(help).toContain(cmd);
      }
    });

    it('lists workspace tools', () => {
      const help = formatHelp();
      expect(help).toContain('workspace_list');
      expect(help).toContain('workspace_select');
      expect(help).toContain('workspace_status');
      expect(help).toContain('workspace_create');
      expect(help).toContain('workspace_delete');
      expect(help).toContain('workspace_sync');
      expect(help).toContain('workspace_publish');
    });

    it('lists task tools', () => {
      const help = formatHelp();
      expect(help).toContain('task_create');
      expect(help).toContain('task_status');
      expect(help).toContain('task_cancel');
      expect(help).toContain('task_respond');
    });

    it('lists github tools', () => {
      const help = formatHelp();
      expect(help).toContain('github_pr_create');
      expect(help).toContain('github_pr_list');
      expect(help).toContain('github_pr_view');
      expect(help).toContain('github_issue_create');
      expect(help).toContain('github_issue_list');
      expect(help).toContain('github_branch_create');
      expect(help).toContain('github_action_status');
      expect(help).toContain('github_search_repos');
    });

    it('lists all AI harness names', () => {
      const help = formatHelp();
      expect(help).toContain('Copilot');
      expect(help).toContain('Claude');
      expect(help).toContain('Gemini');
      expect(help).toContain('OpenCode');
      expect(help).toContain('Codex');
    });
  });
});
