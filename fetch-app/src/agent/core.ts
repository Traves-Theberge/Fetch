/**
 * @fileoverview Agent Core - Conversational Orchestrator (v4.0)
 *
 * The agent is a conversational orchestrator that:
 * 1. Receives ALL messages (no pre-classification)
 * 2. Has access to ALL tools (no conversation/action split)
 * 3. Delegates coding work to harnesses via tool calls
 *
 * The LLM IS the router. No regex intent classifier, no instinct
 * registry, no mode detector. Safety escapes (/stop, /undo, /clear)
 * are handled upstream in the command parser.
 *
 * System prompt is built by IdentityManager.buildSystemPrompt() — the single
 * source of truth for Fetch's persona, skills, pack, and session context.
 *
 * @module agent/core
 * @see {@link ToolRegistry} - Tool registry
 * @see {@link IdentityManager} - System prompt builder
 */

import OpenAI from 'openai';
import { Session } from '../session/types.js';
import { logger } from '../utils/logger.js';
import {
  buildTaskFramePrompt,
  buildContextSection,
} from './prompts.js';
import { getToolRegistry } from '../tools/registry.js';
import { getSessionManager } from '../session/manager.js';
import { generateRepoMap } from '../workspace/repo-map.js';
import { getIdentityManager } from '../identity/manager.js';
import { getSkillManager } from '../skills/manager.js';
import { env } from '../config/env.js';
import { pipeline } from '../config/pipeline.js';

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

const MODEL = env.AGENT_MODEL;
const MAX_TOOL_CALLS = pipeline.maxToolCalls;
const MAX_CONSECUTIVE_ERRORS = pipeline.circuitBreakerThreshold;
const ERROR_BACKOFF_MS = pipeline.circuitBreakerBackoff;

// =============================================================================
// ERROR TRACKING (Circuit Breaker)
// =============================================================================

// Note: Safe under Node.js single-threaded model — no await between get/set operations.
// If this code is ever moved to a worker thread, a mutex would be needed.
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
  userMessage: string,
  onProgress?: (text: string) => Promise<void>
): Promise<T> {
  const maxAttempts = pipeline.maxRetries + 1; // retries + initial attempt
  const backoffs = pipeline.retryBackoff;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        const delay = backoffs[attempt - 1] ?? 10000;
        logger.info(`Retrying request for session ${sessionId}`, { attempt, delay });

        // Report progress to user if callback provided
        if (onProgress) {
          const retryMessage = generateProgressMessage(userMessage, attempt);
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
// MAIN AGENT FUNCTION
// =============================================================================

/**
 * Process a user message through the agent.
 *
 * v4.0: Single path. ALL messages go to the LLM with ALL tools.
 * The LLM decides whether to chat, call tools, or delegate to a harness.
 * No intent classifier, no instinct registry, no mode detector.
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

    // Single path: LLM with ALL tools — the LLM IS the router
    const response = await handleWithRetry(
      (attempt) => handleWithTools(message, session, attempt),
      session.id,
      message,
      onProgress
    );

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
// UNIFIED MESSAGE HANDLER (All Tools)
// =============================================================================

/**
 * Unified message handler — ALL messages, ALL tools.
 *
 * The LLM naturally handles both conversational messages and action
 * requests. For "hi" it responds without tools. For "fix the bug" it
 * calls task_create. No pre-classification needed.
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

  // On retry (including 400 bad request), simplify context to avoid repeating the same oversized payload
  const finalHistory = attempt > 1
    ? history.slice(-4) // Keep last 4 messages to ensure tool_call + tool_result pairs are preserved
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

    const sManager = await getSessionManager();

    // Persist assistant's tool_call request IMMEDIATELY (before executing tools)
    // This prevents malformed history if tool execution or turn transition fails.
    // filter out degenerate tool calls (whitespace-only args)
    const persistableToolCalls = currentToolCalls
      .filter(tc => {
        if (!('function' in tc) || !tc.function) return false;
        const args = tc.function.arguments?.trim() ?? '';
        if (!args || /^\s*$/.test(args)) return false;
        try { JSON.parse(args); return true; } catch { return false; }
      })
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
      let toolArgs: Record<string, unknown> | null = null;

      // Detect degenerate arguments (LLM sometimes emits whitespace-only instead of JSON)
      // Note: {} is valid empty JSON for no-arg tools like workspace_list
      const rawArgs = fn.arguments?.trim() ?? '';
      if (!rawArgs || /^\s*$/.test(rawArgs)) {
        logger.warn('Degenerate tool call arguments (whitespace-only)', {
          tool: toolName,
          rawLength: fn.arguments?.length ?? 0,
        });

        // Attempt natural language argument extraction from the user's message
        const extractedArgs = extractToolArgsFromMessage(toolName, message);
        if (extractedArgs) {
          logger.info('Recovered tool args from user message', { tool: toolName, extractedArgs });
          toolArgs = extractedArgs;
        } else {
          const errorResult = {
            success: false,
            output: `Tool call failed: arguments were empty or whitespace-only. For ${toolName}, provide valid JSON like {"name": "my-project"}.`,
          };
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(errorResult),
          });
          continue;
        }
      }

      if (!toolArgs) {
        // Safely parse tool call arguments — LLM may produce truncated JSON
        try {
          toolArgs = JSON.parse(rawArgs);
        } catch (parseError) {
          logger.error('Failed to parse tool call arguments (likely truncated)', {
            tool: toolName,
            rawArgs: rawArgs.substring(0, 200),
            error: parseError,
          });

          // Try natural language extraction as fallback
          const extractedArgs = extractToolArgsFromMessage(toolName, message);
          if (extractedArgs) {
            logger.info('Recovered tool args from user message after JSON parse failure', { tool: toolName, extractedArgs });
            toolArgs = extractedArgs;
          } else {
            // Push an error result so the LLM can self-correct
            const errorResult = {
              success: false,
              output: `Tool call failed: invalid JSON in arguments for ${toolName}. Send proper JSON like {"name": "value"}.`,
            };
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(errorResult),
            });
            continue;
          }
        }
      }

      const toolStart = Date.now();

      // At this point toolArgs is guaranteed non-null (all null paths `continue` above)
      const finalArgs = toolArgs!;

      logger.info(`LLM requested tool call: ${toolName}`, { tool_call_id: toolCall.id, args: finalArgs });

      // Execute via registry (pass session context for session-aware tools)
      const result = await registry.execute(toolName, finalArgs, {
        sessionId: session.id,
        autonomyLevel: session.preferences.autonomyLevel,
      });

      toolCalls.push({
        name: toolName,
        args: finalArgs,
        result,
      });

      // Persist tool result to session (AFTER successful execution to avoid orphaned entries)
      await sManager.addToolMessage(
        session,
        { name: toolName, args: finalArgs, result: result.output, duration: Date.now() - toolStart },
        JSON.stringify(result),
        toolCall.id
      );

      // SYNC SESSION STATE BASED ON TOOLS
      if (toolName === 'workspace_select' && result.success) {
        try {
          const workspace = JSON.parse(result.output);
          if (!workspace?.name || !workspace?.path) {
            logger.warn('workspace_select returned incomplete data, skipping session sync');
          } else {
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

            await sManager.updateSession(session);

            // Rebuild system prompt so LLM sees the new workspace
            const updatedContext = await buildContextSection(session);
            messages[0] = {
              role: 'system',
              content: getIdentityManager().buildSystemPrompt(activatedContext, updatedContext),
            };
            logger.info('System prompt rebuilt after workspace change', { project: workspace.name });
          }
        } catch (e) {
          logger.error('Failed to sync session after workspace_select', e);
        }
      }

      // Sync session after workspace_create too
      if (toolName === 'workspace_create' && result.success) {
        try {
          const created = JSON.parse(result.output);
          if (!created?.name || !created?.path) {
            logger.warn('workspace_create returned incomplete data, skipping session sync');
          } else {
            session.currentProject = {
              name: created.name,
              path: created.path,
              type: created.projectType || 'unknown',
              mainFiles: [],
              gitBranch: created.git?.branch || 'main',
              lastCommit: null,
              hasUncommitted: false,
              refreshedAt: new Date().toISOString()
            };
            session.repoMap = null;

            await sManager.updateSession(session);

            const updatedContext = await buildContextSection(session);
            messages[0] = {
              role: 'system',
              content: getIdentityManager().buildSystemPrompt(activatedContext, updatedContext),
            };
            logger.info('System prompt rebuilt after workspace creation', { project: created.name });
          }
        } catch (e) {
          logger.error('Failed to sync session after workspace_create', e);
        }
      }

      // Sync after task_create
      if (toolName === 'task_create' && result.success) {
        try {
          const taskResult = JSON.parse(result.output);
          if (!taskResult?.taskId) {
            logger.warn('task_create returned incomplete data, skipping session sync');
          } else {
            session.activeTaskId = taskResult.taskId;
            await sManager.updateSession(session);
          }
        } catch (e) {
          logger.error('Failed to sync session after task_create', e);
        }
      }

      // Add tool result to messages
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    // Clean up toolCalls local var for logging (not for history, already persisted)
    // Removed duplicate persistence here as it's now handled before the loop starts

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
// NATURAL LANGUAGE ARGUMENT EXTRACTION (Fallback)
// =============================================================================

/**
 * Extract tool arguments from the user's natural language message.
 * Used as a fallback when the model generates degenerate/empty tool args.
 *
 * @param toolName - Name of the tool the model tried to call
 * @param userMessage - The original user message
 * @returns Extracted args object, or null if extraction fails
 */
function extractToolArgsFromMessage(
  toolName: string,
  userMessage: string
): Record<string, unknown> | null {
  const msg = userMessage.trim();

  switch (toolName) {
    case 'workspace_create': {
      // Patterns: "create a project called demo-test"
      //           "make a new project demo-test"
      //           "new project called my-app"
      //           "create demo-test project"
      //           "scaffold a node project named my-api"
      const patterns = [
        /(?:called|named)\s+([a-zA-Z0-9_-]+)/i,
        /(?:create|make|new|setup|init|scaffold|start|spin\s*up|bootstrap)\s+(?:a\s+)?(?:new\s+)?(?:(?:node|python|rust|go|react|next|empty)\s+)?(?:project|workspace|repo|app|application)\s+(?:called\s+|named\s+)?([a-zA-Z0-9_-]+)/i,
        /(?:create|make|new|setup|init|scaffold|start)\s+([a-zA-Z0-9_-]+)\s*(?:project|workspace|repo|app)?/i,
        /(?:project|workspace)\s+(?:called|named)\s+([a-zA-Z0-9_-]+)/i,
      ];

      // Also try to extract template
      const templateMatch = msg.match(/\b(node|python|rust|go|react|next)\b\s*(?:project|template|app)?/i);
      const template = templateMatch ? templateMatch[1].toLowerCase() : undefined;

      for (const pattern of patterns) {
        const match = msg.match(pattern);
        if (match?.[1]) {
          const name = match[1];
          // Validate: not a common word that looks like a name
          const reserved = ['a', 'an', 'the', 'my', 'our', 'new', 'project', 'workspace', 'app', 'repo', 'called', 'named'];
          if (reserved.includes(name.toLowerCase())) continue;

          const args: Record<string, unknown> = { name };
          if (template) args.template = template;
          return args;
        }
      }
      return null;
    }

    case 'workspace_select': {
      // "switch to test-api", "use demo-project", "work on my-app"
      const patterns = [
        /(?:switch|change|move|go)\s+(?:to\s+)?([a-zA-Z0-9_-]+)/i,
        /(?:select|use|open|work\s+on|load)\s+(?:the\s+)?([a-zA-Z0-9_-]+)/i,
      ];
      for (const pattern of patterns) {
        const match = msg.match(pattern);
        if (match?.[1]) {
          const name = match[1];
          const reserved = ['a', 'an', 'the', 'my', 'our', 'project', 'workspace'];
          if (reserved.includes(name.toLowerCase())) continue;
          return { name };
        }
      }
      return null;
    }

    case 'workspace_delete': {
      // "delete project demo-test", "remove the workspace test-api"
      const match = msg.match(/(?:delete|remove|destroy)\s+(?:the\s+)?(?:project|workspace)?\s*([a-zA-Z0-9_-]+)/i);
      if (match?.[1]) {
        return { name: match[1], confirm: false }; // Always require explicit confirmation
      }
      return null;
    }

    case 'task_create': {
      // For task_create, the full message IS the goal
      if (msg.length > 5) {
        return { goal: msg };
      }
      return null;
    }

    default:
      return null;
  }
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
 * Frame a user request as a task goal.
 *
 * Sends the user's raw message through a secondary LLM call to produce
 * a self-contained, actionable goal string for the harness (Claude Code,
 * Gemini, etc.) which has no access to our conversation history.
 *
 * @param message - Original user message
 * @param session - Current session (workspace/branch context)
 * @returns Framed task goal
 */
export async function frameTaskGoal(
  message: string,
  session: Session,
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
// PROGRESS MESSAGE GENERATION (Dog Persona)
// =============================================================================

/**
 * Generate a context-aware, dog-themed progress message for WhatsApp.
 * Uses keywords from the user's message to provide specific feedback.
 *
 * @param userMessage - The original user message
 * @param attempt - Current attempt number (1 = initial, 2+ = retries)
 * @returns Formatted progress update
 */
export function generateProgressMessage(userMessage: string, attempt: number = 1): string {
  const lower = userMessage.toLowerCase();

  // Action detection
  let action = "fetching that for you";
  if (lower.includes('status') || lower.includes('how')) action = "sniffing out the status";
  else if (lower.includes('fix') || lower.includes('bug') || lower.includes('error')) action = "hunting down that bug";
  else if (lower.includes('create') || lower.includes('new') || lower.includes('build')) action = "building something new";
  else if (lower.includes('git') || lower.includes('commit') || lower.includes('push')) action = "burying your changes in git";
  else if (lower.includes('test')) action = "running some tests for you";

  const prefixes = [
    "Woof!",
    "Bark!",
    "Awoo!",
    "Wagging my tail...",
    "Fetch!"
  ];

  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

  if (attempt === 1) {
    return `${prefix} I'm ${action}, just a second! 🐕🦴`;
  }

  const retries = [
    `${prefix} Still ${action}, almost there! 🐾`,
    `${prefix} One more second while I'm ${action}... 🐕`,
    `${prefix} I'm determined! Still ${action}! 🦴`
  ];

  return retries[Math.min(attempt - 2, retries.length - 1)];
}
