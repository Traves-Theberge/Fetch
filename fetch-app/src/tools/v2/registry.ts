/**
 * @fileoverview V2 Tool Registry (Orchestrator Mode)
 *
 * The v2 registry contains the 8 orchestrator tools that delegate
 * actual coding work to harnesses (Claude Code, Gemini CLI, etc.).
 *
 * @module tools/v2/registry
 * @see {@link workspaceTools} - Workspace management tools
 * @see {@link taskTools} - Task lifecycle tools
 * @see {@link interactionTools} - User interaction tools
 *
 * ## V2 Tools (8 total)
 *
 * ### Workspace (3)
 * - `workspace_list` - List available workspaces
 * - `workspace_select` - Select active workspace
 * - `workspace_status` - Get workspace status
 *
 * ### Task (4)
 * - `task_create` - Create a new task
 * - `task_status` - Get task status
 * - `task_cancel` - Cancel a task
 * - `task_respond` - Respond to task question
 *
 * ### Interaction (2)
 * - `ask_user` - Ask user a question
 * - `report_progress` - Report task progress
 *
 * Note: `ask_user` and `report_progress` overlap with task tools but
 * are exposed separately for internal use by harness output parsing.
 */

import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { ToolInputSchemas, type ToolName } from '../../validation/tools.js';
import type { ToolResult } from '../types.js';

// Import tool handlers
import {
  handleWorkspaceList,
  handleWorkspaceSelect,
  handleWorkspaceStatus,
  workspaceTools,
} from '../workspace.js';

import {
  handleTaskCreate,
  handleTaskStatus,
  handleTaskCancel,
  handleTaskRespond,
  taskTools,
} from '../task.js';

import {
  handleAskUser,
  handleReportProgress,
  interactionTools,
} from '../interaction.js';

// ============================================================================
// Types
// ============================================================================

/**
 * V2 Tool definition
 */
export interface V2Tool {
  /** Tool name */
  name: ToolName;
  /** Tool description */
  description: string;
  /** Handler function */
  handler: (input: unknown) => Promise<ToolResult>;
  /** Zod schema for validation */
  schema: z.ZodSchema;
}

/**
 * V2 Tool handler signature
 */
export type V2ToolHandler = (input: unknown) => Promise<ToolResult>;

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * All V2 tools
 */
export const v2Tools: Record<ToolName, V2Tool> = {
  // Workspace tools
  workspace_list: {
    name: 'workspace_list',
    description: workspaceTools.workspace_list.description,
    handler: handleWorkspaceList,
    schema: ToolInputSchemas.workspace_list,
  },
  workspace_select: {
    name: 'workspace_select',
    description: workspaceTools.workspace_select.description,
    handler: handleWorkspaceSelect,
    schema: ToolInputSchemas.workspace_select,
  },
  workspace_status: {
    name: 'workspace_status',
    description: workspaceTools.workspace_status.description,
    handler: handleWorkspaceStatus,
    schema: ToolInputSchemas.workspace_status,
  },

  // Task tools
  task_create: {
    name: 'task_create',
    description: taskTools.task_create.description,
    handler: handleTaskCreate,
    schema: ToolInputSchemas.task_create,
  },
  task_status: {
    name: 'task_status',
    description: taskTools.task_status.description,
    handler: handleTaskStatus,
    schema: ToolInputSchemas.task_status,
  },
  task_cancel: {
    name: 'task_cancel',
    description: taskTools.task_cancel.description,
    handler: handleTaskCancel,
    schema: ToolInputSchemas.task_cancel,
  },
  task_respond: {
    name: 'task_respond',
    description: taskTools.task_respond.description,
    handler: handleTaskRespond,
    schema: ToolInputSchemas.task_respond,
  },

  // Interaction tools
  ask_user: {
    name: 'ask_user',
    description: interactionTools.ask_user.description,
    handler: handleAskUser,
    schema: ToolInputSchemas.ask_user,
  },
  report_progress: {
    name: 'report_progress',
    description: interactionTools.report_progress.description,
    handler: handleReportProgress,
    schema: ToolInputSchemas.report_progress,
  },
};

// ============================================================================
// V2 Registry Class
// ============================================================================

/**
 * V2 Tool Registry
 *
 * Manages the 8 orchestrator tools for the v2 architecture.
 *
 * @example
 * ```typescript
 * const registry = new V2ToolRegistry();
 *
 * // Execute a tool
 * const result = await registry.execute('workspace_list', {});
 *
 * // Get tool for LLM
 * const tools = registry.toOpenAIFormat();
 * ```
 */
export class V2ToolRegistry {
  private tools: Map<ToolName, V2Tool> = new Map();

  constructor() {
    // Register all tools
    for (const [name, tool] of Object.entries(v2Tools)) {
      this.tools.set(name as ToolName, tool);
    }
    logger.debug(`V2 registry initialized with ${this.tools.size} tools`);
  }

  /**
   * Get a tool by name
   */
  get(name: string): V2Tool | undefined {
    return this.tools.get(name as ToolName);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name as ToolName);
  }

  /**
   * Get all tool names
   */
  getToolNames(): ToolName[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all tools
   */
  getAll(): V2Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool with validation
   *
   * @param name - Tool name
   * @param input - Tool input (validated against schema)
   * @returns Tool result
   */
  async execute(name: string, input: unknown): Promise<ToolResult> {
    const start = Date.now();

    // Get tool
    const tool = this.get(name);
    if (!tool) {
      return {
        success: false,
        output: '',
        error: `Unknown tool: ${name}`,
        duration: Date.now() - start,
      };
    }

    // Validate input
    const parseResult = tool.schema.safeParse(input);
    if (!parseResult.success) {
      logger.warn(`Tool validation failed: ${name}`, {
        error: parseResult.error.message,
      });
      return {
        success: false,
        output: '',
        error: `Invalid input: ${parseResult.error.message}`,
        duration: Date.now() - start,
      };
    }

    // Execute
    try {
      logger.debug(`Executing v2 tool: ${name}`);
      return await tool.handler(parseResult.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Tool execution failed: ${name}`, { error: message });
      return {
        success: false,
        output: '',
        error: message,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Convert tools to OpenAI function format
   */
  toOpenAIFormat(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return this.getAll().map((tool) => {
      // Convert Zod schema to JSON Schema
      const jsonSchema = zodToJsonSchema(tool.schema);

      return {
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: jsonSchema,
        },
      };
    });
  }

  /**
   * Convert tools to Claude format
   */
  toClaudeFormat(): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }> {
    return this.getAll().map((tool) => {
      const jsonSchema = zodToJsonSchema(tool.schema);

      return {
        name: tool.name,
        description: tool.description,
        input_schema: jsonSchema,
      };
    });
  }

  /**
   * Get summary for logging
   */
  getSummary(): { workspace: string[]; task: string[]; interaction: string[] } {
    return {
      workspace: ['workspace_list', 'workspace_select', 'workspace_status'],
      task: ['task_create', 'task_status', 'task_cancel', 'task_respond'],
      interaction: ['ask_user', 'report_progress'],
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert Zod schema to JSON Schema
 *
 * Note: This is a simplified conversion. For production use,
 * consider using zod-to-json-schema package.
 */
function zodToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  // Type assertion to access internal shape
  const def = schema._def as {
    typeName?: string;
    shape?: () => Record<string, z.ZodSchema>;
  };

  if (def.typeName === 'ZodObject' && def.shape) {
    const shape = def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const propDef = value._def as {
        typeName?: string;
        innerType?: z.ZodSchema;
        description?: string;
      };

      // Check if optional
      const isOptional = propDef.typeName === 'ZodOptional';
      const innerSchema = isOptional ? propDef.innerType : value;

      properties[key] = zodTypeToJsonSchema(innerSchema as z.ZodSchema);

      if (!isOptional) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  return { type: 'object', properties: {} };
}

/**
 * Convert Zod type to JSON Schema type
 */
function zodTypeToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  const def = schema._def as {
    typeName?: string;
    description?: string;
    values?: string[];
    type?: z.ZodSchema;
    minValue?: number;
    maxValue?: number;
  };

  const base: Record<string, unknown> = {};

  if (def.description) {
    base.description = def.description;
  }

  switch (def.typeName) {
    case 'ZodString':
      return { ...base, type: 'string' };
    case 'ZodNumber':
      return {
        ...base,
        type: 'number',
        ...(def.minValue !== undefined ? { minimum: def.minValue } : {}),
        ...(def.maxValue !== undefined ? { maximum: def.maxValue } : {}),
      };
    case 'ZodBoolean':
      return { ...base, type: 'boolean' };
    case 'ZodEnum':
      return { ...base, type: 'string', enum: def.values };
    case 'ZodArray':
      return {
        ...base,
        type: 'array',
        items: def.type ? zodTypeToJsonSchema(def.type) : { type: 'string' },
      };
    case 'ZodOptional':
      return zodTypeToJsonSchema((def as { innerType: z.ZodSchema }).innerType);
    default:
      return { ...base, type: 'string' };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let registryInstance: V2ToolRegistry | null = null;

/**
 * Get the singleton V2 registry instance
 */
export function getV2Registry(): V2ToolRegistry {
  if (!registryInstance) {
    registryInstance = new V2ToolRegistry();
  }
  return registryInstance;
}

/**
 * Initialize the V2 registry
 */
export function initializeV2Registry(): V2ToolRegistry {
  const registry = getV2Registry();

  const summary = registry.getSummary();
  const total = registry.getToolNames().length;

  logger.info(`V2 registry initialized with ${total} orchestrator tools`);
  logger.debug('Workspace tools:', summary.workspace);
  logger.debug('Task tools:', summary.task);
  logger.debug('Interaction tools:', summary.interaction);

  return registry;
}
