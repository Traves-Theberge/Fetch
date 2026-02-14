/**
 * @fileoverview Browser tool handlers.
 *
 * Executes browser actions inside the kennel Playwright agent and returns
 * snapshots/action outputs to the orchestrator.
 *
 * @module tools/browser
 */

import { pipeline } from '../config/pipeline.js';
import { dockerExec } from '../utils/docker.js';
import {
  BrowserOpenInputSchema,
  BrowserSnapshotInputSchema,
  BrowserActionInputSchema,
  BrowserScreenshotInputSchema,
  type BrowserOpenInput,
  type BrowserActionInput,
} from '../validation/tools.js';
import type { ToolResult } from './types.js';

// ============================================================================
// Constants
// ============================================================================

const BROWSER_TIMEOUT_MS = pipeline.browserTimeout ?? 30_000;
const BROWSER_SCRIPT_PATH = '/usr/local/lib/fetch-browser/browser-agent.mjs';

// ============================================================================
// Helper: run browser command in kennel
// ============================================================================

async function runBrowserCommand(action: string, params: Record<string, unknown> = {}): Promise<string> {
  const payload = JSON.stringify({ action, ...params });
  // Shell-safe: base64 encode the JSON to avoid escaping issues
  const encoded = Buffer.from(payload).toString('base64');
  const result = await dockerExec('node', [BROWSER_SCRIPT_PATH, '--payload', encoded], {
    timeoutMs: BROWSER_TIMEOUT_MS,
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Browser command failed with exit code ${result.exitCode}`);
  }
  return result.stdout;
}

// ============================================================================
// browser_open
// ============================================================================

export async function handleBrowserOpen(input: unknown): Promise<ToolResult> {
  const start = Date.now();

  const parseResult = BrowserOpenInputSchema.safeParse(input);
  if (!parseResult.success) {
    return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
  }

  const { url, waitUntil } = parseResult.data as BrowserOpenInput;

  try {
    const result = await runBrowserCommand('open', { url, waitUntil });
    return {
      success: true,
      output: result,
      duration: Date.now() - start,
      metadata: { tool: 'browser_open', url },
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// browser_snapshot
// ============================================================================

export async function handleBrowserSnapshot(input: unknown): Promise<ToolResult> {
  const start = Date.now();

  const parseResult = BrowserSnapshotInputSchema.safeParse(input);
  if (!parseResult.success) {
    return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
  }

  try {
    const result = await runBrowserCommand('snapshot');
    return {
      success: true,
      output: result,
      duration: Date.now() - start,
      metadata: { tool: 'browser_snapshot' },
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// browser_action
// ============================================================================

export async function handleBrowserAction(input: unknown): Promise<ToolResult> {
  const start = Date.now();

  const parseResult = BrowserActionInputSchema.safeParse(input);
  if (!parseResult.success) {
    return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
  }

  const { action, ref, text, x, y } = parseResult.data as BrowserActionInput;

  try {
    const result = await runBrowserCommand('action', { action, ref, text, x, y });
    return {
      success: true,
      output: result,
      duration: Date.now() - start,
      metadata: { tool: 'browser_action', action, ref },
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// browser_screenshot
// ============================================================================

export async function handleBrowserScreenshot(input: unknown): Promise<ToolResult> {
  const start = Date.now();

  const parseResult = BrowserScreenshotInputSchema.safeParse(input);
  if (!parseResult.success) {
    return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
  }

  try {
    const result = await runBrowserCommand('screenshot');
    return {
      success: true,
      output: result,
      duration: Date.now() - start,
      metadata: { tool: 'browser_screenshot' },
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

// ============================================================================
// Tool Descriptions for Registry
// ============================================================================

export const browserTools: Record<string, { description: string }> = {
  browser_open: {
    description:
      'Open a URL in a headless browser and return an accessibility tree snapshot of the page. The snapshot shows interactive elements with numbered references (e.g., [1], [2]) that can be used with browser_action. Use this for JavaScript-heavy pages, SPAs, or pages that require rendering.',
  },
  browser_snapshot: {
    description:
      'Get the current accessibility tree snapshot of the open browser page. Returns numbered element references for interactive elements. Call this after navigation or page changes to get updated element references.',
  },
  browser_action: {
    description:
      'Perform an action on the browser page. Supported actions: click (click element by ref number), type (type text into element by ref number), scroll_down, scroll_up, back, forward. Use element ref numbers from browser_snapshot.',
  },
  browser_screenshot: {
    description:
      'Capture a screenshot of the current browser page. Returns a base64-encoded PNG image description. Use this to visually verify page state or capture visual information.',
  },
};
