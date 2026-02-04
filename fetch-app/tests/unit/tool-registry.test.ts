/**
 * @fileoverview Tool Registry Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry, getToolRegistry } from '../../src/tools/registry.js';

describe('Tool Registry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('Tool Registration', () => {
    it('should have 11 orchestrator tools', () => {
      const toolNames = registry.getToolNames();
      expect(toolNames).toHaveLength(11);
    });

    it('should have workspace tools', () => {
      expect(registry.has('workspace_list')).toBe(true);
      expect(registry.has('workspace_select')).toBe(true);
      expect(registry.has('workspace_status')).toBe(true);
    });

    it('should have task tools', () => {
      expect(registry.has('task_create')).toBe(true);
      expect(registry.has('task_status')).toBe(true);
      expect(registry.has('task_cancel')).toBe(true);
      expect(registry.has('task_respond')).toBe(true);
    });

    it('should have interaction tools', () => {
      expect(registry.has('ask_user')).toBe(true);
      expect(registry.has('report_progress')).toBe(true);
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

    it('should get all tools', () => {
      const tools = registry.getAll();
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

  describe('Claude Format', () => {
    it('should convert to Claude format', () => {
      const claudeTools = registry.toClaudeFormat();
      
      expect(claudeTools).toBeInstanceOf(Array);
      expect(claudeTools.length).toBeGreaterThan(0);
      
      const firstTool = claudeTools[0];
      expect(firstTool.name).toBeDefined();
      expect(firstTool.description).toBeDefined();
      expect(firstTool.input_schema).toBeDefined();
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
      expect(result.error).toContain('Unknown tool');
    });

    it('should validate input schema', async () => {
      const result = await registry.execute('workspace_select', {
        // Missing required 'name' parameter
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
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
