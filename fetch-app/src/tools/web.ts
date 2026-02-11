/**
 * @fileoverview Web tools — fetch and search
 *
 * Tool handlers for web content retrieval and search.
 * - `web_fetch`  — Fetches a URL and extracts readable content as markdown
 * - `web_search` — Searches the web via SearXNG (self-hosted meta search)
 *
 * @module tools/web
 * @see {@link ToolRegistry} - Tool registration
 */

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
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

/**
 * Blocked hostname patterns (private networks, localhost)
 */
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
    // Security: block private/internal URLs
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    if (BLOCKED_HOSTS.some((re) => re.test(hostname))) {
      return { success: false, output: '', error: 'Blocked: cannot fetch private/internal URLs', duration: Date.now() - start };
    }

    // Fetch with timeout and redirect limit
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Fetch-Bot/1.0 (AI Assistant; +https://github.com/fetch)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

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
        output: JSON.stringify({ url, contentType: 'json', content: truncated }, null, 2),
        duration: Date.now() - start,
        metadata: { tool: 'web_fetch', url, length: truncated.length },
      };
    }

    if (contentType.includes('text/plain')) {
      const truncated = html.slice(0, MAX_CONTENT_LENGTH);
      return {
        success: true,
        output: JSON.stringify({ url, contentType: 'text', content: truncated }, null, 2),
        duration: Date.now() - start,
        metadata: { tool: 'web_fetch', url, length: truncated.length },
      };
    }

    // HTML: extract readable content
    const dom = new JSDOM(html, { url });

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

    return {
      success: true,
      output: JSON.stringify({
        url,
        title,
        content: truncated,
        truncated: wasTruncated,
        length: truncated.length,
      }, null, 2),
      duration: Date.now() - start,
      metadata: { tool: 'web_fetch', url, title, length: truncated.length, truncated: wasTruncated },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('abort')) {
      return { success: false, output: '', error: `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`, duration: Date.now() - start };
    }
    return { success: false, output: '', error: message, duration: Date.now() - start };
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

    return {
      success: true,
      output: JSON.stringify({ query, count: results.length, results }, null, 2),
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
