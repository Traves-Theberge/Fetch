/**
 * @fileoverview Web fetch and search tool handlers.
 *
 * Implements public web retrieval (`web_fetch`) and SearXNG search (`web_search`).
 *
 * @module tools/web
 */

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { lookup } from 'dns/promises';
import net from 'net';
import { pipeline } from '../config/pipeline.js';
import {
  WebFetchInputSchema,
  WebSearchInputSchema,
  type WebFetchInput,
  type WebSearchInput,
} from '../validation/tools.js';
import type { ToolResult } from './types.js';

// ============================================================================
// Constants
// ============================================================================

const MAX_CONTENT_LENGTH = 50_000;
const FETCH_TIMEOUT_MS = 30_000;

/** Host patterns blocked to reduce private-network fetch risk. */
const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
];

const MAX_REDIRECTS = 5;

// Shared turndown instance
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// ============================================================================
// web_fetch
// ============================================================================

export async function handleWebFetch(input: unknown): Promise<ToolResult> {
  const start = Date.now();

  const parseResult = WebFetchInputSchema.safeParse(input);
  if (!parseResult.success) {
    return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
  }

  const { url, selector } = parseResult.data as WebFetchInput;

  try {
    // Security: allow only public http(s) URLs and re-check each redirect hop.
    await assertPublicUrl(url);

    // Fetch with timeout and redirect limit
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let currentUrl = url;
    let response: Response | null = null;

    try {
      for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        await assertPublicUrl(currentUrl);
        response = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'Fetch-Bot/1.0 (AI Assistant; +https://github.com/fetch)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        const status = response.status;
        if (status < 300 || status >= 400) {
          break;
        }

        const location = response.headers.get('location');
        if (!location) {
          return { success: false, output: '', error: 'Redirect response missing Location header', duration: Date.now() - start };
        }

        if (redirectCount >= MAX_REDIRECTS) {
          return { success: false, output: '', error: `Too many redirects (max ${MAX_REDIRECTS})`, duration: Date.now() - start };
        }

        currentUrl = new URL(location, currentUrl).toString();
      }
    } finally {
      clearTimeout(timeout);
    }

    if (!response) {
      return { success: false, output: '', error: 'No response received', duration: Date.now() - start };
    }

    if (!response.ok) {
      return { success: false, output: '', error: `HTTP ${response.status}: ${response.statusText}`, duration: Date.now() - start };
    }

    const contentType = response.headers.get('content-type') || '';
    const html = await response.text();

    // If JSON or plain text, return directly
    if (contentType.includes('application/json')) {
      const truncated = html.slice(0, MAX_CONTENT_LENGTH);
      return {
        success: true,
        output: JSON.stringify({ url: currentUrl, contentType: 'json', content: truncated }, null, 2),
        duration: Date.now() - start,
        metadata: { tool: 'web_fetch', url: currentUrl, length: truncated.length },
      };
    }

    if (contentType.includes('text/plain')) {
      const truncated = html.slice(0, MAX_CONTENT_LENGTH);
      return {
        success: true,
        output: JSON.stringify({ url: currentUrl, contentType: 'text', content: truncated }, null, 2),
        duration: Date.now() - start,
        metadata: { tool: 'web_fetch', url: currentUrl, length: truncated.length },
      };
    }

    // HTML: extract readable content
    const dom = new JSDOM(html, { url: currentUrl });

    let content: string;
    if (selector) {
      // Extract specific element
      const el = dom.window.document.querySelector(selector);
      if (!el) {
        return { success: false, output: '', error: `Selector "${selector}" not found on page`, duration: Date.now() - start };
      }
      content = turndown.turndown(el.innerHTML);
    } else {
      // Use Readability for main content extraction
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article?.content) {
        content = turndown.turndown(article.content);
      } else {
        // Fallback: convert entire body
        const body = dom.window.document.body;
        content = body ? turndown.turndown(body.innerHTML) : '';
      }
    }

    // Truncate if needed
    const truncated = content.slice(0, MAX_CONTENT_LENGTH);
    const wasTruncated = content.length > MAX_CONTENT_LENGTH;

    const title = dom.window.document.title || '';

    // Build a concise summary for the LLM
    const summaryTitle = title || new URL(url).hostname;
    const summarySnippet = truncated.replace(/\s+/g, ' ').slice(0, 120).trim();
    const summary = `Fetched "${summaryTitle}" (${truncated.length} chars)${wasTruncated ? ' [truncated]' : ''}: ${summarySnippet}...`;

    return {
      success: true,
      output: JSON.stringify({
        url,
        finalUrl: currentUrl,
        title,
        content: truncated,
        truncated: wasTruncated,
        length: truncated.length,
      }, null, 2),
      summary,
      duration: Date.now() - start,
      metadata: { tool: 'web_fetch', url: currentUrl, title, length: truncated.length, truncated: wasTruncated },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('abort')) {
      return { success: false, output: '', error: `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`, duration: Date.now() - start };
    }
    return { success: false, output: '', error: message, duration: Date.now() - start };
  }
}

function isBlockedIp(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map((n) => Number(n));
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }

  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fe80:')) return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    return false;
  }

  return false;
}

async function assertPublicUrl(rawUrl: string): Promise<void> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Blocked: only http/https URLs are allowed');
  }
  await assertPublicHostname(parsed.hostname);
}

async function assertPublicHostname(hostname: string): Promise<void> {
  if (BLOCKED_HOSTS.some((re) => re.test(hostname))) {
    throw new Error('Blocked: cannot fetch private/internal URLs');
  }

  if (net.isIP(hostname) > 0) {
    if (isBlockedIp(hostname)) {
      throw new Error('Blocked: hostname resolves to private/internal IP');
    }
    return;
  }

  const resolved = await lookup(hostname, { all: true, verbatim: true });
  if (resolved.length === 0) {
    throw new Error('Blocked: could not resolve hostname');
  }
  if (resolved.some((record) => isBlockedIp(record.address))) {
    throw new Error('Blocked: hostname resolves to private/internal IP');
  }
}

// ============================================================================
// web_search
// ============================================================================

export async function handleWebSearch(input: unknown): Promise<ToolResult> {
  const start = Date.now();

  const parseResult = WebSearchInputSchema.safeParse(input);
  if (!parseResult.success) {
    return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
  }

  const { query, count, category } = parseResult.data as WebSearchInput;

  try {
    const searxngUrl = pipeline.searxngUrl;

    // Query SearXNG JSON API
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      categories: category || 'general',
      language: 'en',
      safesearch: '1',
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(`${searxngUrl}/search?${params}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { success: false, output: '', error: `SearXNG error: HTTP ${response.status}`, duration: Date.now() - start };
    }

    const data = await response.json() as { results?: Array<{ title: string; url: string; content: string; engine: string }> };
    const results = (data.results || []).slice(0, count).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      engine: r.engine,
    }));

    const topTitles = results.slice(0, 3).map(r => r.title).join(', ');
    const summary = `Found ${results.length} results for "${query}": ${topTitles}`;

    return {
      success: true,
      output: JSON.stringify({ query, count: results.length, results }, null, 2),
      summary,
      duration: Date.now() - start,
      metadata: { tool: 'web_search', query, resultCount: results.length },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('abort')) {
      return { success: false, output: '', error: 'Search timed out', duration: Date.now() - start };
    }
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return { success: false, output: '', error: 'SearXNG not available. Ensure the searxng container is running (docker compose up -d).', duration: Date.now() - start };
    }
    return { success: false, output: '', error: message, duration: Date.now() - start };
  }
}

// ============================================================================
// Tool Descriptions for Registry
// ============================================================================

export const webTools: Record<string, { description: string }> = {
  web_fetch: {
    description:
      'Fetch a web page and extract its readable content as markdown. Returns the page title, extracted text content, and URL. Supports CSS selectors to extract specific elements. Use this to read documentation, articles, blog posts, or any public web page.',
  },
  web_search: {
    description:
      'Search the web using a self-hosted meta search engine. Returns titles, URLs, and snippets for the top results. Use this to find documentation, research topics, discover packages, or look up error messages.',
  },
};
