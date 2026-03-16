/**
 * @fileoverview TPMJS tool loader — reads fetch.config.json and dynamically
 * registers tools fetched from the TPMJS registry.
 *
 * Supports two tool types:
 * - **shell tools**: Simple command-based tools (uses existing CustomToolDefinition path)
 * - **mcp tools**: MCP server-based tools with command/args/env configuration
 *
 * @module tools/tpmjs_loader
 */

import fs from 'fs/promises';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { TpmjsClient, type TpmjsToolManifest, type TpmjsToolParameter } from './tpmjs_client.js';
import { DangerLevel } from './types.js';
import type { CustomToolDefinition } from './loader.js';
import { buildToolSchema } from './loader.js';

// ============================================================================
// Config Schema
// ============================================================================

const FetchConfigSchema = z.object({
  tools: z.array(z.string()).default([]),
  tpmjs: z.object({
    baseUrl: z.string().optional(),
    timeoutMs: z.number().optional(),
  }).optional(),
}).strict();

export type FetchConfig = z.infer<typeof FetchConfigSchema>;

// ============================================================================
// Manifest → CustomToolDefinition Conversion
// ============================================================================

/**
 * Convert a TPMJS manifest into a CustomToolDefinition that can be registered
 * in the existing tool registry.
 */
export function manifestToToolDefinition(manifest: TpmjsToolManifest): CustomToolDefinition | null {
  // MCP tools get a wrapper command that invokes the MCP server
  if (manifest.mcp) {
    const args = manifest.mcp.args?.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ') ?? '';
    const envPrefix = manifest.mcp.env
      ? Object.entries(manifest.mcp.env)
          .map(([k, v]) => `${k}='${v.replace(/'/g, "'\\''")}'`)
          .join(' ') + ' '
      : '';
    const command = `${envPrefix}${manifest.mcp.command} ${args}`.trim();

    return {
      name: sanitizeToolName(manifest.name),
      description: manifest.description || `TPMJS tool: ${manifest.name}`,
      command,
      cwd: manifest.cwd,
      danger: DangerLevel.MODERATE,
      parameters: convertParameters(manifest.parameters),
    };
  }

  // Simple shell command tools
  if (manifest.command) {
    return {
      name: sanitizeToolName(manifest.name),
      description: manifest.description || `TPMJS tool: ${manifest.name}`,
      command: manifest.command,
      cwd: manifest.cwd,
      danger: DangerLevel.MODERATE,
      parameters: convertParameters(manifest.parameters),
    };
  }

  logger.warn(`TPMJS manifest for '${manifest.name}' has no command or mcp config, skipping`);
  return null;
}

/**
 * Convert TPMJS parameter format to the CustomToolDefinition parameter format.
 */
function convertParameters(params?: TpmjsToolParameter[]): CustomToolDefinition['parameters'] {
  if (!params || params.length === 0) return [];
  return params.map((p) => ({
    name: p.name,
    type: p.type,
    description: p.description,
    required: p.required,
    default: p.default,
  }));
}

/**
 * Sanitize a TPMJS package name into a valid tool registry name.
 * Converts "@scope/name" → "scope_name", "my-tool" → "my_tool".
 */
export function sanitizeToolName(name: string): string {
  return name
    .replace(/^@/, '')
    .replace(/[/\-]/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();
}

// ============================================================================
// Config Loader
// ============================================================================

/**
 * Read and validate `fetch.config.json` from the given path.
 */
export async function loadFetchConfig(configPath: string): Promise<FetchConfig | null> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    const result = FetchConfigSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn('Invalid fetch.config.json', {
        issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return null;
    }
    return result.data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug('No fetch.config.json found, skipping TPMJS tool loading');
      return null;
    }
    logger.error('Failed to read fetch.config.json', error);
    return null;
  }
}

// ============================================================================
// Main Loader
// ============================================================================

export interface TpmjsLoadResult {
  /** Successfully converted tool definitions ready for registry. */
  tools: Array<{ definition: CustomToolDefinition; schema: z.ZodSchema }>;
  /** Tool names that failed to load. */
  failed: string[];
}

/**
 * Load TPMJS tools defined in `fetch.config.json`.
 *
 * 1. Reads the config file
 * 2. Fetches manifests from TPMJS for each listed tool
 * 3. Converts manifests to CustomToolDefinitions
 * 4. Builds Zod schemas for each tool
 *
 * Returns the converted definitions ready for the ToolRegistry to register.
 */
export async function loadTpmjsTools(configPath: string): Promise<TpmjsLoadResult> {
  const result: TpmjsLoadResult = { tools: [], failed: [] };

  const config = await loadFetchConfig(configPath);
  if (!config || config.tools.length === 0) {
    return result;
  }

  logger.info(`Loading ${config.tools.length} TPMJS tools from config`, {
    tools: config.tools,
  });

  const client = new TpmjsClient(config.tpmjs);
  const manifests = await client.getManifests(config.tools);

  // Build a set of successfully fetched names for failure tracking
  const fetchedNames = new Set(manifests.map((m) => m.name));

  for (const toolName of config.tools) {
    if (!fetchedNames.has(toolName)) {
      result.failed.push(toolName);
      logger.warn(`TPMJS tool not found or fetch failed: ${toolName}`);
    }
  }

  for (const manifest of manifests) {
    try {
      const definition = manifestToToolDefinition(manifest);
      if (!definition) {
        result.failed.push(manifest.name);
        continue;
      }

      const schema = buildToolSchema(definition);
      result.tools.push({ definition, schema });
      logger.info(`TPMJS tool converted: ${manifest.name} → ${definition.name}`);
    } catch (error) {
      result.failed.push(manifest.name);
      logger.error(`Failed to convert TPMJS manifest: ${manifest.name}`, error);
    }
  }

  if (result.failed.length > 0) {
    logger.warn(`${result.failed.length} TPMJS tools failed to load`, {
      failed: result.failed,
    });
  }

  return result;
}
