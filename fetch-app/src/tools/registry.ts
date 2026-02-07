/**
 * @fileoverview Tool Registry
 * @module tools/registry
 *
 * Singleton registry for orchestrator tools. Includes:
 * - Built-in tools (workspace, task, interaction) registered at construction
 * - Custom tools loaded from data/tools/*.json with hot-reload via chokidar
 *
 * Tools delegate actual coding work to harnesses (Claude Code, Gemini CLI, etc.).
 */

import { z } from 'zod';
import { ToolResult, ToolContext, DangerLevel } from './types.js';
export type { ToolContext }; // Re-export for backward compatibility
import { logger } from '../utils/logger.js';
import { ToolInputSchemas, type ToolName } from '../validation/tools.js';

// Import tool handlers
import {
  handleWorkspaceList,
  handleWorkspaceSelect,
  handleWorkspaceStatus,
  handleWorkspaceCreate,
  handleWorkspaceDelete,
  workspaceTools,
} from './workspace.js';

import {
  handleTaskCreate,
  handleTaskStatus,
  handleTaskCancel,
  handleTaskRespond,
  taskTools,
} from './task.js';

import {
  handleAskUser,
  handleReportProgress,
  interactionTools,
} from './interaction.js';

import { loadToolDefinition, buildToolSchema, CustomToolDefinition } from './loader.js';
import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);
import chokidar from 'chokidar';
import fs from 'fs';
import { TOOLS_DIR } from '../config/paths.js';

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Tool definition for Orchestrator
 */
export interface OrchestratorTool {
  /** Tool name */
  name: string; // broadened from ToolName for custom tools
  /** Tool description */
  description: string;
  /** Handler function */
  handler: (input: unknown, context?: ToolContext) => Promise<ToolResult>;
  /** Zod schema for validation */
  schema: z.ZodSchema;
  /** Safety level */
  danger?: DangerLevel;
  /** Is this a custom tool? */
  isCustom?: boolean;
}

/**
 * Tool handler signature
 */
export type ToolHandler = (input: unknown, context?: ToolContext) => Promise<ToolResult>;

// ============================================================================
// Tool Registry Class
// ============================================================================

export class ToolRegistry {
  private static instance: ToolRegistry | undefined;
  private tools: Map<string, OrchestratorTool> = new Map();
  private customToolsDir: string;
  private watchers: ReturnType<typeof chokidar.watch>[] = [];

  private constructor() {
    this.customToolsDir = TOOLS_DIR;
    this.registerBuiltins();
    this.initCustomTools();
  }

  private initCustomTools() {
      // Ensure dir exists (or try to)
      if (!fs.existsSync(this.customToolsDir)) {
          // Ideally we create it, but constructor sync content... 
          // Async init pattern better, but singleton is sync accessed usually.
          // We'll set up watcher and let it fire on existing files if configured right.
      }
      
      this.setupWatcher();
  }

  private setupWatcher() {
      try {
          const watcher = chokidar.watch(this.customToolsDir, {
              ignored: /(^|[/\\])\../,
              persistent: true,
              depth: 0
          });

          watcher.on('add', (f) => this.loadCustomTool(f));
          watcher.on('change', (f) => this.loadCustomTool(f));
          watcher.on('unlink', (f) => this.unloadCustomTool(f));

          this.watchers.push(watcher);
      } catch (err) {
          logger.error('Failed to setup tool watcher', err);
      }
  }

  private async loadCustomTool(filePath: string) {
      if (!filePath.endsWith('.json')) return;

      const def = await loadToolDefinition(filePath);
      if (!def) return;

      const schema = buildToolSchema(def);
      const handler = this.createShellHandler(def);

      const tool: OrchestratorTool = {
          name: def.name,
          description: def.description,
          danger: def.danger,
          schema,
          handler,
          isCustom: true
      };

      this.register(tool);
      logger.info(`Custom tool loaded: ${tool.name}`);
  }

  private unloadCustomTool(filePath: string) {
       // Logic to map file to tool name needed if we want to support delete
       // Since we didn't store file->name map, we might just re-scan or ignore for V1
       // For now, logging.
       logger.info(`Custom tool file removed: ${filePath} (Tool unloading not fully implemented yet)`);
  }

  private createShellHandler(def: CustomToolDefinition): ToolHandler {
      return async (input: unknown) => {
          const params = input as Record<string, unknown>;
          let command = def.command;
          
          // Template replacement: {{param}} with shell-safe escaping
          Object.keys(params).forEach(key => {
              const val = String(params[key]);
              // Escape single quotes and wrap in single quotes for shell safety
              const escaped = "'" + val.replace(/'/g, "'\\''") + "'";
              command = command.replace(new RegExp(`{{${key}}}`, 'g'), escaped);
          });

          const start = Date.now();
          try {
              const cwd = def.cwd || process.cwd();
              const { stdout, stderr } = await execPromise(command, { cwd });
              
              return {
                  success: true,
                  output: stdout || stderr || 'Command executed successfully', // sometimes only stderr has info
                  duration: Date.now() - start
              };
          } catch (error) {
              const err = error as { stdout?: string; message?: string; stderr?: string };
              return {
                  success: false,
                  output: err.stdout || '',
                  error: err.message || err.stderr || 'Unknown execution error',
                  duration: Date.now() - start
              };
          }
      };
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  /**
   * Register a single tool
   */
  public register(tool: OrchestratorTool): void {
    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }

  /**
   * Register multiple tools
   */
  public registerAll(tools: Record<string, OrchestratorTool>): void {
    for (const tool of Object.values(tools)) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by name
   */
  public get(name: string): OrchestratorTool | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools
   */
  public list(): OrchestratorTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Export tools to OpenAI format
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public toOpenAIFormat(): any[] {
    const result = Array.from(this.tools.values()).map(tool => _mapToOpenAIFunction(tool));
    
    // Log schemas once on first call for debugging
    if (!this._schemaLogged) {
      this._schemaLogged = true;
      for (const tool of result) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fn = (tool as any).function;
        logger.debug('Tool schema', {
          name: fn?.name,
          parameters: JSON.stringify(fn?.parameters),
        });
      }
    }
    
    return result;
  }
  
  private _schemaLogged = false;

  /**
   * Execute a tool by name with arguments
   * @param name - Tool name
   * @param args - Tool arguments
   * @param context - Optional execution context (sessionId, etc.)
   */
  public async execute(name: string, args: unknown, context?: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        output: `Tool '${name}' not found`,
        duration: 0
      };
    }
    
    const startTime = Date.now();
    try {
      // Validate args
      // Note: We skip strict validation here to allow flexible inputs for now, 
      // but ideally we should parse with tool.schema.parse(args)
      const result = await tool.handler(args, context);
      // Ensure duration is present if tool doesn't provide it
      if (result.duration === undefined) {
         result.duration = Date.now() - startTime;
      }
      return result;
    } catch (error) {
      logger.error(`Tool execution failed: ${name}`, { error });
      return {
        success: false,
        output: `Error executing tool '${name}': ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime
      };
    }
  }

  private registerBuiltins(): void {
    this.register({
      name: 'workspace_list',
      description: workspaceTools.workspace_list.description,
      handler: handleWorkspaceList,
      schema: ToolInputSchemas.workspace_list,
      danger: DangerLevel.SAFE
    });
    // ... (We will register the rest programmatically to save lines)
    const builtins: Record<string, { h: ToolHandler; s: z.ZodSchema; d: DangerLevel }> = {
      // WORKSPACE
      workspace_select: { h: handleWorkspaceSelect, s: ToolInputSchemas.workspace_select, d: DangerLevel.SAFE },
      workspace_status: { h: handleWorkspaceStatus, s: ToolInputSchemas.workspace_status, d: DangerLevel.SAFE },
      workspace_create: { h: handleWorkspaceCreate, s: ToolInputSchemas.workspace_create, d: DangerLevel.MODERATE },
      workspace_delete: { h: handleWorkspaceDelete, s: ToolInputSchemas.workspace_delete, d: DangerLevel.DANGEROUS },
      
      // TASK
      task_create: { h: handleTaskCreate, s: ToolInputSchemas.task_create, d: DangerLevel.MODERATE },
      task_status: { h: handleTaskStatus, s: ToolInputSchemas.task_status, d: DangerLevel.SAFE },
      task_cancel: { h: handleTaskCancel, s: ToolInputSchemas.task_cancel, d: DangerLevel.MODERATE },
      task_respond: { h: handleTaskRespond, s: ToolInputSchemas.task_respond, d: DangerLevel.SAFE },
      
      // INTERACTION
      ask_user: { h: handleAskUser, s: ToolInputSchemas.ask_user, d: DangerLevel.SAFE },
      report_progress: { h: handleReportProgress, s: ToolInputSchemas.report_progress, d: DangerLevel.SAFE },
    };

    for (const [name, meta] of Object.entries(builtins)) {
      const wTools = workspaceTools as Record<string, { description: string }>;
      const tTools = taskTools as Record<string, { description: string }>;
      const iTools = interactionTools as Record<string, { description: string }>;
      
      this.register({
        name: name as ToolName,
        description: (wTools[name] || tTools[name] || iTools[name])?.description || 'No description',
        handler: meta.h,
        schema: meta.s,
        danger: meta.d
      });
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function _mapToOpenAIFunction(tool: OrchestratorTool): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.schema),
    },
  };
}

function zodToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  // Zod v4: use .type and .def instead of ._def.typeName
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = schema as any;
  
  if (s.type === 'object' && s.def?.shape) {
    const shape = s.def.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const field = value as any;
      
      // Use Zod v4's built-in isOptional() method
      const isOptional = typeof field.isOptional === 'function' ? field.isOptional() : false;
      
      // Unwrap wrapper types to get the core type
      const innerSchema = unwrapZodType(field);
      properties[key] = zodTypeToJsonSchema(innerSchema, field);
      
      if (!isOptional) required.push(key);
    }

    const result: Record<string, unknown> = { type: 'object', properties };
    if (required.length > 0) result.required = required;
    return result;
  }
  return { type: 'object', properties: {} };
}

/**
 * Unwrap Zod wrapper types (default, optional, nullable) to get the core type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapZodType(schema: any): any {
  let current = schema;
  while (current) {
    const type = current.type ?? current.def?.type;
    if (type === 'default' || type === 'optional' || type === 'nullable') {
      current = current.def?.innerType ?? current._def?.innerType;
    } else {
      return current;
    }
  }
  return schema;
}

/**
 * Convert a Zod type to JSON Schema type descriptor.
 * Reads description from the outermost schema (which is where .describe() attaches in Zod v4).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zodTypeToJsonSchema(innerSchema: any, outerSchema?: any): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  
  // In Zod v4, .description is a direct property, also available via .meta()
  const desc = outerSchema?.description ?? innerSchema?.description;
  if (desc) base.description = desc;

  const type = innerSchema?.type ?? innerSchema?.def?.type;
  
  switch (type) {
    case 'string': return { ...base, type: 'string' };
    case 'number': return { ...base, type: 'number' };
    case 'boolean': return { ...base, type: 'boolean' };
    case 'enum': {
      // Zod v4: enum entries are in .def.entries as { key: value } or .values as array
      const entries = innerSchema.def?.entries;
      const values = entries ? Object.values(entries) : (innerSchema.values ?? innerSchema.options);
      return values ? { ...base, type: 'string', enum: values } : { ...base, type: 'string' };
    }
    case 'array': {
      const itemSchema = innerSchema.def?.element ?? innerSchema.def?.type;
      return { ...base, type: 'array', items: itemSchema ? zodTypeToJsonSchema(unwrapZodType(itemSchema)) : { type: 'string' } };
    }
    default: return { ...base, type: 'string' };
  }
}

export const getToolRegistry = () => ToolRegistry.getInstance();

