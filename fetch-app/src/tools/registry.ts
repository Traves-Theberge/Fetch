/**
 * Tool Registry
 * 
 * Central registry for all available tools.
 */

import { Tool, ClaudeTool, toClaudeToolFormat, ToolCategory } from './types.js';
import { logger } from '../utils/logger.js';

/**
 * Tool registry for managing available tools
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /**
   * Register a tool
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool already registered, overwriting: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }

  /**
   * Register multiple tools
   */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolCategory): Tool[] {
    return this.getAll().filter(t => t.category === category);
  }

  /**
   * Get tools that can be auto-approved
   */
  getAutoApprovable(): Tool[] {
    return this.getAll().filter(t => t.autoApprove);
  }

  /**
   * Get tools that modify the workspace
   */
  getModifyingTools(): Tool[] {
    return this.getAll().filter(t => t.modifiesWorkspace);
  }

  /**
   * Convert all tools to Claude format (legacy)
   */
  toClaudeFormat(): ClaudeTool[] {
    return this.getAll().map(toClaudeToolFormat);
  }

  /**
   * Convert all tools to OpenAI format
   */
  toOpenAIFormat(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
      };
    };
  }> {
    return this.getAll().map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object' as const,
          properties: tool.parameters.reduce((acc, param) => {
            acc[param.name] = {
              type: param.type,
              description: param.description,
              ...(param.enum ? { enum: param.enum } : {})
            };
            return acc;
          }, {} as Record<string, unknown>),
          required: tool.parameters
            .filter(p => p.required)
            .map(p => p.name)
        }
      }
    }));
  }

  /**
   * Get tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get registry summary for logging
   */
  getSummary(): Record<ToolCategory, string[]> {
    const summary: Record<string, string[]> = {};
    
    for (const tool of this.getAll()) {
      if (!summary[tool.category]) {
        summary[tool.category] = [];
      }
      summary[tool.category].push(tool.name);
    }
    
    return summary as Record<ToolCategory, string[]>;
  }
}

// Singleton instance
let registryInstance: ToolRegistry | null = null;

/**
 * Get the singleton tool registry instance
 */
export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
  }
  return registryInstance;
}

/**
 * Initialize the tool registry with all tools
 */
export async function initializeToolRegistry(): Promise<ToolRegistry> {
  const registry = getToolRegistry();
  
  // Import and register all tool modules
  const { fileTools } = await import('./file.js');
  const { codeTools } = await import('./code.js');
  const { shellTools } = await import('./shell.js');
  const { gitTools } = await import('./git.js');
  const { controlTools } = await import('./control.js');
  
  registry.registerAll(fileTools);
  registry.registerAll(codeTools);
  registry.registerAll(shellTools);
  registry.registerAll(gitTools);
  registry.registerAll(controlTools);
  
  logger.info('Tool registry initialized', { 
    toolCount: registry.getAll().length,
    summary: registry.getSummary()
  });
  
  return registry;
}
