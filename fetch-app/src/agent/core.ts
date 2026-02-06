/**
 * @fileoverview Agent Core - Orchestrator Architecture
 *
 * The agent is a lightweight orchestrator that:
 * 1. Classifies user intent
 * 2. Routes to appropriate tools
 * 3. Delegates coding work to harnesses
 *
 * System prompt is built by IdentityManager.buildSystemPrompt() — the single
 * source of truth for Fetch's persona, skills, pack, and session context.
 *
 * @module agent/core
 * @see {@link classifyIntent} - Intent classification
 * @see {@link ToolRegistry} - Tool registry
 * @see {@link IdentityManager} - System prompt builder
 */

import OpenAI from 'openai';
import { Session } from '../session/types.js';
import { logger } from '../utils/logger.js';
import { classifyIntent } from './intent.js';
import {
  buildTaskFramePrompt,
  buildContextSection,
} from './prompts.js';
import { getToolRegistry } from '../tools/registry.js';
import { getSessionManager } from '../session/manager.js';
import { generateRepoMap } from '../workspace/repo-map.js';
import { getInstinctRegistry, FetchMode, type InstinctAction } from '../instincts/index.js';
import { getIdentityManager } from '../identity/manager.js';
import { getSkillManager } from '../skills/manager.js';
import { env } from '../config/env.js';
import { pipeline } from '../config/pipeline.js';
import { modeDetector } from '../conversation/detector.js'; // Phase 8: Mode Detection
import { threadManager } from '../conversation/thread.js'; // Phase 8: Threading

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
  /** Detected conversation mode */
  mode?: string;
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

const MODEL = env.AGENT_MODEL;
const MAX_TOOL_CALLS = pipeline.maxToolCalls;
const MAX_CONSECUTIVE_ERRORS = pipeline.circuitBreakerThreshold;
const ERROR_BACKOFF_MS = pipeline.circuitBreakerBackoff;

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
  
  // Reset if last error was more than the configured reset window
  if (now - tracker.lastError > pipeline.circuitBreakerResetMs) {
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
function isRetriableError(error: unknown, attempt: number): boolean {
  if (error instanceof Error) {
    // Check for HTTP status codes in error message or properties
    const errorAny = error as Error & { status?: number; statusCode?: number; code?: string };
    const status = errorAny.status ?? errorAny.statusCode;
    
    // 429 (rate limit) is retriable
    if (status === 429) return true;
    
    // 400 (bad request) is retriable once with simplified context
    if (status === 400) return attempt < 2;
    
    // Network errors are retriable
    if (errorAny.code === 'ECONNRESET' || errorAny.code === 'ETIMEDOUT') return true;
    
    // 5xx errors are retriable
    if (status && status >= 500) return true;
    
    // Other 4xx errors are not retriable
    if (status && status >= 400 && status < 500) return false;
  }
  
  // Default to retriable for unknown errors
  return true;
}

/**
 * Execute an agent operation with retry logic and progress reporting
 *
 * @param fn - Function to execute (receives attempt number)
 * @param sessionId - Session identifier for logging
 * @param onProgress - Optional callback for user progress messages
 */
async function handleWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  sessionId: string,
  onProgress?: (text: string) => Promise<void>
): Promise<T> {
  const maxAttempts = pipeline.maxRetries + 1; // retries + initial attempt
  const backoffs = pipeline.retryBackoff;
  const retryMessages = [
    "Hold on, fetching again... 🐕",
    "Still working on it, be patient! 🐕",
    "One last try, I'm determined! 🐕"
  ];

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        const delay = backoffs[attempt - 1] ?? 10000;
        logger.info(`Retrying request for session ${sessionId}`, { attempt, delay });
        
        // Report progress to user if callback provided
        if (onProgress) {
          const retryMessage = retryMessages[attempt - 2] ?? "Still trying... 🐕";
          await onProgress(retryMessage);
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      
      const isRetriable = isRetriableError(error, attempt);
      const isLastAttempt = attempt === maxAttempts;
      
      if (!isRetriable || isLastAttempt) {
        throw error;
      }
      
      logger.warn(`Request failed, will retry`, {
        sessionId,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw lastError;
}

// =============================================================================
// OPENAI CLIENT
// =============================================================================

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = env.OPENROUTER_API_KEY;
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
// MODE & REFLEX HELPERS
// =============================================================================

/**
 * Handle instinct actions (stop, undo, clear, etc.)
 */
async function handleInstinctAction(
  action: InstinctAction,
  session: Session,
  sManager: ReturnType<typeof getSessionManager> extends Promise<infer T> ? T : never
): Promise<void> {
  switch (action.type) {
    case 'stop':
      // Cancel current task if any (V3.3: use TaskManager)
      if (session.activeTaskId) {
        const { getTaskManager } = await import('../task/manager.js');
        const tm = await getTaskManager();
        try {
          await tm.cancelTask(session.activeTaskId);
        } catch { /* may already be cancelled */ }
        session.activeTaskId = null;
        logger.info('Instinct action: stopping task');
        await sManager.updateSession(session);
      }
      break;
      
    case 'undo':
      // TODO: Implement git undo logic
      logger.info('Instinct action: undo requested');
      break;
      
    case 'clear':
      // Clear session context but keep preferences
      logger.info('Instinct action: clearing session');
      session.messages = [];
      session.activeFiles = [];
      session.repoMap = null;
      session.activeTaskId = null;
      await sManager.updateSession(session);
      break;
      
    case 'pause':
      // TODO: Implement pause logic
      logger.info('Instinct action: pause requested');
      break;
      
    case 'resume':
      // TODO: Implement resume logic
      logger.info('Instinct action: resume requested');
      break;
      
    default:
      logger.warn('Unknown instinct action', { action });
  }
}

// =============================================================================
// MAIN AGENT FUNCTION
// =============================================================================

/**
 * Process a user message through the agent
 *
 * @param message - User message
 * @param session - Current session
 * @param onProgress - Optional callback for intermediate progress messages
 * @returns Agent response
 */
export async function processMessage(
  message: string,
  session: Session,
  onProgress?: (text: string) => Promise<void>
): Promise<AgentResponse> {
  const startTime = Date.now();
  const sManager = await getSessionManager();

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

    // Refresh repo map if needed
    if (session.currentProject && (!session.repoMap || sManager.isRepoMapStale(session))) {
      logger.info('Repo map stale or missing, refreshing...', { sessionId: session.id });
      try {
        const repoMap = await generateRepoMap(session.currentProject.path);
        await sManager.updateRepoMap(session, repoMap);
      } catch (e) {
        logger.error('Failed to refresh repo map', { error: e, sessionId: session.id });
      }
    }

    // =========================================================================
    // 0. CHECK REFLEXS FIRST (Hardwired deterministic responses)
    // =========================================================================
    const instinctRegistry = getInstinctRegistry();
    // Phase 8: Use ModeDetector first
    const detectedMode = modeDetector.detect(message);
    // Build active task context from TaskManager (V3.3)
    let activeTask: { id: string; status: import('../task/types.js').TaskStatus; description: string; goal: string; harness?: string; startedAt?: string } | undefined;
    if (session.activeTaskId) {
      const { getTaskManager } = await import('../task/manager.js');
      const tm = await getTaskManager();
      const tmTask = tm.getTask(session.activeTaskId);
      if (tmTask) {
        activeTask = {
          id: tmTask.id,
          status: tmTask.status,
          description: tmTask.goal,
          goal: tmTask.goal,
          harness: tmTask.agent,
          startedAt: tmTask.startedAt,
        };
      }
    }
    
    // Use the explicit mode if instincts don't override
    const instinctContextMode: FetchMode = (detectedMode.mode === 'TASK' && activeTask?.status === 'running') 
        ? FetchMode.WORKING 
        : FetchMode.ALERT;

    const instinctResult = await instinctRegistry.check({
      message: message.toLowerCase().trim(),
      originalMessage: message,
      session,
      mode: instinctContextMode, 
      activeTask,
      workspace: session.currentProject?.path,
    });
    
    if (instinctResult.matched && instinctResult.response) {
      logger.info('Instinct matched', {
        instinct: instinctResult.instinct,
        action: instinctResult.response.action?.type,
      });
      
      // Handle instinct actions
      if (instinctResult.response.action) {
        await handleInstinctAction(instinctResult.response.action, session, sManager);
      }
      
      // Return if instinct doesn't want to continue processing
      if (!instinctResult.response.continueProcessing) {
        return { 
          text: instinctResult.response.response || "Task updated.", 
          mode: detectedMode.mode
        };
      }
    }

    // Phase 8: Update Thread Context
    const thread = threadManager.getActiveThread();
    threadManager.updateActivity(thread.id, { mode: detectedMode.mode });

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
        response = await handleWithRetry(
          (attempt) => handleConversation(message, session, attempt),
          session.id,
          onProgress
        );
        break;

      case 'action':
        response = await handleWithRetry(
          (attempt) => handleWithTools(message, session, attempt),
          session.id,
          onProgress
        );
        break;

      case 'clarify':
        // V3.1: Clarification flow
        response = {
            text: "🐕 I'm eager to help, but I'm not sure what you mean! Can you be more specific? *head tilt*"
        };
        break;

      default:
        response = await handleWithRetry(
          (attempt) => handleConversation(message, session, attempt),
          session.id,
          onProgress
        );
    }

    // Success - reset error count
    resetErrorCount(session.id);
    return response;

  } catch (error) {
    logger.error('Agent error', { error, sessionId: session.id });
    
    // Track error for circuit breaker
    const shouldContinue = trackError(session.id);
    
    // Check if it's a retriable error
    const isRetriable = isRetriableError(error, 1);
    
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
  session: Session,
  attempt: number = 1
): Promise<AgentResponse> {
  const openai = getOpenAI();

  // Match skills against this message and build activated context
  const skillManager = getSkillManager();
  const matchedSkills = await skillManager.matchSkills(message);
  const activatedContext = skillManager.buildActivatedSkillsContext(matchedSkills);

  // Build session context (workspace, task, git state, summaries)
  const sessionContext = await buildContextSection(session);

  const history = buildMessageHistory(session);
  
  // If retrying from a failure (likely 400 Bad Request or token limit),
  // simplify the history to just the last few exchanges
  const finalHistory = attempt > 1 
    ? history.slice(-3) // Keep only last 3 messages
    : history;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: getIdentityManager().buildSystemPrompt(activatedContext, sessionContext),
      },
      ...finalHistory,
      { role: 'user', content: message },
    ],
    max_tokens: pipeline.chatMaxTokens,
    temperature: pipeline.chatTemperature,
  });

  const text = response.choices[0]?.message?.content ?? "Hey! 🐕";

  return {
    text,
  };
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
  attempt: number = 1
): Promise<AgentResponse> {
  const openai = getOpenAI();
  const registry = getToolRegistry();
  const tools = registry.toOpenAIFormat();
  const toolCalls: ToolCallRecord[] = [];

  // Match skills against this message and build activated context
  const skillManager = getSkillManager();
  const matchedSkills = await skillManager.matchSkills(message);
  const activatedContext = skillManager.buildActivatedSkillsContext(matchedSkills);

  // Build session context (workspace, task, git state, summaries)
  const sessionContext = await buildContextSection(session);

  const history = buildMessageHistory(session);
  
  // If retrying from a failure, simplify context
  const finalHistory = attempt > 1 
    ? history.slice(-2) // Keep even less for tool calls to avoid token limits
    : history;

  // Build messages
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: getIdentityManager().buildSystemPrompt(activatedContext, sessionContext) },
    ...finalHistory,
    { role: 'user', content: message },
  ];

  let response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    tools: tools as OpenAI.Chat.Completions.ChatCompletionTool[],
    tool_choice: 'auto',
    max_tokens: pipeline.toolMaxTokens,
    temperature: pipeline.toolTemperature,
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

    // Persist assistant's tool_call request to session
    const sManager = await getSessionManager();
    const persistableToolCalls = currentToolCalls
      .filter(tc => 'function' in tc && tc.function)
      .map(tc => {
        const fn = (tc as { function: { name: string; arguments: string }; id: string }).function;
        return { id: tc.id, name: fn.name, arguments: fn.arguments };
      });
    if (persistableToolCalls.length > 0) {
      await sManager.addAssistantToolCallMessage(
        session,
        assistantMessage.content || '',
        persistableToolCalls
      );
    }

    // Execute each tool call
    for (const toolCall of currentToolCalls) {
      callCount++;

      // Handle both standard and custom tool call formats
      const fn = 'function' in toolCall ? toolCall.function : null;
      if (!fn) continue;
      
      const toolName = fn.name;
      const toolArgs = JSON.parse(fn.arguments);
      const toolStart = Date.now();

      logger.debug('Executing tool', { tool: toolName, args: toolArgs });

      // Execute via registry (pass session context for session-aware tools)
      const result = await registry.execute(toolName, toolArgs, { sessionId: session.id });

      toolCalls.push({
        name: toolName,
        args: toolArgs,
        result,
      });

      // Persist tool result to session
      await sManager.addToolMessage(
        session,
        { name: toolName, args: toolArgs, result: result.output, duration: Date.now() - toolStart },
        JSON.stringify(result),
        toolCall.id
      );

      // SYNC SESSION STATE BASED ON TOOLS
      if (toolName === 'workspace_select' && result.success) {
        try {
          const workspace = JSON.parse(result.output);
          session.currentProject = {
            name: workspace.name,
            path: workspace.path,
            type: workspace.projectType,
            mainFiles: [], // List might be empty initially
            gitBranch: workspace.git?.branch || null,
            lastCommit: null,
            hasUncommitted: workspace.git?.dirty || false,
            refreshedAt: new Date().toISOString()
          };
          session.repoMap = null; // Clear old map
          
          const sManager = await getSessionManager();
          await sManager.updateSession(session);
          logger.info('Project synced to session after tool call', { project: workspace.name });
        } catch (e) {
          logger.error('Failed to sync session after workspace_select', e);
        }
      }

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
      max_tokens: pipeline.toolMaxTokens,
      temperature: pipeline.toolTemperature,
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
    text,
    toolCalls,
    taskStarted: !!taskCall,
    taskId,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Build message history for context — OpenAI multi-turn format
 *
 * Emits proper tool_calls on assistant messages and tool_call_id on
 * tool result messages. This is the industry-standard format used by
 * OpenAI, Claude API, LangChain, Vercel AI SDK, and every production
 * agent framework for multi-turn tool state.
 */
function buildMessageHistory(
  session: Session,
  maxMessages = pipeline.historyWindow
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const recent = session.messages.slice(-maxMessages);
  const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  for (const msg of recent) {
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      // Assistant message requesting tool calls — OpenAI format
      result.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });
    } else if (msg.role === 'tool' && msg.toolCall) {
      // Tool result message — must have tool_call_id
      result.push({
        role: 'tool',
        tool_call_id: msg.id, // We stored tool_call_id as the message id
        content: msg.content,
      });
    } else {
      // Regular user or assistant message
      result.push({
        role: msg.role === 'tool' ? 'assistant' : (msg.role as 'user' | 'assistant'),
        content: msg.content,
      });
    }
  }

  return result;
}

// =============================================================================
// TASK FRAMING (for complex requests)
// =============================================================================

/**
 * Frame a user request as a task goal
 *
 * @param message - Original user message
 * @param session - Current session
 * @param _attempt - Optional attempt count
 * @returns Framed task goal
 */
export async function frameTaskGoal(
  message: string,
  session: Session,
  _attempt: number = 1
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
    max_tokens: pipeline.frameMaxTokens,
    temperature: pipeline.toolTemperature,
  });

  return (
    response.choices[0]?.message?.content ?? message
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export { classifyIntent };
