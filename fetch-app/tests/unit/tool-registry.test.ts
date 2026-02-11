/**
 * @fileoverview Tool Registry Unit Tests
 *
 * Tests the singleton ToolRegistry including built-in tool registration,
 * retrieval, OpenAI format export, and execution.
 */

import { describe, it, expect } from 'vitest';
import { getToolRegistry } from '../../src/tools/registry.js';

describe('Tool Registry', () => {
  // Use the singleton — constructor is private
  const registry = getToolRegistry();

  describe('Tool Registration', () => {
    it('should have all 27 built-in orchestrator tools', () => {
      const tools = registry.list();
      // 7 workspace + 4 task + 2 interaction + 8 github + 2 web + 4 browser = 27
      expect(tools.length).toBeGreaterThanOrEqual(27);
    });

    it('should have workspace tools', () => {
      expect(registry.get('workspace_list')).toBeDefined();
      expect(registry.get('workspace_select')).toBeDefined();
      expect(registry.get('workspace_status')).toBeDefined();
      expect(registry.get('workspace_create')).toBeDefined();
      expect(registry.get('workspace_delete')).toBeDefined();
      expect(registry.get('workspace_sync')).toBeDefined();
      expect(registry.get('workspace_publish')).toBeDefined();
    });

    it('should have task tools', () => {
      expect(registry.get('task_create')).toBeDefined();
      expect(registry.get('task_status')).toBeDefined();
      expect(registry.get('task_cancel')).toBeDefined();
      expect(registry.get('task_respond')).toBeDefined();
    });

    it('should have interaction tools', () => {
      expect(registry.get('ask_user')).toBeDefined();
      expect(registry.get('report_progress')).toBeDefined();
    });

    it('should have GitHub tools', () => {
      expect(registry.get('github_pr_create')).toBeDefined();
      expect(registry.get('github_pr_list')).toBeDefined();
      expect(registry.get('github_pr_view')).toBeDefined();
      expect(registry.get('github_issue_create')).toBeDefined();
      expect(registry.get('github_issue_list')).toBeDefined();
      expect(registry.get('github_branch_create')).toBeDefined();
      expect(registry.get('github_action_status')).toBeDefined();
      expect(registry.get('github_search_repos')).toBeDefined();
    });

    it('should have web tools', () => {
      expect(registry.get('web_fetch')).toBeDefined();
      expect(registry.get('web_search')).toBeDefined();
    });

    it('should have browser tools', () => {
      expect(registry.get('browser_open')).toBeDefined();
      expect(registry.get('browser_snapshot')).toBeDefined();
      expect(registry.get('browser_action')).toBeDefined();
      expect(registry.get('browser_screenshot')).toBeDefined();
    });
  });

  describe('Tool Retrieval', () => {
    it('should get tool by name', () => {
      const tool = registry.get('workspace_list');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('workspace_list');
    });

    it('should return undefined for unknown tool', () => {
      const tool = registry.get('unknown_tool');
      expect(tool).toBeUndefined();
    });

    it('should list all tools', () => {
      const tools = registry.list();
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('OpenAI Format', () => {
    it('should convert to OpenAI format', () => {
      const openaiTools = registry.toOpenAIFormat();

      expect(openaiTools).toBeInstanceOf(Array);
      expect(openaiTools.length).toBeGreaterThan(0);

      const firstTool = openaiTools[0];
      expect(firstTool.type).toBe('function');
      expect(firstTool.function.name).toBeDefined();
      expect(firstTool.function.description).toBeDefined();
      expect(firstTool.function.parameters).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should execute workspace_list tool', async () => {
      const result = await registry.execute('workspace_list', {});

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.output).toBe('string');
    });

    it('should return error for unknown tool', async () => {
      const result = await registry.execute('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.output).toContain('not found');
    });
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      const reg1 = getToolRegistry();
      const reg2 = getToolRegistry();

      expect(reg1).toBe(reg2);
    });
  });
});
