/**
 * @fileoverview Agent Core - Orchestrator Architecture
 *
 * The agent is a lightweight orchestrator that:
 * 1. Classifies user intent
 * 2. Routes to appropriate tools
 * 3. Delegates coding work to harnesses
 *
 * @module agent/core
 * @see {@link classifyIntent} - Intent classification
 * @see {@link ToolRegistry} - Tool registry
 * @see {@link buildOrchestratorPrompt} - System prompt
 */

import OpenAI from 'openai';
import { Session, Message } from '../session/types.js';
import { logger } from '../utils/logger.js';
import { classifyIntent, type IntentType } from './intent.js';
import {
  buildOrchestratorPrompt,
  buildTaskFramePrompt,
  CORE_IDENTITY,
  CAPABILITIES,
} from './prompts.js';
import { getToolRegistry } from '../tools/registry.js';
import { formatForWhatsApp } from './whatsapp-format.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Agent response
 */
export interface AgentResponse {
  /** Text response to user */
  text: string;
  /** Tool calls made (for logging) */
  toolCalls?: ToolCallRecord[];
  /** Whether a task was started */
  taskStarted?: boolean;
  /** Task ID if started */
  taskId?: string;
}

/**
 * Tool call record
 */
export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MODEL = process.env.AGENT_MODEL ?? 'openai/gpt-4o-mini';
const MAX_TOOL_CALLS = 5;
const MAX_CONSECUTIVE_ERRORS = 3;
const ERROR_BACKOFF_MS = [1000, 5000, 30000];

// =============================================================================
// ERROR TRACKING (Circuit Breaker)
// =============================================================================

const errorTracker = new Map<string, { count: number; lastError: number }>();

/**
 * Track an error for a session
 * @returns true if should continue, false if circuit breaker triggered
 */
function trackError(sessionId: string): boolean {
  const now = Date.now();
  const tracker = errorTracker.get(sessionId) ?? { count: 0, lastError: 0 };
  
  // Reset if last error was more than 5 minutes ago
  if (now - tracker.lastError > 5 * 60 * 1000) {
    tracker.count = 0;
  }
  
  tracker.count++;
  tracker.lastError = now;
  errorTracker.set(sessionId, tracker);
  
  if (tracker.count >= MAX_CONSECUTIVE_ERRORS) {
    logger.warn(`Circuit breaker triggered for session ${sessionId}`, {
      errorCount: tracker.count,
    });
    return false;
  }
  
  return true;
}

/**
 * Reset error count for a session (on success)
 */
function resetErrorCount(sessionId: string): void {
  errorTracker.delete(sessionId);
}

/**
 * Get backoff time for current error count
 */
function getBackoffTime(sessionId: string): number {
  const tracker = errorTracker.get(sessionId);
  if (!tracker) return 0;
  const index = Math.min(tracker.count - 1, ERROR_BACKOFF_MS.length - 1);
  return ERROR_BACKOFF_MS[index] ?? 0;
}

/**
 * Determine if an error is retriable
 * 400-level errors (except 429) are generally not retriable
 * 500-level errors and network errors are retriable
 */
function isRetriableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Check for HTTP status codes in error message or properties
    const errorAny = error as Error & { status?: number; statusCode?: number; code?: string };
    const status = errorAny.status ?? errorAny.statusCode;
    
    // 429 (rate limit) is retriable
    if (status === 429) return true;
    
    // Other 4xx errors are not retriable
    if (status && status >= 400 && status < 500) return false;
    
    // Network errors are retriable
    if (errorAny.code === 'ECONNRESET' || errorAny.code === 'ETIMEDOUT') return true;
    
    // 5xx errors are retriable
    if (status && status >= 500) return true;
  }
  
  // Default to retriable for unknown errors
  return true;
}

// =============================================================================
// OPENAI CLIENT
// =============================================================================

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not set');
    }
    openaiClient = new OpenAI({ 
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
  }
  return openaiClient;
}

// =============================================================================
// MAIN AGENT FUNCTION
// =============================================================================

/**
 * Process a user message through the agent
 *
 * @param message - User message
 * @param session - Current session
 * @returns Agent response
 */
export async function processMessage(
  message: string,
  session: Session
): Promise<AgentResponse> {
  const startTime = Date.now();

  try {
    // Check circuit breaker
    const tracker = errorTracker.get(session.id);
    if (tracker && tracker.count >= MAX_CONSECUTIVE_ERRORS) {
      const timeSinceError = Date.now() - tracker.lastError;
      const backoff = getBackoffTime(session.id);
      
      if (timeSinceError < backoff) {
        logger.warn('Circuit breaker active, rejecting request', {
          sessionId: session.id,
          errorCount: tracker.count,
          backoffRemaining: backoff - timeSinceError,
        });
        return {
          text: "🐕 I'm taking a short break after some hiccups. Try again in a moment!",
        };
      }
    }

    // 1. Classify intent
    const intent = classifyIntent(message, session);
    logger.info('Intent classified', {
      type: intent.type,
      confidence: intent.confidence,
      reason: intent.reason,
    });

    // 2. Route based on intent
    let response: AgentResponse;
    switch (intent.type) {
      case 'conversation':
        response = await handleConversation(message, session);
        break;

      case 'workspace':
      case 'task':
        response = await handleWithTools(message, session, intent.type);
        break;

      default:
        response = await handleConversation(message, session);
    }

    // Success - reset error count
    resetErrorCount(session.id);
    return response;

  } catch (error) {
    logger.error('Agent error', { error, sessionId: session.id });
    
    // Track error for circuit breaker
    const shouldContinue = trackError(session.id);
    
    // Check if it's a retriable error
    const isRetriable = isRetriableError(error);
    
    if (!shouldContinue) {
      return {
        text: "🐕 I've run into too many issues. Let me rest for a bit. Try again in a few minutes!",
      };
    }
    
    if (!isRetriable) {
      // Non-retriable errors (400, 401, 404) - don't suggest retry
      return {
        text: `🐕 Something went wrong: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
    
    return {
      text: "🐕 Oops! Something went wrong. Let me shake that off and try again. What were you trying to do?",
    };
  } finally {
    const duration = Date.now() - startTime;
    logger.debug('Agent response time', { duration });
  }
}

// =============================================================================
// CONVERSATION HANDLER
// =============================================================================

/**
 * Handle conversation intent (no tools needed)
 */
async function handleConversation(
  message: string,
  session: Session
): Promise<AgentResponse> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: buildConversationPrompt(session),
      },
      ...buildMessageHistory(session),
      { role: 'user', content: message },
    ],
    max_tokens: 300,
    temperature: 0.7,
  });

  const text = response.choices[0]?.message?.content ?? "Hey! 🐕";

  return {
    text: formatForWhatsApp(text),
  };
}

/**
 * Build conversation-only prompt
 * 
 * This prompt is used for casual chat that doesn't require tools.
 * It should handle:
 * - Greetings and farewells
 * - "What can you do?" / help requests
 * - General coding questions
 * - Affirmations and reactions
 */
function buildConversationPrompt(session: Session): string {
  const hasProject = !!session.currentProject;
  
  // Build context-aware status line
  let statusLine: string;
  if (hasProject) {
    const project = session.currentProject!;
    statusLine = `📂 Currently working on: **${project.name}**`;
    if (project.gitBranch) {
      statusLine += ` (${project.gitBranch})`;
    }
  } else {
    statusLine = '📂 No project selected yet';
  }

  // Build conversation history summary if available
  const historyContext = session.messages && session.messages.length > 2
    ? `\n\n_Recent context: ${session.messages.length} messages in our conversation_`
    : '';

  return `${CORE_IDENTITY}

## Current Status
${statusLine}${historyContext}

${CAPABILITIES}

## Conversation Guidelines

**When asked "what can you do?" or "help":**
- Give a warm, concise overview of your capabilities
- Mention the most useful commands: "list projects", "switch to [name]", "status"
- If no project is selected, suggest starting with "list projects"
- Keep it scannable - use short lines

**When greeting or being greeted:**
- Be warm but brief: "Hey! 🐕 What are we working on today?"
- If there's an active project, mention it
- Offer to help without being pushy

**When thanked:**
- Accept graciously: "Happy to help! 🐕"
- Optionally mention what you can do next

**When asked general coding questions:**
- Give helpful, concise answers
- If the question needs code context, suggest selecting a project first
- Be educational but not condescending

**When the request is unclear:**
- Ask ONE clarifying question
- Offer 2-3 options if helpful
- Never guess what they mean

## Response Format

- Keep responses under 100 words for chat
- Use line breaks for readability
- Bold **key commands** when explaining
- End with a question or next step when appropriate

## Edge Cases

**User seems frustrated:**
→ Acknowledge, stay helpful, offer concrete next step

**User asks something you can't do:**
→ Be honest, explain why, suggest alternative

**User sends just emoji or "ok":**
→ Brief acknowledgment, ask if they need anything

**User asks about non-coding topics:**
→ Gently redirect: "I'm best with code stuff! Got a project I can help with?"`;
}

// =============================================================================
// TOOL HANDLER
// =============================================================================

/**
 * Handle workspace/task intent (with tools)
 */
async function handleWithTools(
  message: string,
  session: Session,
  _intent: IntentType
): Promise<AgentResponse> {
  const openai = getOpenAI();
  const registry = getToolRegistry();
  const tools = registry.toOpenAIFormat();
  const toolCalls: ToolCallRecord[] = [];

  // Build messages
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildOrchestratorPrompt(session) },
    ...buildMessageHistory(session),
    { role: 'user', content: message },
  ];

  let response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    tools: tools as OpenAI.Chat.Completions.ChatCompletionTool[],
    tool_choice: 'auto',
    max_tokens: 500,
    temperature: 0.3,
  });

  let callCount = 0;

  // Process tool calls
  while (
    response.choices[0]?.message?.tool_calls &&
    response.choices[0].message.tool_calls.length > 0 &&
    callCount < MAX_TOOL_CALLS
  ) {
    const assistantMessage = response.choices[0].message;
    const currentToolCalls = assistantMessage.tool_calls!;
    messages.push(assistantMessage);

    // Execute each tool call
    for (const toolCall of currentToolCalls) {
      callCount++;

      // Handle both standard and custom tool call formats
      const fn = 'function' in toolCall ? toolCall.function : null;
      if (!fn) continue;
      
      const toolName = fn.name;
      const toolArgs = JSON.parse(fn.arguments);

      logger.debug('Executing tool', { tool: toolName, args: toolArgs });

      // Execute via registry
      const result = await registry.execute(toolName, toolArgs);

      toolCalls.push({
        name: toolName,
        args: toolArgs,
        result,
      });

      // Add tool result to messages
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    // Get next response
    response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: tools as OpenAI.Chat.Completions.ChatCompletionTool[],
      tool_choice: 'auto',
      max_tokens: 500,
      temperature: 0.3,
    });
  }

  // Get final text response
  const text =
    response.choices[0]?.message?.content ??
    "Done! 🐕 Let me know if you need anything else.";

  // Check if a task was started
  const taskCall = toolCalls.find((tc) => tc.name === 'task_create');
  const taskId = taskCall?.result &&
    typeof taskCall.result === 'object' &&
    'metadata' in (taskCall.result as Record<string, unknown>)
      ? ((taskCall.result as Record<string, unknown>).metadata as Record<string, unknown>)?.taskId as string
      : undefined;

  return {
    text: formatForWhatsApp(text),
    toolCalls,
    taskStarted: !!taskCall,
    taskId,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Build message history for context
 */
function buildMessageHistory(
  session: Session,
  maxMessages = 10
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  if (!session.messages) {
    return [];
  }

  return session.messages
    .slice(-maxMessages)
    .map((msg: Message) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
}

// =============================================================================
// TASK FRAMING (for complex requests)
// =============================================================================

/**
 * Frame a user request as a task goal
 *
 * Used when the user's request needs to be transformed into
 * a clear goal for the harness.
 *
 * @param message - Original user message
 * @param session - Current session
 * @returns Framed task goal
 */
export async function frameTaskGoal(
  message: string,
  session: Session
): Promise<string> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: buildTaskFramePrompt(session, message),
      },
    ],
    max_tokens: 200,
    temperature: 0.3,
  });

  return (
    response.choices[0]?.message?.content ?? message
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export { classifyIntent };
