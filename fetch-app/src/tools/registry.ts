/**
 * @fileoverview Tool registry and execution entry point.
 *
 * Maintains the in-process registry for built-in and custom tools, validates
 * input arguments, executes handlers, and exposes OpenAI-compatible schemas.
 *
 * @module tools/registry
 */

import { z } from 'zod';
import { ToolResult, ToolContext, DangerLevel } from './types.js';
import { logger } from '../utils/logger.js';
import { ToolInputSchemas, type ToolName } from '../validation/tools.js';

// Import tool handlers
import {
  handleWorkspaceList,
  handleWorkspaceSelect,
  handleWorkspaceStatus,
  handleWorkspaceCreate,
  handleWorkspaceDelete,
  handleFileDelete,
  handleFolderDelete,
  handleWorkspaceSync,
  handleWorkspacePublish,
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

import {
  handleGitHubPRCreate,
  handleGitHubPRList,
  handleGitHubPRView,
  handleGitHubIssueCreate,
  handleGitHubIssueList,
  handleGitHubBranchCreate,
  handleGitHubActionStatus,
  handleGitHubSearchRepos,
  githubTools,
} from './github.js';

import {
  handlePMList,
  handlePMView,
  handlePMComment,
  handlePMUpdate,
  pmTools,
} from './pm.js';

import {
  handleWebFetch,
  handleWebSearch,
  webTools,
} from './web.js';

import {
  handleBrowserOpen,
  handleBrowserSnapshot,
  handleBrowserAction,
  handleBrowserScreenshot,
  browserTools,
} from './browser.js';

import {
  handleWorkflowCreate,
  handleWorkflowList,
  handleWorkflowRun,
  handleWorkflowDelete,
  handleCronCreate,
  handleCronList,
  handleCronDelete,
  handleCronRun,
  handleAppRun,
  handleAppTest,
  handleBrowserTest,
  workflowTools,
} from './workflow.js';

import { loadToolDefinition, buildToolSchema, CustomToolDefinition } from './loader.js';
import { loadTpmjsTools } from './tpmjs_loader.js';
import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);
import chokidar from 'chokidar';
import fs from 'fs';
import { TOOLS_DIR, FETCH_CONFIG } from '../config/paths.js';

// ============================================================================
// Internal Types
// ============================================================================

/** Internal tool registration record used by the registry. */
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

/** Async tool handler signature used by built-in and custom tools. */
export type ToolHandler = (input: unknown, context?: ToolContext) => Promise<ToolResult>;

// ============================================================================
// Tool Registry Class
// ============================================================================

export class ToolRegistry {
  private static instance: ToolRegistry | undefined;
  private tools: Map<string, OrchestratorTool> = new Map();
  private customToolFiles: Map<string, string> = new Map(); // filePath → toolName
  private customToolsDir: string;
  private watchers: ReturnType<typeof chokidar.watch>[] = [];

  private tpmjsToolNames: Set<string> = new Set();

  private constructor() {
    this.customToolsDir = TOOLS_DIR;
    this.registerBuiltins();
    this.initCustomTools();
    this.initTpmjsTools();
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

  /**
   * Asynchronously load TPMJS tools from fetch.config.json.
   * Runs in background — tools become available once fetched.
   */
  private initTpmjsTools() {
    loadTpmjsTools(FETCH_CONFIG).then((result) => {
      for (const { definition, schema } of result.tools) {
        const handler = this.createShellHandler(definition);
        this.register({
          name: definition.name,
          description: `[TPMJS] ${definition.description}`,
          handler,
          schema,
          danger: definition.danger,
          isCustom: true,
        });
        this.tpmjsToolNames.add(definition.name);
      }

      if (result.tools.length > 0) {
        logger.info(`Loaded ${result.tools.length} TPMJS tools`, {
          tools: result.tools.map((t) => t.definition.name),
        });
      }
      if (result.failed.length > 0) {
        logger.warn(`${result.failed.length} TPMJS tools failed to load`, {
          failed: result.failed,
        });
      }
    }).catch((error) => {
      logger.error('Failed to initialize TPMJS tools', error);
    });
  }

  /** Returns names of all currently loaded TPMJS tools. */
  public getTpmjsToolNames(): string[] {
    return Array.from(this.tpmjsToolNames);
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
    const previousName = this.customToolFiles.get(filePath);

    try {
      const def = await loadToolDefinition(filePath);
      if (!def) {
        if (previousName) {
          this.tools.delete(previousName);
          this.customToolFiles.delete(filePath);
          logger.info(`Custom tool unloaded due to invalid definition: ${previousName}`);
        }
        return;
      }

      if (previousName && previousName !== def.name) {
        this.tools.delete(previousName);
        logger.info(`Custom tool renamed: ${previousName} -> ${def.name}`);
      }

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
      this.customToolFiles.set(filePath, def.name);
      logger.info(`Custom tool loaded: ${tool.name}`);
    } catch (error) {
      logger.error(`Failed to reload custom tool: ${filePath}`, { error });
      if (previousName) {
        this.tools.delete(previousName);
        this.customToolFiles.delete(filePath);
        logger.info(`Custom tool unloaded after reload failure: ${previousName}`);
      }
    }
  }

  private unloadCustomTool(filePath: string) {
    const toolName = this.customToolFiles.get(filePath);
    if (toolName) {
      this.tools.delete(toolName);
      this.customToolFiles.delete(filePath);
      logger.info(`Custom tool unloaded: ${toolName}`);
    }
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

      const MAX_SHELL_OUTPUT = 100_000;
      const start = Date.now();
      try {
        const cwd = def.cwd || process.cwd();
        const { stdout, stderr } = await execPromise(command, { cwd });
        const truncatedOutput = (stdout || stderr || 'Command executed successfully').slice(0, MAX_SHELL_OUTPUT);

        return {
          success: true,
          output: truncatedOutput,
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

  /** Closes custom-tool watchers and releases watcher resources. */
  public async shutdown(): Promise<void> {
    for (const watcher of this.watchers) {
      await watcher.close();
    }
    this.watchers = [];
  }

  /** Registers one tool definition (insert/replace by tool name). */
  public register(tool: OrchestratorTool): void {
    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }

  /** Registers a dictionary of tools. */
  public registerAll(tools: Record<string, OrchestratorTool>): void {
    for (const tool of Object.values(tools)) {
      this.register(tool);
    }
  }

  /** Returns one tool by name, if registered. */
  public get(name: string): OrchestratorTool | undefined {
    return this.tools.get(name);
  }

  /** Returns all currently registered tools. */
  public list(): OrchestratorTool[] {
    return Array.from(this.tools.values());
  }

  /** Returns registered tools in OpenAI function-calling format. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public toOpenAIFormat(toolNames?: string[]): any[] {
    const selected = toolNames && toolNames.length > 0
      ? toolNames
        .map((name) => this.tools.get(name))
        .filter((tool): tool is OrchestratorTool => !!tool)
      : Array.from(this.tools.values());
    const result = selected.map(tool => _mapToOpenAIFunction(tool));

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

  /** Validates input and executes a registered tool handler by name. */
  public async execute(name: string, args: unknown, context?: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    logger.info(`ToolRegistry.execute called: ${name}`, { found: !!tool, hasHandler: !!tool?.handler });
    if (!tool) {
      return {
        success: false,
        output: `Tool '${name}' not found`,
        duration: 0
      };
    }

    const startTime = Date.now();
    try {
      const autonomyLevel = context?.autonomyLevel ?? 'cautious';

      // Enforce autonomy policy before schema/handler execution.
      // This is a hard safety layer independent of prompt behavior.
      if (tool.danger === DangerLevel.DANGEROUS) {
        if (autonomyLevel === 'supervised') {
          return {
            success: false,
            output: `Safety policy blocked dangerous tool '${name}' in supervised mode. Request explicit operator intervention or switch autonomy level.`,
            duration: Date.now() - startTime,
          };
        }
        if (autonomyLevel === 'cautious' && !hasExplicitConfirmation(args)) {
          return {
            success: false,
            output: `Tool '${name}' requires manual confirmation in Cautious Mode. You MUST use the 'ask_user' tool to request permission from the operator explaining exactly what you intend to do. If they approve, retry this action with 'confirm: true'.`,
            duration: Date.now() - startTime,
          };
        }
      }

      // Validate args with Zod safeParse — lets the LLM self-correct bad arguments
      const validation = tool.schema.safeParse(args);
      if (!validation.success) {
        const issues = validation.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        logger.warn(`Tool validation failed: ${name}`, { issues });
        return {
          success: false,
          output: `Validation error for tool '${name}': ${issues}. Please fix the arguments and try again.`,
          duration: Date.now() - startTime
        };
      }

      const result = await tool.handler(validation.data, context);
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
    const builtins: Record<string, { h: ToolHandler; s: z.ZodSchema; d: DangerLevel }> = {
      // WORKSPACE
      workspace_list: { h: handleWorkspaceList, s: ToolInputSchemas.workspace_list, d: DangerLevel.SAFE },
      workspace_select: { h: handleWorkspaceSelect, s: ToolInputSchemas.workspace_select, d: DangerLevel.SAFE },
      workspace_status: { h: handleWorkspaceStatus, s: ToolInputSchemas.workspace_status, d: DangerLevel.SAFE },
      workspace_create: { h: handleWorkspaceCreate, s: ToolInputSchemas.workspace_create, d: DangerLevel.MODERATE },
      workspace_delete: { h: handleWorkspaceDelete, s: ToolInputSchemas.workspace_delete, d: DangerLevel.DANGEROUS },
      file_delete: { h: handleFileDelete, s: ToolInputSchemas.file_delete, d: DangerLevel.DANGEROUS },
      folder_delete: { h: handleFolderDelete, s: ToolInputSchemas.folder_delete, d: DangerLevel.DANGEROUS },
      workspace_sync: { h: handleWorkspaceSync, s: ToolInputSchemas.workspace_sync, d: DangerLevel.MODERATE },
      workspace_publish: { h: handleWorkspacePublish, s: ToolInputSchemas.workspace_publish, d: DangerLevel.MODERATE },

      // TASK
      task_create: { h: handleTaskCreate, s: ToolInputSchemas.task_create, d: DangerLevel.MODERATE },
      task_status: { h: handleTaskStatus, s: ToolInputSchemas.task_status, d: DangerLevel.SAFE },
      task_cancel: { h: handleTaskCancel, s: ToolInputSchemas.task_cancel, d: DangerLevel.MODERATE },
      task_respond: { h: handleTaskRespond, s: ToolInputSchemas.task_respond, d: DangerLevel.SAFE },

      // INTERACTION
      ask_user: { h: handleAskUser, s: ToolInputSchemas.ask_user, d: DangerLevel.SAFE },
      report_progress: { h: handleReportProgress, s: ToolInputSchemas.report_progress, d: DangerLevel.SAFE },

      // GITHUB
      github_pr_create: { h: handleGitHubPRCreate, s: ToolInputSchemas.github_pr_create, d: DangerLevel.MODERATE },
      github_pr_list: { h: handleGitHubPRList, s: ToolInputSchemas.github_pr_list, d: DangerLevel.SAFE },
      github_pr_view: { h: handleGitHubPRView, s: ToolInputSchemas.github_pr_view, d: DangerLevel.SAFE },
      github_issue_create: { h: handleGitHubIssueCreate, s: ToolInputSchemas.github_issue_create, d: DangerLevel.MODERATE },
      github_issue_list: { h: handleGitHubIssueList, s: ToolInputSchemas.github_issue_list, d: DangerLevel.SAFE },
      github_branch_create: { h: handleGitHubBranchCreate, s: ToolInputSchemas.github_branch_create, d: DangerLevel.MODERATE },
      github_action_status: { h: handleGitHubActionStatus, s: ToolInputSchemas.github_action_status, d: DangerLevel.SAFE },
      github_search_repos: { h: handleGitHubSearchRepos, s: ToolInputSchemas.github_search_repos, d: DangerLevel.SAFE },

      // PM
      pm_list: { h: handlePMList, s: ToolInputSchemas.pm_list, d: DangerLevel.SAFE },
      pm_view: { h: handlePMView, s: ToolInputSchemas.pm_view, d: DangerLevel.SAFE },
      pm_comment: { h: handlePMComment, s: ToolInputSchemas.pm_comment, d: DangerLevel.MODERATE },
      pm_update: { h: handlePMUpdate, s: ToolInputSchemas.pm_update, d: DangerLevel.MODERATE },

      // WEB
      web_fetch: { h: handleWebFetch, s: ToolInputSchemas.web_fetch, d: DangerLevel.SAFE },
      web_search: { h: handleWebSearch, s: ToolInputSchemas.web_search, d: DangerLevel.SAFE },

      // BROWSER
      browser_open: { h: handleBrowserOpen, s: ToolInputSchemas.browser_open, d: DangerLevel.MODERATE },
      browser_snapshot: { h: handleBrowserSnapshot, s: ToolInputSchemas.browser_snapshot, d: DangerLevel.SAFE },
      browser_action: { h: handleBrowserAction, s: ToolInputSchemas.browser_action, d: DangerLevel.MODERATE },
      browser_screenshot: { h: handleBrowserScreenshot, s: ToolInputSchemas.browser_screenshot, d: DangerLevel.SAFE },
      // WORKFLOW / CRON / RUNTIME
      workflow_create: { h: handleWorkflowCreate, s: ToolInputSchemas.workflow_create, d: DangerLevel.MODERATE },
      workflow_list: { h: handleWorkflowList, s: ToolInputSchemas.workflow_list, d: DangerLevel.SAFE },
      workflow_run: { h: handleWorkflowRun, s: ToolInputSchemas.workflow_run, d: DangerLevel.MODERATE },
      workflow_delete: { h: handleWorkflowDelete, s: ToolInputSchemas.workflow_delete, d: DangerLevel.MODERATE },
      cron_create: { h: handleCronCreate, s: ToolInputSchemas.cron_create, d: DangerLevel.MODERATE },
      cron_list: { h: handleCronList, s: ToolInputSchemas.cron_list, d: DangerLevel.SAFE },
      cron_delete: { h: handleCronDelete, s: ToolInputSchemas.cron_delete, d: DangerLevel.MODERATE },
      cron_run: { h: handleCronRun, s: ToolInputSchemas.cron_run, d: DangerLevel.MODERATE },
      app_run: { h: handleAppRun, s: ToolInputSchemas.app_run, d: DangerLevel.MODERATE },
      app_test: { h: handleAppTest, s: ToolInputSchemas.app_test, d: DangerLevel.MODERATE },
      browser_test: { h: handleBrowserTest, s: ToolInputSchemas.browser_test, d: DangerLevel.MODERATE },
    };

    for (const [name, meta] of Object.entries(builtins)) {
      const wTools = workspaceTools as Record<string, { description: string }>;
      const tTools = taskTools as Record<string, { description: string }>;
      const iTools = interactionTools as Record<string, { description: string }>;
      const gTools = githubTools as Record<string, { description: string }>;
      const pTools = pmTools as Record<string, { description: string }>;
      const webT = webTools as Record<string, { description: string }>;
      const brT = browserTools as Record<string, { description: string }>;
      const wfT = workflowTools as Record<string, { description: string }>;

      const description = (wTools[name] || tTools[name] || iTools[name] || gTools[name] || pTools[name] || webT[name] || brT[name] || wfT[name])?.description || 'No description';
      logger.info(`Registering builtin tool: ${name}`, { hasHandler: !!meta.h });

      this.register({
        name: name as ToolName,
        description,
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

function hasExplicitConfirmation(args: unknown): boolean {
  if (!args || typeof args !== 'object') return false;
  const record = args as Record<string, unknown>;
  return record.confirm === true;
}

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

/** Unwraps default/optional/nullable wrappers to reach core Zod type. */
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

/** Converts one Zod field schema into JSON-schema-like descriptor. */
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
