import { describe, it, expect } from 'vitest';
import path from 'path';
import { IdentityLoader } from '../../src/identity/loader.js';

describe('IdentityLoader', () => {
  // Point to the REAL data directory for integration testing
  // tests/unit -> tests -> fetch-app -> Fetch -> data
  const realDataDir = path.resolve(__dirname, '../../../data/identity');

  it('should load COLLAR.md correctly', () => {
    const loader = new IdentityLoader(realDataDir);
    const identity = loader.load();

    expect(identity.name).toBe('Fetch');
    expect(identity.role).toContain('Canid'); // From 'Autonomous Software Engineering Canid'
    expect(identity.voice?.tone).toBeDefined();
    
    // Check directives
    expect(identity.directives?.primary).toBeDefined();
    expect(identity.directives?.primary?.length).toBeGreaterThan(0);
    // It loads the full line including "**Obey:** ..."
    const primaryStr = JSON.stringify(identity.directives?.primary);
    expect(primaryStr).toContain('Obey');
  });

  it('should load ALPHA.md correctly', () => {
    const loader = new IdentityLoader(realDataDir);
    const identity = loader.load();

    expect(identity.context?.owner).toBe('Traves');
  });

  it('should handle missing directory gracefully', () => {
    const loader = new IdentityLoader('/path/to/nowhere');
    const identity = loader.load();
    expect(identity).toEqual({});
  });
});
