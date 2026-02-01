/**
 * Tool Types
 * 
 * Type definitions for the tool registry system.
 */

// ============================================================================
// Tool Parameter Schema (JSON Schema compatible)
// ============================================================================

export type ParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface ToolParameter {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: ParameterType;
  /** Parameter description */
  description: string;
  /** Is this parameter required? */
  required: boolean;
  /** Default value if not provided */
  default?: unknown;
  /** For array types: item type */
  items?: { type: ParameterType };
  /** Enum values (for string types) */
  enum?: string[];
}

// ============================================================================
// Tool Result
// ============================================================================

export interface ToolResult {
  /** Whether the tool executed successfully */
  success: boolean;
  /** Output content */
  output: string;
  /** Error message if failed */
  error?: string;
  /** Execution duration in ms */
  duration: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Tool Definition
// ============================================================================

export type ToolCategory = 'file' | 'code' | 'shell' | 'git' | 'control';

export interface Tool {
  /** Unique tool name (snake_case) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Tool category for organization */
  category: ToolCategory;
  /** Parameters this tool accepts */
  parameters: ToolParameter[];
  /** Whether this tool can be auto-approved */
  autoApprove: boolean;
  /** Whether this tool modifies the workspace */
  modifiesWorkspace: boolean;
  /** Execute the tool */
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

// ============================================================================
// Claude API Format
// ============================================================================

/**
 * Convert tool to Claude's tool format
 */
export function toClaudeToolFormat(tool: Tool): ClaudeTool {
  const properties: Record<string, ClaudePropertySchema> = {};
  const required: string[] = [];

  for (const param of tool.parameters) {
    properties[param.name] = {
      type: param.type,
      description: param.description
    };

    if (param.enum) {
      properties[param.name].enum = param.enum;
    }

    if (param.items) {
      properties[param.name].items = { type: param.items.type };
    }

    if (param.required) {
      required.push(param.name);
    }
  }

  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties,
      required
    }
  };
}

export interface ClaudePropertySchema {
  type: ParameterType;
  description: string;
  enum?: string[];
  items?: { type: ParameterType };
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, ClaudePropertySchema>;
    required: string[];
  };
}

// ============================================================================
// Decision Types (Agent Loop)
// ============================================================================

export type DecisionType = 
  | 'use_tool'
  | 'ask_user'
  | 'report_progress'
  | 'complete'
  | 'blocked';

export interface UseToolDecision {
  type: 'use_tool';
  tool: Tool;
  args: Record<string, unknown>;
  reasoning: string;
}

export interface AskUserDecision {
  type: 'ask_user';
  question: string;
  options?: string[];
}

export interface ReportProgressDecision {
  type: 'report_progress';
  message: string;
  percentComplete?: number;
}

export interface CompleteDecision {
  type: 'complete';
  summary: string;
  filesModified?: string[];
}

export interface BlockedDecision {
  type: 'blocked';
  reason: string;
  suggestion?: string;
}

export type Decision = 
  | UseToolDecision 
  | AskUserDecision 
  | ReportProgressDecision 
  | CompleteDecision 
  | BlockedDecision;
