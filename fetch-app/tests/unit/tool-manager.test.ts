/**
 * @fileoverview Unit tests for ToolManager lifecycle, policy, and stats tracking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { ExecutionMode, ToolPermission, DangerLevel, type ToolResult, type ToolContext } from '../../src/tools/types.js';

// ---------------------------------------------------------------------------
// Mock the registry module so we never hit the real constructor (which imports
// pm.js and other modules that may not exist yet).
// ---------------------------------------------------------------------------

interface MockOrchestratorTool {
  name: string;
  description: string;
  handler: (input: unknown, context?: ToolContext) => Promise<ToolResult>;
  schema: z.ZodSchema;
  danger?: DangerLevel;
  isCustom?: boolean;
  localOnly?: boolean;
  permission?: ToolPermission;
}

const mockRegistryMap = new Map<string, MockOrchestratorTool>();

vi.mock('../../src/tools/registry.js', () => {
  class FakeToolRegistry {
    static instance: FakeToolRegistry | undefined;
    static getInstance() {
      if (!FakeToolRegistry.instance) FakeToolRegistry.instance = new FakeToolRegistry();
      return FakeToolRegistry.instance;
    }
    get(name: string) { return mockRegistryMap.get(name); }
    list() { return Array.from(mockRegistryMap.values()); }
    register(t: MockOrchestratorTool) { mockRegistryMap.set(t.name, t); }
    async execute(name: string, args: unknown) {
      const tool = mockRegistryMap.get(name);
      if (!tool) return { success: false, output: 'not found', duration: 0 };
      return tool.handler(args);
    }
    async shutdown() {}
  }
  return {
    ToolRegistry: FakeToolRegistry,
    getToolRegistry: () => FakeToolRegistry.getInstance(),
  };
});

// Import ToolManager AFTER the mock is set up
const { ToolManager } = await import('../../src/tools/manager.js');
const { ToolRegistry } = await import('../../src/tools/registry.js');
type OrchestratorTool = MockOrchestratorTool;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal mock tool. */
function fakeTool(overrides: Partial<OrchestratorTool> = {}): OrchestratorTool {
  return {
    name: overrides.name ?? 'echo',
    description: 'test tool',
    schema: z.object({}),
    handler: async () => ({ success: true, output: 'ok', duration: 1 }),
    danger: DangerLevel.SAFE,
    localOnly: false,
    permission: ToolPermission.READ,
    ...overrides,
  };
}

/** Sets up the shared mock registry map with the given tools. */
function setupRegistry(...tools: OrchestratorTool[]): void {
  mockRegistryMap.clear();
  for (const t of tools) mockRegistryMap.set(t.name, t);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolManager', () => {
  let manager: ToolManager;
  let echoTool: OrchestratorTool;
  let localWriteTool: OrchestratorTool;

  beforeEach(() => {
    ToolManager.resetInstance();

    echoTool = fakeTool({ name: 'echo' });
    localWriteTool = fakeTool({
      name: 'file_write',
      localOnly: true,
      permission: ToolPermission.WRITE,
    });

    setupRegistry(echoTool, localWriteTool);
    manager = ToolManager.getInstance();
  });

  // ── Enable / Disable ──────────────────────────────────────────────────────

  describe('enable / disable lifecycle', () => {
    it('disables a registered tool', () => {
      expect(manager.disable('echo')).toBe(true);
      expect(manager.isDisabled('echo')).toBe(true);
    });

    it('returns false when disabling unknown tool', () => {
      expect(manager.disable('nonexistent')).toBe(false);
    });

    it('re-enables a disabled tool', () => {
      manager.disable('echo');
      expect(manager.enable('echo')).toBe(true);
      expect(manager.isDisabled('echo')).toBe(false);
    });

    it('lists disabled tools', () => {
      manager.disable('echo');
      manager.disable('file_write');
      expect(manager.listDisabled()).toEqual(expect.arrayContaining(['echo', 'file_write']));
    });
  });

  // ── Execution mode ────────────────────────────────────────────────────────

  describe('execution mode', () => {
    it('defaults to LOCAL', () => {
      expect(manager.getExecutionMode()).toBe(ExecutionMode.LOCAL);
    });

    it('can be set to CLOUD', () => {
      manager.setExecutionMode(ExecutionMode.CLOUD);
      expect(manager.getExecutionMode()).toBe(ExecutionMode.CLOUD);
    });
  });

  // ── Execution with policy enforcement ─────────────────────────────────────

  describe('execute()', () => {
    it('executes a normal tool successfully', async () => {
      const result = await manager.execute('echo', {});
      expect(result.success).toBe(true);
      expect(result.output).toBe('ok');
    });

    it('returns error for unknown tool', async () => {
      const result = await manager.execute('missing', {});
      expect(result.success).toBe(false);
      expect(result.output).toContain('not found');
    });

    it('blocks disabled tools', async () => {
      manager.disable('echo');
      const result = await manager.execute('echo', {});
      expect(result.success).toBe(false);
      expect(result.output).toContain('disabled');
    });

    it('blocks local-only tools in CLOUD mode', async () => {
      manager.setExecutionMode(ExecutionMode.CLOUD);
      const result = await manager.execute('file_write', {});
      expect(result.success).toBe(false);
      expect(result.output).toContain('local-only');
    });

    it('allows local-only tools in LOCAL mode', async () => {
      const result = await manager.execute('file_write', {});
      expect(result.success).toBe(true);
    });

    it('blocks tools exceeding max permission', async () => {
      manager.setMaxPermission(ToolPermission.READ);
      const result = await manager.execute('file_write', {});
      expect(result.success).toBe(false);
      expect(result.output).toContain('permission');
    });
  });

  // ── Usage statistics ──────────────────────────────────────────────────────

  describe('usage stats', () => {
    it('tracks successful executions', async () => {
      await manager.execute('echo', {});
      await manager.execute('echo', {});
      const stats = manager.getStats('echo');
      expect(stats).toBeDefined();
      expect(stats!.successCount).toBe(2);
      expect(stats!.errorCount).toBe(0);
    });

    it('tracks failed executions', async () => {
      const failTool = fakeTool({
        name: 'fail',
        handler: async () => ({ success: false, output: 'boom', duration: 1 }),
      });
      setupRegistry(failTool);
      ToolManager.resetInstance();
      const mgr = ToolManager.getInstance();

      await mgr.execute('fail', {});
      const stats = mgr.getStats('fail');
      expect(stats!.errorCount).toBe(1);
    });

    it('computes error rate', async () => {
      const failTool = fakeTool({
        name: 'flaky',
        handler: vi.fn()
          .mockResolvedValueOnce({ success: true, output: 'ok', duration: 1 })
          .mockResolvedValueOnce({ success: false, output: 'err', duration: 1 }),
      });
      setupRegistry(failTool);
      ToolManager.resetInstance();
      const mgr = ToolManager.getInstance();

      await mgr.execute('flaky', {});
      await mgr.execute('flaky', {});
      expect(mgr.getErrorRate('flaky')).toBe(0.5);
    });

    it('returns 0 error rate for unknown tools', () => {
      expect(manager.getErrorRate('nope')).toBe(0);
    });

    it('resets stats', async () => {
      await manager.execute('echo', {});
      manager.resetStats();
      expect(manager.getStats('echo')).toBeUndefined();
    });
  });

  // ── Query helpers ─────────────────────────────────────────────────────────

  describe('query helpers', () => {
    it('lists all tools', () => {
      expect(manager.listAll()).toHaveLength(2);
    });

    it('lists local-only tools', () => {
      const localTools = manager.listLocalOnly();
      expect(localTools).toHaveLength(1);
      expect(localTools[0].name).toBe('file_write');
    });

    it('lists only enabled tools', () => {
      manager.disable('echo');
      const enabled = manager.listEnabled();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].name).toBe('file_write');
    });
  });
});
