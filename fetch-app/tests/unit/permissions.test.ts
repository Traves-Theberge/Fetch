/**
 * @fileoverview Unit tests for security/permissions policy engine.
 */

import { describe, it, expect } from 'vitest';
import { checkToolPermission, type PermissionCheckInput } from '../../src/security/permissions.js';
import { ExecutionMode, ToolPermission } from '../../src/tools/types.js';

describe('checkToolPermission', () => {
  const makeTool = (overrides: Partial<PermissionCheckInput> = {}): PermissionCheckInput => ({
    name: 'test_tool',
    localOnly: false,
    permission: ToolPermission.READ,
    ...overrides,
  });

  describe('local-only enforcement', () => {
    it('allows local-only tools in LOCAL mode', () => {
      const result = checkToolPermission(
        makeTool({ localOnly: true }),
        ExecutionMode.LOCAL,
      );
      expect(result.allowed).toBe(true);
    });

    it('blocks local-only tools in CLOUD mode', () => {
      const result = checkToolPermission(
        makeTool({ localOnly: true }),
        ExecutionMode.CLOUD,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('local-only');
    });

    it('allows non-local tools in CLOUD mode', () => {
      const result = checkToolPermission(
        makeTool({ localOnly: false }),
        ExecutionMode.CLOUD,
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('permission-level enforcement', () => {
    it('allows READ tool when max is READ', () => {
      const result = checkToolPermission(
        makeTool({ permission: ToolPermission.READ }),
        ExecutionMode.LOCAL,
        ToolPermission.READ,
      );
      expect(result.allowed).toBe(true);
    });

    it('blocks WRITE tool when max is READ', () => {
      const result = checkToolPermission(
        makeTool({ permission: ToolPermission.WRITE }),
        ExecutionMode.LOCAL,
        ToolPermission.READ,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('permission');
    });

    it('blocks EXECUTE tool when max is WRITE', () => {
      const result = checkToolPermission(
        makeTool({ permission: ToolPermission.EXECUTE }),
        ExecutionMode.LOCAL,
        ToolPermission.WRITE,
      );
      expect(result.allowed).toBe(false);
    });

    it('allows WRITE tool when max is EXECUTE', () => {
      const result = checkToolPermission(
        makeTool({ permission: ToolPermission.WRITE }),
        ExecutionMode.LOCAL,
        ToolPermission.EXECUTE,
      );
      expect(result.allowed).toBe(true);
    });

    it('defaults maxPermission to EXECUTE when omitted', () => {
      const result = checkToolPermission(
        makeTool({ permission: ToolPermission.EXECUTE }),
        ExecutionMode.LOCAL,
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('combined rules', () => {
    it('blocks local-only + insufficient permission in CLOUD mode', () => {
      const result = checkToolPermission(
        makeTool({ localOnly: true, permission: ToolPermission.EXECUTE }),
        ExecutionMode.CLOUD,
        ToolPermission.READ,
      );
      // local-only check fires first
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('local-only');
    });
  });
});
