/**
 * @fileoverview HTTP client for TPMJS.com (The NPM for AI Tools).
 *
 * Provides search and manifest-fetching capabilities against the TPMJS
 * registry to enable dynamic MCP tool discovery and installation.
 *
 * @module tools/tpmjs_client
 */

import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

/** A single tool entry returned by the TPMJS search API. */
export interface TpmjsSearchResult {
  name: string;
  description: string;
  version: string;
  author?: string;
  downloads?: number;
}

/** Parameter definition within a TPMJS tool manifest. */
export interface TpmjsToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
  default?: unknown;
}

/** MCP server configuration within a TPMJS tool manifest. */
export interface TpmjsMcpConfig {
  /** MCP server command (e.g. "npx", "uvx") */
  command: string;
  /** Arguments passed to the command */
  args?: string[];
  /** Environment variables for the MCP server process */
  env?: Record<string, string>;
}

/** Full tool manifest returned by TPMJS for a specific package. */
export interface TpmjsToolManifest {
  name: string;
  description: string;
  version: string;
  author?: string;
  /** Shell command to execute (simple tools) */
  command?: string;
  /** Working directory override */
  cwd?: string;
  /** MCP protocol configuration (advanced tools) */
  mcp?: TpmjsMcpConfig;
  /** Tool parameters/arguments */
  parameters?: TpmjsToolParameter[];
}

/** Search response envelope from the TPMJS API. */
export interface TpmjsSearchResponse {
  results: TpmjsSearchResult[];
  total: number;
}

// ============================================================================
// Client
// ============================================================================

const DEFAULT_BASE_URL = 'https://tpmjs.com/api';
const REQUEST_TIMEOUT_MS = 15_000;

export interface TpmjsClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * HTTP client for the TPMJS tool registry.
 *
 * Supports searching for tools and fetching individual tool manifests.
 */
export class TpmjsClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options?: TpmjsClientOptions) {
    this.baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  /**
   * Search the TPMJS registry for tools matching a query string.
   */
  async search(query: string, limit = 20): Promise<TpmjsSearchResponse> {
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    logger.debug('TPMJS search', { url });

    try {
      const response = await this.fetchWithTimeout(url);
      if (!response.ok) {
        throw new Error(`TPMJS search failed: ${response.status} ${response.statusText}`);
      }
      const data = await response.json() as TpmjsSearchResponse;
      return data;
    } catch (error) {
      logger.error('TPMJS search error', { query, error });
      return { results: [], total: 0 };
    }
  }

  /**
   * Fetch the full manifest for a specific tool by package name.
   *
   * @param name - Package name, e.g. "@tpmjs/discord-read" or "bash-tool"
   */
  async getManifest(name: string): Promise<TpmjsToolManifest | null> {
    const url = `${this.baseUrl}/packages/${encodeURIComponent(name)}`;
    logger.debug('TPMJS manifest fetch', { url, name });

    try {
      const response = await this.fetchWithTimeout(url);
      if (!response.ok) {
        if (response.status === 404) {
          logger.warn(`TPMJS package not found: ${name}`);
          return null;
        }
        throw new Error(`TPMJS manifest fetch failed: ${response.status} ${response.statusText}`);
      }
      const data = await response.json() as TpmjsToolManifest;
      return data;
    } catch (error) {
      logger.error('TPMJS manifest fetch error', { name, error });
      return null;
    }
  }

  /**
   * Fetch manifests for a batch of tool names. Returns only successfully resolved manifests.
   */
  async getManifests(names: string[]): Promise<TpmjsToolManifest[]> {
    const results = await Promise.allSettled(
      names.map((name) => this.getManifest(name)),
    );

    const manifests: TpmjsToolManifest[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        manifests.push(result.value);
      }
    }
    return manifests;
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
