/**
 * @fileoverview Action Mode Handler
 * 
 * Handles single edit operations with one approval cycle. Optimized for
 * quick, targeted changes like "fix the typo" or "add error handling".
 * 
 * @module agent/action
 * @see {@link handleAction} - Main entry point
 * @see {@link ActionProposal} - Proposal structure for approvals
 * @see {@link ACTION_TOOLS} - Available tools in this mode
 * 
 * ## When Used
 * 
 * Action mode is triggered when the intent classifier detects:
 * - "Fix the typo on line 42"
 * - "Add a null check to the login function"
 * - "Change the button color to blue"
 * - "Rename the variable from x to userId"
 * 
 * ## Workflow
 * 
 * ```
 * User Request
 *      │
 *      ▼
 * ┌─────────────┐
 * │ LLM Plans   │ ← Determines single action needed
 * │ Action      │
 * └─────┬───────┘
 *       │
 *       ▼
 * ┌─────────────┐
 * │ Create      │ ← Generate diff preview
 * │ Proposal    │
 * └─────┬───────┘
 *       │
 *       ▼
 * ┌─────────────┐
 * │ User        │ ← "yes" or "no"
 * │ Approval    │
 * └─────┬───────┘
 *       │
 *       ▼
 * ┌─────────────┐
 * │ Execute &   │ ← Apply change, optionally commit
 * │ Done        │
 * └─────────────┘
 * ```
 * 
 * ## Available Tools
 * 
 * | Tool | Purpose | Approval |
 * |------|---------|----------|
 * | read_file | Read before editing | Auto |
 * | write_file | Create new files | Required |
 * | edit_file | Modify existing | Required |
 * | list_directory | Find files | Auto |
 * | search_files | Pattern search | Auto |
 * | run_command | Shell commands | Required |
 * | git_commit | Commit changes | Required |
 * 
 * @example
 * ```typescript
 * import { handleAction } from './action.js';
 * 
 * const responses = await handleAction(
 *   session,
 *   "Fix the typo: 'recieve' -> 'receive'",
 *   { type: 'action', confidence: 0.8, reason: 'single_change' },
 *   sessionManager,
 *   toolRegistry
 * );
 * // Returns approval request with diff preview
 * ```
 */

import OpenAI from 'openai';
import { Session } from '../session/types.js';
import { SessionManager } from '../session/manager.js';
import { ToolRegistry } from '../tools/registry.js';
import { logger } from '../utils/logger.js';
import { ClassifiedIntent } from './intent.js';
import { getCurrentCommit } from '../tools/git.js';
import { buildActionPrompt, buildMessageHistory } from './prompts.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** OpenRouter API key from environment */
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/** LLM model to use (configurable via AGENT_MODEL env var) */
const MODEL = process.env.AGENT_MODEL || 'openai/gpt-4o-mini';

/**
 * Type for function tool calls with proper typing.
 * Narrows the generic tool call to function-specific structure.
 */
type FunctionToolCall = OpenAI.Chat.ChatCompletionMessageToolCall & {
  type: 'function';
  function: { name: string; arguments: string };
};

/**
 * Tools available in action mode.
 * Includes both read-only (auto-approve) and write (require approval).
 * @constant {string[]}
 */
const ACTION_TOOLS = [
  'read_file',
  'write_file',
  'edit_file',
  'list_directory',
  'search_files',
  'run_command',
  'git_commit',
];

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Represents a proposed action awaiting user approval.
 * 
 * @interface ActionProposal
 * @property {string} tool - Name of the tool to execute
 * @property {Record<string, unknown>} args - Arguments for the tool
 * @property {string} description - Human-readable description
 * @property {string} [diff] - Optional diff preview for edits
 */
export interface ActionProposal {
  tool: string;
  args: Record<string, unknown>;
  description: string;
  diff?: string;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Handles action mode - single edit with one approval cycle.
 * 
 * Analyzes the user's request, determines the single action needed,
 * and either auto-executes (for reads) or creates an approval request
 * (for writes).
 * 
 * @param {Session} session - Current user session
 * @param {string} message - The user's change request
 * @param {ClassifiedIntent} intent - Classification result
 * @param {SessionManager} sessionManager - For state management
 * @param {ToolRegistry} toolRegistry - Available tools
 * @returns {Promise<string[]>} Response or approval request
 * 
 * @example
 * ```typescript
 * // Simple fix - returns approval request
 * await handleAction(session, "Fix typo on line 5", intent, sm, tr);
 * // → ["📝 **Action Proposed**\n\nEdit file: src/app.ts\n\n..."]
 * 
 * // Read operation - auto-executes
 * await handleAction(session, "Read the config file", intent, sm, tr);
 * // → ["📄 config.ts contains: ..."]
 * ```
 */
export async function handleAction(
  session: Session,
  message: string,
  intent: ClassifiedIntent,
  sessionManager: SessionManager,
  toolRegistry: ToolRegistry
): Promise<string[]> {
  logger.info('Action mode', { 
    userId: session.userId, 
    reason: intent.reason,
    message: message.substring(0, 50)
  });

  const openai = new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1'
  });

  // Get action tools
  const tools = getActionTools(toolRegistry);
  
  // Use centralized prompt builder
  const systemPrompt = buildActionPrompt(session);

  try {
    // Ask LLM what single action to take
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...buildMessageHistory(session, 4),
        { role: 'user', content: message }
      ],
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      max_tokens: 1000,
      temperature: 0.2, // Low temperature for precise actions
    });

    const assistantMessage = response.choices[0]?.message;
    
    // If no tool call, maybe it's just a question
    if (!assistantMessage?.tool_calls || assistantMessage.tool_calls.length === 0) {
      const reply = assistantMessage?.content?.trim() || 
        "I understand you want to make a change. Could you be more specific about what to modify?";
      await sessionManager.addAssistantMessage(session, reply);
      return [reply];
    }

    // Get the first tool call (action mode = single action)
    const toolCall = assistantMessage.tool_calls[0];
    
    // Type guard - only handle function calls
    if (toolCall.type !== 'function') {
      return ["I couldn't determine what action to take. Please try rephrasing."];
    }
    
    const toolName = toolCall.function.name;
    const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

    // Check if this is a read operation (no approval needed)
    if (isReadOperation(toolName)) {
      return await executeAndRespond(
        toolCall as FunctionToolCall,
        toolRegistry,
        sessionManager,
        session,
        message,
        openai,
        systemPrompt
      );
    }

    // For write operations, create approval request
    const proposal = await createProposal(toolName, toolArgs, toolRegistry);
    
    // Set pending approval in session
    await sessionManager.startTask(session, message);
    
    // Record git state for potential undo
    const gitCommit = await getCurrentCommit();
    if (gitCommit && !session.gitStartCommit) {
      await sessionManager.setGitStartCommit(session, gitCommit);
    }
    
    await sessionManager.setPendingApproval(
      session,
      toolName,
      toolArgs,
      proposal.description,
      proposal.diff
    );

    // Format approval request
    const approvalMessage = formatActionApproval(proposal);
    
    return [approvalMessage];
    
  } catch (error) {
    logger.error('Action mode error', { error });
    return ["I had trouble planning that action. Could you describe what you want to change?"];
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Filters the tool registry to only include action-appropriate tools.
 * 
 * @param {ToolRegistry} toolRegistry - Full tool registry
 * @returns {OpenAI.Chat.ChatCompletionTool[]} Filtered tools in OpenAI format
 */
function getActionTools(
  toolRegistry: ToolRegistry
): OpenAI.Chat.ChatCompletionTool[] {
  // Get all tools in OpenAI format, filter to action tools
  const allTools = toolRegistry.toOpenAIFormat();
  return allTools.filter(t => ACTION_TOOLS.includes(t.function.name));
}

/**
 * Checks if a tool operation is read-only (doesn't need approval).
 * 
 * @param {string} toolName - Name of the tool
 * @returns {boolean} True if read-only, false if requires approval
 */
function isReadOperation(toolName: string): boolean {
  return ['read_file', 'list_directory', 'search_files', 'search_code'].includes(toolName);
}

/**
 * Executes a read operation and generates a response with the results.
 * 
 * @param {FunctionToolCall} toolCall - The tool call to execute
 * @param {ToolRegistry} toolRegistry - Tool implementations
 * @param {SessionManager} sessionManager - For updating session
 * @param {Session} session - Current session
 * @param {string} originalMessage - User's original request
 * @param {OpenAI} openai - OpenAI client instance
 * @param {string} systemPrompt - System prompt for follow-up
 * @returns {Promise<string[]>} Generated response
 */
async function executeAndRespond(
  toolCall: FunctionToolCall,
  toolRegistry: ToolRegistry,
  sessionManager: SessionManager,
  session: Session,
  originalMessage: string,
  openai: OpenAI,
  systemPrompt: string
): Promise<string[]> {
  const tool = toolRegistry.get(toolCall.function.name);
  if (!tool) {
    return [`Tool ${toolCall.function.name} not found`];
  }

  const args = JSON.parse(toolCall.function.arguments || '{}');
  const result = await tool.execute(args);

  // Generate response with the information
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: originalMessage },
      { 
        role: 'assistant', 
        content: null,
        tool_calls: [toolCall] 
      },
      {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result.success ? result.output : `Error: ${result.error}`
      }
    ],
    max_tokens: 1000,
    temperature: 0.3,
  });

  const reply = response.choices[0]?.message?.content?.trim() ||
    "I read the information. What would you like me to do with it?";

  await sessionManager.addAssistantMessage(session, reply);
  return [reply];
}

/**
 * Creates an action proposal from a tool call.
 * 
 * Generates a human-readable description and optional diff preview
 * for the proposed action.
 * 
 * @param {string} toolName - Name of the tool
 * @param {Record<string, unknown>} toolArgs - Tool arguments
 * @param {ToolRegistry} _toolRegistry - Tool registry (unused but available)
 * @returns {Promise<ActionProposal>} The formatted proposal
 */
async function createProposal(
  toolName: string,
  toolArgs: Record<string, unknown>,
  _toolRegistry: ToolRegistry
): Promise<ActionProposal> {
  let description = '';
  let diff: string | undefined;

  switch (toolName) {
    case 'write_file':
      description = `Create/overwrite file: ${toolArgs.path}`;
      // Could generate preview diff here
      break;
      
    case 'edit_file':
      description = `Edit file: ${toolArgs.path}`;
      if (toolArgs.old_string && toolArgs.new_string) {
        diff = `- ${toolArgs.old_string}\n+ ${toolArgs.new_string}`;
      }
      break;
      
    case 'run_command':
      description = `Run command: ${toolArgs.command}`;
      break;
      
    case 'git_commit':
      description = `Commit: ${toolArgs.message}`;
      break;
      
    default:
      description = `${toolName} with args: ${JSON.stringify(toolArgs)}`;
  }

  return { tool: toolName, args: toolArgs, description, diff };
}

/**
 * Formats an action proposal as a mobile-friendly approval request.
 * 
 * Creates a WhatsApp-compatible message with the action description,
 * optional diff preview, and approval buttons.
 * 
 * @param {ActionProposal} proposal - The proposal to format
 * @returns {string} Formatted approval message
 * 
 * @example
 * ```typescript
 * const proposal = {
 *   tool: 'edit_file',
 *   args: { path: 'src/app.ts' },
 *   description: 'Edit file: src/app.ts',
 *   diff: '- old code\n+ new code'
 * };
 * formatActionApproval(proposal);
 * // Returns:
 * // 📝 **Action Proposed**
 * //
 * // Edit file: src/app.ts
 * //
 * // ```diff
 * // - old code
 * // + new code
 * // ```
 * //
 * // ✅ yes | ❌ no
 * ```
 */
function formatActionApproval(proposal: ActionProposal): string {
  const parts = ['📝 **Action Proposed**', '', proposal.description];
  
  if (proposal.diff) {
    parts.push('', '```diff', proposal.diff, '```');
  }
  
  parts.push('', '✅ yes | ❌ no');
  
  return parts.join('\n');
}
