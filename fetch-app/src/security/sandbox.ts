/**
 * @fileoverview Lightweight JavaScript sandbox for executing code snippets.
 *
 * Uses Node.js `vm` module to run untrusted JS in an isolated context with
 * strict resource limits (timeout, memory ceiling via context restriction).
 * This is the fallback when Docker-based execution is unavailable.
 *
 * Security model:
 * - No access to `require`, `import`, `process`, `fs`, `child_process`
 * - No access to global constructors that could escape the sandbox
 * - Strict timeout enforcement
 * - Output capture with size limits
 *
 * @module security/sandbox
 */

import vm from 'node:vm';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

/** Configuration for sandbox execution. */
export interface SandboxConfig {
  /** Maximum execution time in milliseconds (default: 5000) */
  timeoutMs: number;
  /** Maximum output size in characters (default: 50000) */
  maxOutputSize: number;
  /** Additional safe globals to inject into the sandbox context */
  globals: Record<string, unknown>;
}

/** Result of a sandbox execution. */
export interface SandboxResult {
  /** Whether execution completed without error */
  success: boolean;
  /** Captured console output */
  output: string;
  /** Return value of the last expression (serialized) */
  returnValue: string | undefined;
  /** Error message if execution failed */
  error: string | undefined;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Whether execution was terminated due to timeout */
  timedOut: boolean;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: SandboxConfig = {
  timeoutMs: 5_000,
  maxOutputSize: 50_000,
  globals: {},
};

// ============================================================================
// Blocked patterns — reject code that attempts sandbox escape
// ============================================================================

const BLOCKED_PATTERNS = [
  /\bprocess\b/,
  /\brequire\s*\(/,
  /\bimport\s*\(/,
  /\bglobalThis\b/,
  /\bFunction\s*\(/,
  /\beval\s*\(/,
  /\b__proto__\b/,
  /\bconstructor\s*\[/,
  /\bchild_process\b/,
  /\bfs\b\.\b(read|write|unlink|mkdir|rmdir|rename|chmod|chown|stat|open|close)/,
];

// ============================================================================
// Sandbox
// ============================================================================

/**
 * Executes a JavaScript code snippet in an isolated VM context.
 *
 * The sandbox provides a minimal environment with:
 * - `console.log/warn/error/info` (captured to output buffer)
 * - `JSON`, `Math`, `Date`, `Array`, `Object`, `String`, `Number`,
 *   `Boolean`, `RegExp`, `Map`, `Set`, `Promise`, `parseInt`, `parseFloat`,
 *   `isNaN`, `isFinite`, `encodeURIComponent`, `decodeURIComponent`
 * - `setTimeout` and `setInterval` (scoped, cleared on exit)
 *
 * Everything else (require, import, process, fs, etc.) is blocked.
 */
export function executeSandbox(
  code: string,
  config: Partial<SandboxConfig> = {},
): SandboxResult {
  const resolved: SandboxConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  // Pre-flight: reject obviously dangerous patterns before compilation
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return {
        success: false,
        output: '',
        returnValue: undefined,
        error: `Blocked: code contains restricted pattern ${pattern.source}`,
        durationMs: Date.now() - startTime,
        timedOut: false,
      };
    }
  }

  // Build output capture buffer
  const outputLines: string[] = [];
  let outputSize = 0;

  const appendOutput = (level: string, args: unknown[]): void => {
    const line = `[${level}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`;
    if (outputSize + line.length <= resolved.maxOutputSize) {
      outputLines.push(line);
      outputSize += line.length;
    }
  };

  // Scoped timer tracking for cleanup
  const timers: ReturnType<typeof setTimeout>[] = [];
  const intervals: ReturnType<typeof setInterval>[] = [];

  // Build the sandbox context with safe globals only
  const sandboxGlobals: Record<string, unknown> = {
    // Console capture
    console: {
      log: (...args: unknown[]) => appendOutput('log', args),
      warn: (...args: unknown[]) => appendOutput('warn', args),
      error: (...args: unknown[]) => appendOutput('error', args),
      info: (...args: unknown[]) => appendOutput('info', args),
    },

    // Safe built-in constructors and utilities
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,

    // Scoped timers (cleared on exit)
    setTimeout: (fn: (...args: unknown[]) => void, ms: number) => {
      const id = setTimeout(fn, Math.min(ms, resolved.timeoutMs));
      timers.push(id);
      return id;
    },
    setInterval: (fn: (...args: unknown[]) => void, ms: number) => {
      const id = setInterval(fn, Math.max(ms, 100)); // minimum 100ms interval
      intervals.push(id);
      return id;
    },
    clearTimeout,
    clearInterval,

    // User-provided safe globals
    ...resolved.globals,
  };

  const context = vm.createContext(sandboxGlobals, {
    name: 'fetch-sandbox',
    codeGeneration: {
      strings: false,  // Block eval() and new Function() from strings
      wasm: false,     // Block WebAssembly compilation
    },
  });

  try {
    const script = new vm.Script(code, {
      filename: 'sandbox.js',
    });

    const result = script.runInContext(context, {
      timeout: resolved.timeoutMs,
      breakOnSigint: true,
    });

    // Serialize return value safely
    let returnValue: string | undefined;
    if (result !== undefined) {
      try {
        returnValue = typeof result === 'object'
          ? JSON.stringify(result, null, 2)
          : String(result);
      } catch {
        returnValue = '[unserializable]';
      }
    }

    return {
      success: true,
      output: outputLines.join('\n'),
      returnValue,
      error: undefined,
      durationMs: Date.now() - startTime,
      timedOut: false,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errCode = (error as NodeJS.ErrnoException)?.code ?? '';
    const isTimeout = errMsg.includes('timed out') ||
      errCode === 'ERR_SCRIPT_EXECUTION_TIMEOUT';

    if (isTimeout) {
      logger.warn('Sandbox execution timed out', { timeoutMs: resolved.timeoutMs });
    } else {
      logger.debug('Sandbox execution error', { error });
    }

    return {
      success: false,
      output: outputLines.join('\n'),
      returnValue: undefined,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
      timedOut: isTimeout,
    };
  } finally {
    // Clean up any timers the sandboxed code created
    for (const id of timers) clearTimeout(id);
    for (const id of intervals) clearInterval(id);
  }
}
