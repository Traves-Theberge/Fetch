#!/usr/bin/env node
/**
 * Fetch Browser Agent — Playwright-based headless browser for the kennel.
 *
 * Receives commands as base64-encoded JSON via --payload flag.
 * Maintains a persistent browser instance via a Unix socket lock file.
 *
 * Actions: open, snapshot, action, screenshot
 *
 * Outputs JSON to stdout for the bridge to consume.
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';

const STATE_FILE = '/tmp/fetch-browser-state.json';
const LOCK_FILE = '/tmp/fetch-browser.lock';

// ============================================================================
// State Management
// ============================================================================

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    }
  } catch { /* ignore */ }
  return { wsEndpoint: null };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state));
}

// ============================================================================
// Browser Management
// ============================================================================

async function getBrowser(state) {
  // Try to reconnect to existing browser
  if (state.wsEndpoint) {
    try {
      const browser = await chromium.connectOverCDP(state.wsEndpoint);
      return browser;
    } catch {
      // Browser died, start fresh
    }
  }

  // Launch new browser
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
    ],
  });

  state.wsEndpoint = browser.contexts()[0]?.browser()?.isConnected()
    ? null : null;

  return browser;
}

async function getPage(browser) {
  const contexts = browser.contexts();
  if (contexts.length > 0) {
    const pages = contexts[0].pages();
    if (pages.length > 0) return pages[0];
  }
  const context = contexts.length > 0 ? contexts[0] : await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Fetch-Browser/1.0',
  });
  return context.newPage();
}

// ============================================================================
// Accessibility Tree Snapshot
// ============================================================================

async function getSnapshot(page) {
  // Get the accessibility tree
  const snapshot = await page.accessibility.snapshot();
  if (!snapshot) {
    return { url: page.url(), title: await page.title(), elements: [], text: 'Page has no accessible content' };
  }

  let refCounter = 0;
  const elements = [];

  function walk(node, depth = 0) {
    const indent = '  '.repeat(depth);
    const isInteractive = ['link', 'button', 'textbox', 'checkbox', 'radio',
      'combobox', 'menuitem', 'tab', 'slider', 'spinbutton'].includes(node.role);

    let line = '';
    if (isInteractive) {
      const ref = refCounter++;
      elements.push({ ref, role: node.role, name: node.name || '' });
      line = `${indent}[${ref}] ${node.role}: ${node.name || '(unnamed)'}`;
      if (node.value) line += ` = "${node.value}"`;
      if (node.checked !== undefined) line += ` [${node.checked ? 'checked' : 'unchecked'}]`;
    } else {
      if (node.name && node.role !== 'generic' && node.role !== 'none') {
        line = `${indent}${node.role}: ${node.name}`;
      }
    }

    const lines = line ? [line] : [];

    if (node.children) {
      for (const child of node.children) {
        lines.push(...walk(child, depth + (line ? 1 : 0)));
      }
    }

    return lines;
  }

  const treeLines = walk(snapshot);

  return {
    url: page.url(),
    title: await page.title(),
    elementCount: elements.length,
    elements,
    tree: treeLines.join('\n'),
  };
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleOpen(browser, params) {
  const page = await getPage(browser);
  await page.goto(params.url, {
    waitUntil: params.waitUntil || 'load',
    timeout: 20000,
  });
  const snapshot = await getSnapshot(page);
  return snapshot;
}

async function handleSnapshot(browser) {
  const page = await getPage(browser);
  const snapshot = await getSnapshot(page);
  return snapshot;
}

async function handleAction(browser, params) {
  const page = await getPage(browser);
  const { action, ref, text, x, y } = params;

  switch (action) {
    case 'click': {
      if (ref !== undefined) {
        // Click by accessibility ref — find the element
        const snapshot = await page.accessibility.snapshot();
        const element = findElementByRef(snapshot, ref);
        if (!element) {
          return { success: false, error: `Element ref [${ref}] not found` };
        }
        // Use locator based on role and name
        const locator = page.getByRole(element.role, { name: element.name });
        await locator.first().click({ timeout: 5000 });
      } else if (x !== undefined && y !== undefined) {
        await page.mouse.click(x, y);
      } else {
        return { success: false, error: 'Click requires ref or x,y coordinates' };
      }
      break;
    }
    case 'type': {
      if (ref !== undefined && text) {
        const snapshot = await page.accessibility.snapshot();
        const element = findElementByRef(snapshot, ref);
        if (!element) {
          return { success: false, error: `Element ref [${ref}] not found` };
        }
        const locator = page.getByRole(element.role, { name: element.name });
        await locator.first().fill(text, { timeout: 5000 });
      } else {
        return { success: false, error: 'Type requires ref and text' };
      }
      break;
    }
    case 'scroll_down':
      await page.mouse.wheel(0, 500);
      break;
    case 'scroll_up':
      await page.mouse.wheel(0, -500);
      break;
    case 'back':
      await page.goBack({ timeout: 10000 });
      break;
    case 'forward':
      await page.goForward({ timeout: 10000 });
      break;
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }

  // Return updated snapshot after action
  await page.waitForTimeout(500); // Brief pause for page updates
  const updatedSnapshot = await getSnapshot(page);
  return { success: true, ...updatedSnapshot };
}

async function handleScreenshot(browser) {
  const page = await getPage(browser);
  const buffer = await page.screenshot({ fullPage: false, type: 'png' });
  const base64 = buffer.toString('base64');
  return {
    url: page.url(),
    title: await page.title(),
    format: 'png',
    size: buffer.length,
    base64: base64.slice(0, 1000) + (base64.length > 1000 ? '...(truncated)' : ''),
    description: `Screenshot captured of ${page.url()} (${buffer.length} bytes)`,
  };
}

// ============================================================================
// Helpers
// ============================================================================

let refCounter = 0;

function findElementByRef(snapshot, targetRef) {
  refCounter = 0;
  return _findRef(snapshot, targetRef);
}

function _findRef(node, targetRef) {
  const isInteractive = ['link', 'button', 'textbox', 'checkbox', 'radio',
    'combobox', 'menuitem', 'tab', 'slider', 'spinbutton'].includes(node.role);

  if (isInteractive) {
    if (refCounter === targetRef) {
      return { role: node.role, name: node.name || '' };
    }
    refCounter++;
  }

  if (node.children) {
    for (const child of node.children) {
      const found = _findRef(child, targetRef);
      if (found) return found;
    }
  }

  return null;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const payloadArg = process.argv.find((_, i, arr) => arr[i - 1] === '--payload');
  if (!payloadArg) {
    console.error(JSON.stringify({ error: 'Missing --payload argument' }));
    process.exit(1);
  }

  let command;
  try {
    command = JSON.parse(Buffer.from(payloadArg, 'base64').toString('utf8'));
  } catch (e) {
    console.error(JSON.stringify({ error: 'Invalid payload: ' + e.message }));
    process.exit(1);
  }

  const state = loadState();
  let browser;

  try {
    browser = await getBrowser(state);
  } catch (e) {
    // Retry once with fresh browser
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
    } catch (e2) {
      console.log(JSON.stringify({ error: 'Failed to launch browser: ' + e2.message }));
      process.exit(1);
    }
  }

  try {
    let result;

    switch (command.action) {
      case 'open':
        result = await handleOpen(browser, command);
        break;
      case 'snapshot':
        result = await handleSnapshot(browser);
        break;
      case 'action':
        result = await handleAction(browser, command);
        break;
      case 'screenshot':
        result = await handleScreenshot(browser);
        break;
      default:
        result = { error: `Unknown action: ${command.action}` };
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }));
  } finally {
    // Don't close browser — keep it alive for subsequent commands
    // It will be cleaned up when the container restarts
    saveState(state);
  }
}

main().catch((e) => {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
});
