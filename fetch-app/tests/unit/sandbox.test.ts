/**
 * @fileoverview Unit tests for the JS sandbox execution environment.
 */

import { describe, it, expect } from 'vitest';
import { executeSandbox } from '../../src/security/sandbox.js';

describe('executeSandbox', () => {
  // ── Basic execution ───────────────────────────────────────────────────────

  describe('basic execution', () => {
    it('executes simple arithmetic', () => {
      const result = executeSandbox('1 + 2');
      expect(result.success).toBe(true);
      expect(result.returnValue).toBe('3');
      expect(result.timedOut).toBe(false);
    });

    it('captures console.log output', () => {
      const result = executeSandbox('console.log("hello"); console.log("world");');
      expect(result.success).toBe(true);
      expect(result.output).toContain('[log] hello');
      expect(result.output).toContain('[log] world');
    });

    it('captures console.warn and console.error', () => {
      const result = executeSandbox('console.warn("caution"); console.error("bad");');
      expect(result.success).toBe(true);
      expect(result.output).toContain('[warn] caution');
      expect(result.output).toContain('[error] bad');
    });

    it('returns undefined for void expressions', () => {
      const result = executeSandbox('console.log("test")');
      expect(result.success).toBe(true);
      expect(result.returnValue).toBeUndefined();
    });

    it('serializes object return values as JSON', () => {
      const result = executeSandbox('({ a: 1, b: "two" })');
      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.returnValue!);
      expect(parsed).toEqual({ a: 1, b: 'two' });
    });
  });

  // ── Safe globals ──────────────────────────────────────────────────────────

  describe('safe globals', () => {
    it('allows JSON.parse and JSON.stringify', () => {
      const result = executeSandbox('JSON.parse(JSON.stringify({ x: 42 })).x');
      expect(result.success).toBe(true);
      expect(result.returnValue).toBe('42');
    });

    it('allows Math operations', () => {
      const result = executeSandbox('Math.max(1, 2, 3)');
      expect(result.success).toBe(true);
      expect(result.returnValue).toBe('3');
    });

    it('allows Date construction', () => {
      const result = executeSandbox('new Date(0).toISOString()');
      expect(result.success).toBe(true);
      expect(result.returnValue).toBe('1970-01-01T00:00:00.000Z');
    });

    it('allows Array methods', () => {
      const result = executeSandbox('[3,1,2].sort().join(",")');
      expect(result.success).toBe(true);
      expect(result.returnValue).toBe('1,2,3');
    });

    it('allows Map and Set', () => {
      const result = executeSandbox('const s = new Set([1,2,2,3]); s.size');
      expect(result.success).toBe(true);
      expect(result.returnValue).toBe('3');
    });

    it('allows user-injected globals', () => {
      const result = executeSandbox('myData.length', {
        globals: { myData: [1, 2, 3, 4] },
      });
      expect(result.success).toBe(true);
      expect(result.returnValue).toBe('4');
    });
  });

  // ── Security: blocked patterns ────────────────────────────────────────────

  describe('blocked patterns', () => {
    it('blocks require()', () => {
      const result = executeSandbox('require("fs")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
      expect(result.error).toContain('require');
    });

    it('blocks dynamic import()', () => {
      const result = executeSandbox('import("fs")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('blocks process access', () => {
      const result = executeSandbox('process.exit(1)');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('blocks globalThis access', () => {
      const result = executeSandbox('globalThis.constructor');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('blocks Function constructor', () => {
      const result = executeSandbox('Function("return 1")()');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('blocks eval', () => {
      const result = executeSandbox('eval("1+1")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('blocks __proto__ access', () => {
      const result = executeSandbox('({}).__proto__.polluted = true');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('blocks child_process', () => {
      const result = executeSandbox('child_process.exec("ls")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });
  });

  // ── Timeout ───────────────────────────────────────────────────────────────

  describe('timeout enforcement', () => {
    it('terminates infinite loops', () => {
      const result = executeSandbox('while(true) {}', { timeoutMs: 100 });
      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.durationMs).toBeLessThan(1000);
    });

    it('allows fast code to complete within timeout', () => {
      const result = executeSandbox('let sum = 0; for (let i = 0; i < 1000; i++) sum += i; sum', {
        timeoutMs: 5000,
      });
      expect(result.success).toBe(true);
      expect(result.returnValue).toBe('499500');
    });
  });

  // ── Output limits ─────────────────────────────────────────────────────────

  describe('output limits', () => {
    it('truncates excessive output', () => {
      const result = executeSandbox(
        'for (let i = 0; i < 10000; i++) console.log("x".repeat(100));',
        { maxOutputSize: 500 },
      );
      expect(result.success).toBe(true);
      expect(result.output.length).toBeLessThanOrEqual(600); // some overhead from line joins
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('captures runtime errors', () => {
      const result = executeSandbox('throw new Error("boom")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('boom');
      expect(result.timedOut).toBe(false);
    });

    it('captures syntax errors', () => {
      const result = executeSandbox('function {{{');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('captures ReferenceError for undefined variables', () => {
      const result = executeSandbox('undefinedVariable');
      expect(result.success).toBe(false);
      expect(result.error).toContain('undefinedVariable');
    });
  });

  // ── Duration tracking ─────────────────────────────────────────────────────

  describe('duration tracking', () => {
    it('reports execution duration', () => {
      const result = executeSandbox('1 + 1');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThan(1000);
    });
  });
});
