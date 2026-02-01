/**
 * Control Tools
 * 
 * Tools for agent control flow and user interaction.
 */

import { Tool, ToolResult } from './types.js';

/**
 * Create a successful result
 */
function success(output: string, duration: number, metadata?: Record<string, unknown>): ToolResult {
  return { success: true, output, duration, metadata };
}

// ============================================================================
// Tool: ask_user
// ============================================================================

const askUserTool: Tool = {
  name: 'ask_user',
  description: 'Ask the user a question or request clarification. Use when you need more information to proceed.',
  category: 'control',
  autoApprove: true,  // Asking is always allowed
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'question',
      type: 'string',
      description: 'The question to ask the user',
      required: true
    },
    {
      name: 'options',
      type: 'array',
      description: 'Optional multiple choice options',
      required: false,
      items: { type: 'string' }
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const question = args.question as string;
    const options = args.options as string[] | undefined;

    // Format the question
    let output = question;
    
    if (options && options.length > 0) {
      output += '\n\nOptions:\n';
      options.forEach((opt, i) => {
        output += `${i + 1}. ${opt}\n`;
      });
    }

    // The actual question will be displayed to the user by the agent loop
    // This tool just signals that we need user input
    return success(
      output,
      Date.now() - startTime,
      { 
        type: 'question',
        hasOptions: !!options,
        optionCount: options?.length || 0
      }
    );
  }
};

// ============================================================================
// Tool: report_progress
// ============================================================================

const reportProgressTool: Tool = {
  name: 'report_progress',
  description: 'Report progress to the user during a long-running task.',
  category: 'control',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'message',
      type: 'string',
      description: 'Progress update message',
      required: true
    },
    {
      name: 'percent_complete',
      type: 'number',
      description: 'Percentage complete (0-100)',
      required: false
    },
    {
      name: 'current_step',
      type: 'string',
      description: 'Description of the current step',
      required: false
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const message = args.message as string;
    const percentComplete = args.percent_complete as number | undefined;
    const currentStep = args.current_step as string | undefined;

    let output = message;
    
    if (percentComplete !== undefined) {
      output += ` (${percentComplete}% complete)`;
    }
    
    if (currentStep) {
      output += `\nCurrent step: ${currentStep}`;
    }

    return success(
      output,
      Date.now() - startTime,
      { 
        type: 'progress',
        percentComplete,
        currentStep
      }
    );
  }
};

// ============================================================================
// Tool: task_complete
// ============================================================================

const taskCompleteTool: Tool = {
  name: 'task_complete',
  description: 'Signal that the task has been completed successfully. Use this when the user\'s goal has been achieved.',
  category: 'control',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'summary',
      type: 'string',
      description: 'Summary of what was accomplished',
      required: true
    },
    {
      name: 'files_modified',
      type: 'array',
      description: 'List of files that were modified',
      required: false,
      items: { type: 'string' }
    },
    {
      name: 'next_steps',
      type: 'string',
      description: 'Suggested next steps for the user',
      required: false
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const summary = args.summary as string;
    const filesModified = args.files_modified as string[] | undefined;
    const nextSteps = args.next_steps as string | undefined;

    let output = summary;
    
    if (filesModified && filesModified.length > 0) {
      output += '\n\nFiles modified:\n';
      filesModified.forEach(f => {
        output += `• ${f}\n`;
      });
    }
    
    if (nextSteps) {
      output += `\nNext steps: ${nextSteps}`;
    }

    return success(
      output,
      Date.now() - startTime,
      { 
        type: 'complete',
        filesModified: filesModified || [],
        fileCount: filesModified?.length || 0
      }
    );
  }
};

// ============================================================================
// Tool: task_blocked
// ============================================================================

const taskBlockedTool: Tool = {
  name: 'task_blocked',
  description: 'Signal that you cannot proceed with the task. Use when you encounter an unrecoverable issue.',
  category: 'control',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'reason',
      type: 'string',
      description: 'Why the task cannot proceed',
      required: true
    },
    {
      name: 'suggestion',
      type: 'string',
      description: 'Suggested action for the user to unblock',
      required: false
    },
    {
      name: 'error_details',
      type: 'string',
      description: 'Technical error details if applicable',
      required: false
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const reason = args.reason as string;
    const suggestion = args.suggestion as string | undefined;
    const errorDetails = args.error_details as string | undefined;

    let output = `Blocked: ${reason}`;
    
    if (errorDetails) {
      output += `\n\nError details:\n${errorDetails}`;
    }
    
    if (suggestion) {
      output += `\n\nSuggestion: ${suggestion}`;
    }

    return success(
      output,
      Date.now() - startTime,
      { 
        type: 'blocked',
        hasSuggestion: !!suggestion
      }
    );
  }
};

// ============================================================================
// Tool: think
// ============================================================================

const thinkTool: Tool = {
  name: 'think',
  description: 'Use this to reason through a complex problem before taking action. Good for planning.',
  category: 'control',
  autoApprove: true,
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'thought',
      type: 'string',
      description: 'Your reasoning or analysis',
      required: true
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const thought = args.thought as string;

    // The thought is recorded in the conversation for context
    // but not necessarily shown to the user
    return success(
      thought,
      Date.now() - startTime,
      { type: 'thought' }
    );
  }
};

// ============================================================================
// Export all control tools
// ============================================================================

export const controlTools: Tool[] = [
  askUserTool,
  reportProgressTool,
  taskCompleteTool,
  taskBlockedTool,
  thinkTool
];
