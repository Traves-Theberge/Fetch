/**
 * @fileoverview Inquiry Mode Handler
 * 
 * Handles questions about code using read-only tools. No approval needed
 * since all operations are non-destructive. Optimized for code exploration
 * and understanding existing codebases.
 * 
 * @module agent/inquiry
 * @see {@link handleInquiry} - Main entry point
 * @see {@link INQUIRY_TOOLS} - Available read-only tools
 * 
 * ## When Used
 * 
 * Inquiry mode is triggered when the intent classifier detects:
 * - "What's in auth.ts?"
 * - "Show me the user model"
 * - "How does the login work?"
 * - "Find all TODO comments"
 * - "What's the git status?"
 * 
 * ## Available Tools
 * 
 * | Tool | Purpose |
 * |------|---------|
 * | read_file | Read file contents |
 * | list_directory | List folder contents |
 * | search_files | Find files by pattern |
 * | search_code | Search text in files |
 * | git_status | Current git state |
 * | git_log | Recent commits |
 * | git_diff | Uncommitted changes |
 * 
 * ## Characteristics
 * 
 * - **Read-only**: No file modifications allowed
 * - **Auto-approve**: No user confirmation needed
 * - **Tool-assisted**: Uses tools to find information
 * - **Summarized**: Answers are concise and mobile-friendly
 * 
 * @example
 * ```typescript
 * import { handleInquiry } from './inquiry.js';
 * 
 * const responses = await handleInquiry(
 *   session,
 *   "What's in src/auth.ts?",
 *   { type: 'inquiry', confidence: 0.8, reason: 'code_question' },
 *   sessionManager,
 *   toolRegistry
 * );
 * // ["📄 auth.ts contains the authentication logic...", ...]
 * ```
 */

import OpenAI from 'openai';
import { Session } from '../session/types.js';
import { SessionManager } from '../session/manager.js';
import { ToolRegistry } from '../tools/registry.js';
import { logger } from '../utils/logger.js';
import { ClassifiedIntent } from './intent.js';
import { buildInquiryPrompt, buildMessageHistory } from './prompts.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** OpenRouter API key from environment */
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/** LLM model to use (configurable via AGENT_MODEL env var) */
const MODEL = process.env.AGENT_MODEL || 'openai/gpt-4o-mini';

/**
 * Read-only tools allowed in inquiry mode.
 * These tools cannot modify files or execute destructive commands.
 * @constant {string[]}
 */
const INQUIRY_TOOLS = [
  'read_file',
  'list_directory', 
  'search_files',
  'search_code',
  'git_status',
  'git_log',
  'git_diff',
];

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Handles inquiry mode - answers questions using read-only tools.
 * 
 * Makes LLM calls with access to read-only tools, executes them automatically
 * (no approval needed), and generates a summarized response.
 * 
 * @param {Session} session - Current user session with context
 * @param {string} message - The user's question
 * @param {ClassifiedIntent} intent - Classification result
 * @param {SessionManager} sessionManager - For updating session state
 * @param {ToolRegistry} toolRegistry - Available tools
 * @returns {Promise<string[]>} Array of response messages
 * 
 * @example
 * ```typescript
 * // File content question
 * await handleInquiry(session, "What's in config.ts?", intent, sm, tr);
 * // → ["📄 config.ts defines the application configuration..."]
 * 
 * // Git status question
 * await handleInquiry(session, "What's changed?", intent, sm, tr);
 * // → ["📊 You have 3 modified files: auth.ts, user.ts, index.ts"]
 * ```
 */
export async function handleInquiry(
  session: Session,
  message: string,
  intent: ClassifiedIntent,
  sessionManager: SessionManager,
  toolRegistry: ToolRegistry
): Promise<string[]> {
  logger.info('Inquiry mode', { 
    userId: session.userId, 
    reason: intent.reason,
    message: message.substring(0, 50)
  });

  const openai = new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1'
  });

  // Get read-only tools
  const tools = getInquiryTools(toolRegistry);
  
  // Use centralized prompt builder
  const systemPrompt = buildInquiryPrompt(session);

  try {
    // First call - may request tool use
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
      temperature: 0.3, // Low temperature for factual answers
    });

    const assistantMessage = response.choices[0]?.message;
    
    // If no tool calls, return the response
    if (!assistantMessage?.tool_calls || assistantMessage.tool_calls.length === 0) {
      const reply = assistantMessage?.content?.trim() || 
        "I couldn't find what you're looking for. Can you be more specific?";
      await sessionManager.addAssistantMessage(session, reply);
      return [reply];
    }

    // Execute read-only tools (no approval needed)
    const toolResults = await executeInquiryTools(
      assistantMessage.tool_calls,
      toolRegistry
    );

    // Second call - generate response with tool results
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...buildMessageHistory(session, 4),
      { role: 'user', content: message },
      { 
        role: 'assistant', 
        content: assistantMessage.content || null,
        tool_calls: assistantMessage.tool_calls 
      },
      ...toolResults.map(tr => ({
        role: 'tool' as const,
        tool_call_id: tr.id,
        content: tr.result
      }))
    ];

    const finalResponse = await openai.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 1500,
      temperature: 0.3,
    });

    const reply = finalResponse.choices[0]?.message?.content?.trim() ||
      "I found some information but couldn't summarize it. Let me know if you need more details.";

    await sessionManager.addAssistantMessage(session, reply);
    
    logger.debug('Inquiry complete', { 
      toolsUsed: toolResults.length,
      replyLength: reply.length
    });
    
    return [reply];
    
  } catch (error) {
    logger.error('Inquiry mode error', { error });
    return ["I had trouble looking that up. Could you rephrase your question?"];
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Filters the tool registry to only include read-only inquiry tools.
 * 
 * @param {ToolRegistry} toolRegistry - Full tool registry
 * @returns {OpenAI.Chat.ChatCompletionTool[]} Filtered tools in OpenAI format
 */
function getInquiryTools(
  toolRegistry: ToolRegistry
): OpenAI.Chat.ChatCompletionTool[] {
  // Get all tools in OpenAI format, filter to inquiry-only
  const allTools = toolRegistry.toOpenAIFormat();
  return allTools.filter(t => INQUIRY_TOOLS.includes(t.function.name));
}

/**
 * Executes read-only tools without requiring user approval.
 * 
 * Iterates through tool calls, validates they're read-only, and executes them.
 * Long outputs are truncated for mobile display.
 * 
 * @param {OpenAI.Chat.ChatCompletionMessageToolCall[]} toolCalls - Tools to execute
 * @param {ToolRegistry} toolRegistry - Tool implementations
 * @returns {Promise<Array<{id: string; result: string}>>} Results for each tool call
 */
async function executeInquiryTools(
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[],
  toolRegistry: ToolRegistry
): Promise<Array<{ id: string; result: string }>> {
  const results: Array<{ id: string; result: string }> = [];
  
  for (const call of toolCalls) {
    // Type guard - only handle function calls
    if (call.type !== 'function') {
      continue;
    }
    
    const toolName = call.function.name;
    
    // Safety check - only allow read-only tools
    if (!INQUIRY_TOOLS.includes(toolName)) {
      results.push({
        id: call.id,
        result: `Tool ${toolName} not available in inquiry mode`
      });
      continue;
    }
    
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      results.push({
        id: call.id,
        result: `Tool ${toolName} not found`
      });
      continue;
    }
    
    try {
      const args = JSON.parse(call.function.arguments || '{}');
      const result = await tool.execute(args);
      
      // Truncate long results for mobile
      const output = result.output.length > 2000 
        ? result.output.substring(0, 2000) + '\n... (truncated)'
        : result.output;
        
      results.push({
        id: call.id,
        result: result.success ? output : `Error: ${result.error}`
      });
      
      logger.debug('Inquiry tool executed', { tool: toolName, success: result.success });
      
    } catch (error) {
      results.push({
        id: call.id,
        result: `Error executing ${toolName}: ${error}`
      });
    }
  }
  
  return results;
}
