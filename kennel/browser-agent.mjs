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
  // Build an accessibility-like tree via DOM evaluation
  // (page.accessibility was removed in Playwright 1.58)
  const snapshot = await page.evaluate(() => {
    const INTERACTIVE_ROLES = new Set([
      'link', 'button', 'textbox', 'checkbox', 'radio',
      'combobox', 'menuitem', 'tab', 'slider', 'spinbutton',
    ]);

    const TAG_ROLE_MAP = {
      A: 'link', BUTTON: 'button', INPUT: 'textbox', TEXTAREA: 'textbox',
      SELECT: 'combobox', H1: 'heading', H2: 'heading', H3: 'heading',
      H4: 'heading', H5: 'heading', H6: 'heading', IMG: 'img',
      NAV: 'navigation', MAIN: 'main', HEADER: 'banner', FOOTER: 'contentinfo',
      ASIDE: 'complementary', FORM: 'form', TABLE: 'table', UL: 'list',
      OL: 'list', LI: 'listitem', P: 'paragraph', SECTION: 'region',
    };

    const INPUT_TYPE_ROLE = {
      checkbox: 'checkbox', radio: 'radio', range: 'slider',
      number: 'spinbutton', submit: 'button', reset: 'button', button: 'button',
    };

    function getRole(el) {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit;
      const tag = el.tagName;
      if (tag === 'INPUT') return INPUT_TYPE_ROLE[el.type] || 'textbox';
      return TAG_ROLE_MAP[tag] || 'generic';
    }

    function getName(el) {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const ref = document.getElementById(labelledBy);
        if (ref) return ref.textContent?.trim() || '';
      }
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
        const id = el.id;
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          if (label) return label.textContent?.trim() || '';
        }
        return el.placeholder || '';
      }
      if (el.tagName === 'IMG') return el.alt || '';
      if (el.tagName === 'A') return el.textContent?.trim() || el.href || '';
      return el.textContent?.trim().slice(0, 80) || '';
    }

    function walk(el) {
      if (!el || el.nodeType !== 1) return null;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return null;

      const role = getRole(el);
      const name = getName(el);
      const children = [];
      for (const child of el.children) {
        const c = walk(child);
        if (c) children.push(c);
      }
      const node = { role, name };
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        node.value = el.value || undefined;
      }
      if (role === 'checkbox' || role === 'radio') {
        node.checked = el.checked;
      }
      if (children.length > 0) node.children = children;
      return node;
    }

    return walk(document.body);
  });

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
  // Always use 'domcontentloaded' — 'networkidle' hangs on SPAs with
  // persistent connections (SSE, websockets, analytics, etc.).
  try {
    await page.goto(params.url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
  } catch (navErr) {
    // If navigation times out, still try to snapshot whatever loaded
    if (!navErr.message?.includes('Timeout')) throw navErr;
  }
  // Brief pause for JS rendering after DOMContentLoaded
  await page.waitForTimeout(1500);
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
        const snapshot = await getAccessibilityTree(page);
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
        const snapshot = await getAccessibilityTree(page);
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
    base64,
    description: `Screenshot captured of ${page.url()} (${buffer.length} bytes)`,
  };
}

// ============================================================================
// Helpers
// ============================================================================

let refCounter = 0;

/**
 * Get a lightweight accessibility-like tree from the page DOM.
 * Replaces the removed page.accessibility.snapshot() API.
 */
async function getAccessibilityTree(page) {
  return page.evaluate(() => {
    const TAG_ROLE_MAP = {
      A: 'link', BUTTON: 'button', INPUT: 'textbox', TEXTAREA: 'textbox',
      SELECT: 'combobox', H1: 'heading', H2: 'heading', H3: 'heading',
      H4: 'heading', H5: 'heading', H6: 'heading', IMG: 'img',
      NAV: 'navigation', MAIN: 'main', HEADER: 'banner', FOOTER: 'contentinfo',
      ASIDE: 'complementary', FORM: 'form', TABLE: 'table', UL: 'list',
      OL: 'list', LI: 'listitem', P: 'paragraph', SECTION: 'region',
    };
    const INPUT_TYPE_ROLE = {
      checkbox: 'checkbox', radio: 'radio', range: 'slider',
      number: 'spinbutton', submit: 'button', reset: 'button', button: 'button',
    };
    function getRole(el) {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit;
      if (el.tagName === 'INPUT') return INPUT_TYPE_ROLE[el.type] || 'textbox';
      return TAG_ROLE_MAP[el.tagName] || 'generic';
    }
    function getName(el) {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;
      if (el.tagName === 'IMG') return el.alt || '';
      if (el.tagName === 'A') return el.textContent?.trim() || el.href || '';
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.placeholder || '';
      return el.textContent?.trim().slice(0, 80) || '';
    }
    function walk(el) {
      if (!el || el.nodeType !== 1) return null;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      const role = getRole(el);
      const name = getName(el);
      const children = [];
      for (const child of el.children) {
        const c = walk(child);
        if (c) children.push(c);
      }
      const node = { role, name };
      if (role === 'checkbox' || role === 'radio') node.checked = el.checked;
      if (children.length > 0) node.children = children;
      return node;
    }
    return walk(document.body);
  });
}

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
    // Close browser and exit — each invocation is a fresh process via docker exec,
    // so keeping the browser alive just prevents the process from exiting.
    try { await browser.close(); } catch {}
    saveState(state);
    process.exit(0);
  }
}

main().catch((e) => {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
});
