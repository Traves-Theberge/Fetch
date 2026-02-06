import { describe, it, expect } from 'vitest';
import path from 'path';
import { IdentityLoader } from '../../src/identity/loader.js';

describe('IdentityLoader', () => {
  // Point to the REAL data directory for integration testing
  // tests/unit -> tests -> fetch-app -> Fetch -> data
  const realDataDir = path.resolve(__dirname, '../../../data/identity');
  const realAgentsDir = path.resolve(__dirname, '../../../data/agents');

  it('should load COLLAR.md correctly', () => {
    const loader = new IdentityLoader(realDataDir, realAgentsDir);
    const identity = loader.load();

    expect(identity.name).toBe('Fetch');
    expect(identity.role).toContain('Orchestrator');
    expect(identity.voice?.tone).toBeDefined();
    
    // Check directives
    expect(identity.directives?.primary).toBeDefined();
    expect(identity.directives?.primary?.length).toBeGreaterThan(0);
    // It loads the full line including "**Obey:** ..."
    const primaryStr = JSON.stringify(identity.directives?.primary);
    expect(primaryStr).toContain('Obey');
  });

  it('should load ALPHA.md correctly', () => {
    const loader = new IdentityLoader(realDataDir, realAgentsDir);
    const identity = loader.load();

    expect(identity.context?.owner).toBe('Traves');
  });

  it('should load pack members from agent files', () => {
    const loader = new IdentityLoader(realDataDir, realAgentsDir);
    const identity = loader.load();

    expect(identity.pack).toBeDefined();
    expect(identity.pack!.length).toBeGreaterThanOrEqual(3);
    
    const claude = identity.pack!.find(m => m.harness === 'claude');
    expect(claude).toBeDefined();
    expect(claude!.name).toBe('Claude');
    expect(claude!.triggers.length).toBeGreaterThan(0);
    expect(claude!.fallback_priority).toBe(1);
  });

  it('should handle missing directory gracefully', () => {
    const loader = new IdentityLoader('/path/to/nowhere', '/path/to/nowhere/agents');
    const identity = loader.load();
    expect(identity).toEqual({});
  });
});
