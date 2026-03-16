import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('harness/registry', () => {
  let registry: typeof import('../../src/harness/registry.js');

  beforeEach(async () => {
    vi.clearAllMocks();
    registry = await import('../../src/harness/registry.js');
  });

  it('returns adapter for registered agent types', () => {
    const adapter = registry.getAdapter('claude');
    expect(adapter).toBeDefined();
    expect(adapter.agent).toBe('claude');
  });

  it('throws for unregistered agent type', () => {
    expect(() => registry.getAdapter('nonexistent' as 'claude')).toThrow(
      'No harness adapter found'
    );
  });

  it('hasAdapter returns true for registered agents', () => {
    expect(registry.hasAdapter('claude')).toBe(true);
    expect(registry.hasAdapter('gemini')).toBe(true);
    expect(registry.hasAdapter('copilot')).toBe(true);
    expect(registry.hasAdapter('codex')).toBe(true);
    expect(registry.hasAdapter('opencode')).toBe(true);
  });

  it('hasAdapter returns false for unknown agents', () => {
    expect(registry.hasAdapter('unknown' as 'claude')).toBe(false);
  });

  it('listAgents returns all registered types', () => {
    const agents = registry.listAgents();
    expect(agents).toContain('claude');
    expect(agents).toContain('gemini');
    expect(agents).toContain('copilot');
    expect(agents).toContain('opencode');
    expect(agents).toContain('codex');
    expect(agents.length).toBe(5);
  });

  it('getAllAdapters returns all adapter instances', () => {
    const adapters = registry.getAllAdapters();
    expect(adapters.length).toBe(5);
    adapters.forEach((a) => {
      expect(a.agent).toBeDefined();
    });
  });

  it('getDefaultAgent returns claude', () => {
    expect(registry.getDefaultAgent()).toBe('claude');
  });
});
