/**
 * @fileoverview Control Tools Module
 * 
 * Provides tools for agent control flow and user interaction. These tools
 * allow the agent to communicate with users, track progress, and signal
 * task completion or blocking issues.
 * 
 * @module tools/control
 * @see {@link module:tools/types} For Tool and ToolResult types
 * @see {@link module:agent/action} For action mode which uses these tools
 * 
 * ## Control Flow Tools
 * 
 * | Tool | Purpose | Auto-Approve |
 * |------|---------|--------------|
 * | ask_user | Request user clarification | ✅ Yes |
 * | report_progress | Update on long tasks | ✅ Yes |
 * | task_complete | Signal successful completion | ✅ Yes |
 * | task_blocked | Signal unrecoverable error | ✅ Yes |
 * | think | Reasoning without action | ✅ Yes |
 * 
 * ## Workflow Integration
 * 
 * ```
 * ┌─────────────────────────────────────────┐
 * │              Agent Loop                  │
 * └──────────────┬──────────────────────────┘
 *                │
 *     ┌──────────┴──────────┐
 *     │                     │
 *     ▼                     ▼
 * ┌────────┐          ┌──────────┐
 * │ask_user│          │  think   │
 * └────┬───┘          └────┬─────┘
 *      │                   │
 *      ▼                   ▼
 * User Response      Continue Work
 *      │                   │
 *      └───────┬───────────┘
 *              │
 *     ┌────────┴────────┐
 *     │                 │
 *     ▼                 ▼
 * ┌────────────┐  ┌─────────────┐
 * │task_complete│  │task_blocked │
 * └────────────┘  └─────────────┘
 * ```
 * 
 * @example
 * ```typescript
 * import { controlTools } from './control.js';
 * import { ToolRegistry } from './registry.js';
 * 
 * const registry = new ToolRegistry();
 * controlTools.forEach(tool => registry.register(tool));
 * 
 * // Execute ask_user tool
 * const result = await registry.execute('ask_user', {
 *   question: 'Which file should I update?',
 *   options: ['config.ts', 'index.ts', 'Both']
 * });
 * ```
 */

import { Tool, ToolResult } from './types.js';

/**
 * Create a successful tool result.
 * 
 * @param {string} output - Result message
 * @param {number} duration - Execution time in milliseconds
 * @param {Record<string, unknown>} [metadata] - Optional metadata
 * @returns {ToolResult} Success result object
 * @private
 */
function success(output: string, duration: number, metadata?: Record<string, unknown>): ToolResult {
  return { success: true, output, duration, metadata };
}

// ============================================================================
// Tool: ask_user
// ============================================================================

/**
 * Ask User Tool
 * 
 * Requests clarification or additional information from the user.
 * Supports optional multiple choice options for easier responses.
 * Always auto-approved since asking doesn't modify anything.
 * 
 * @constant {Tool}
 */
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

/**
 * Report Progress Tool
 * 
 * Reports progress updates to the user during long-running tasks.
 * Can include percentage complete and current step description.
 * 
 * @constant {Tool}
 */
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

/**
 * Task Complete Tool
 * 
 * Signals that the task has been completed successfully. Should be
 * called when the user's goal has been achieved. Includes summary,
 * list of modified files, and optional next steps.
 * 
 * @constant {Tool}
 */
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

/**
 * Task Blocked Tool
 * 
 * Signals that the task cannot proceed due to an unrecoverable issue.
 * Includes reason for blockage, optional suggestion for the user,
 * and technical error details if applicable.
 * 
 * @constant {Tool}
 */
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

/**
 * Think Tool
 * 
 * Allows the agent to reason through a complex problem before taking
 * action. Useful for planning multi-step tasks. The thought is recorded
 * in conversation context but may not be shown to the user.
 * 
 * @constant {Tool}
 */
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

/**
 * Array of all control flow tools.
 * 
 * Register these tools with the ToolRegistry to enable agent
 * control flow capabilities.
 * 
 * @constant {Tool[]}
 */
export const controlTools: Tool[] = [
  askUserTool,
  reportProgressTool,
  taskCompleteTool,
  taskBlockedTool,
  thinkTool
];
