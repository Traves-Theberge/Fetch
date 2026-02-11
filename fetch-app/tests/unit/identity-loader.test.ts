import { describe, it, expect } from 'vitest';
import path from 'path';
import { IdentityLoader } from '../../src/identity/loader.js';

describe('IdentityLoader', () => {
  // Point to the REAL data directory for integration testing
  // tests/unit -> tests -> fetch-app -> Fetch -> data
  const realDataDir = path.resolve(__dirname, '../../../data/identity');
  const realAgentsDir = path.resolve(__dirname, '../../../data/agents');

  it('should load COLLAR.md correctly', async () => {
    const loader = new IdentityLoader(realDataDir, realAgentsDir);
    const identity = await loader.load();

    expect(identity.name).toBe('Fetch');
    expect(identity.role).toContain('Orchestrator');
    expect(identity.emoji).toBeDefined();
    expect(identity.voice?.tone).toBeDefined();

    // Check directives
    expect(identity.directives?.primary).toBeDefined();
    expect(identity.directives?.primary?.length).toBeGreaterThan(0);
    expect(identity.directives?.secondary).toBeDefined();
    expect(identity.directives?.secondary?.length).toBeGreaterThan(0);
    expect(identity.directives?.behavioral).toBeDefined();
    expect(identity.directives?.behavioral?.length).toBeGreaterThan(0);
    // It loads the full line including "**Obey:** ..."
    const primaryStr = JSON.stringify(identity.directives?.primary);
    expect(primaryStr).toContain('Obey');
  });

  it('should load ALPHA.md correctly', async () => {
    const loader = new IdentityLoader(realDataDir, realAgentsDir);
    const identity = await loader.load();

    expect(identity.context?.owner).toBe('Traves');
  });

  it('should return empty pack when agents directory is missing', async () => {
    const loader = new IdentityLoader(realDataDir, realAgentsDir);
    const identity = await loader.load();

    // No agents directory = no pack members (graceful degradation)
    expect(identity.pack === undefined || identity.pack.length === 0).toBe(true);
  });

  it('should handle missing directory gracefully', async () => {
    const loader = new IdentityLoader('/path/to/nowhere', '/path/to/nowhere/agents');
    const identity = await loader.load();
    expect(identity).toEqual({});
  });
});
