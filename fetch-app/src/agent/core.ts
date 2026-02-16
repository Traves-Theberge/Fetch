/**
 * @fileoverview Core message-processing loop for the Fetch bridge.
 *
 * Responsibilities:
 * - Run the primary LLM turn with full tool access
 * - Execute tool-call loops with retry/backoff and circuit breaker behavior
 * - Build context/prompt input from session, identity, skills, and workspace state
 * - Provide task framing and bounded progress-message rewriting helpers
 *
 * @module agent/core
 * @see {@link ToolRegistry} Tool registration and execution
 * @see {@link IdentityManager} System prompt assembly
 */

import OpenAI from 'openai';
import { Session, PromptMode, AgentRunPhase, AgentTurnTelemetry, ToolTelemetry } from '../session/types.js';
import { logger } from '../utils/logger.js';
import {
  buildTaskFramePrompt,
  buildContextSection,
} from './prompts.js';
import { buildCapabilitySummary, buildToolInventory } from './capability-cards.js';
import {
  classifyIntent,
  shouldUseMinimalMode,
  wantsFullInventory,
  type ResponseIntent,
  getResponsePreferences,
  parsePreferenceUpdate,
} from './response-policy.js';
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
  /** Detected response intent used by renderer behavior */
  intent?: ResponseIntent;
  /** Tool calls made (for logging) */
  toolCalls?: ToolCallRecord[];
  /** Turn-level runtime telemetry */
  telemetry?: AgentTurnTelemetry;
  /** Selected prompt mode for this turn */
  promptMode?: PromptMode;
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

/** Optional controls and hooks for one processMessage turn. */
export interface AgentProcessOptions {
  promptMode?: PromptMode;
  runId?: string;
  abortSignal?: AbortSignal;
  onLifecycle?: (
    phase: AgentRunPhase,
    details?: { toolName?: string; toolCallCount?: number; promptMode?: PromptMode; error?: string }
  ) => Promise<void> | void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MODEL = env.AGENT_MODEL;
const MAX_TOOL_CALLS = pipeline.maxToolCalls;
const MAX_CONSECUTIVE_ERRORS = pipeline.circuitBreakerThreshold;
const ERROR_BACKOFF_MS = pipeline.circuitBreakerBackoff;
const REDACTED = '[REDACTED]';
const SENSITIVE_ARG_KEYS = [
  'token',
  'apiKey',
  'apikey',
  'secret',
  'password',
  'authorization',
  'auth',
  'cookie',
  'privateKey',
  'clientSecret',
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_ARG_KEYS.some((needle) => normalized.includes(needle.toLowerCase()));
}

function sanitizeForPersistence(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForPersistence(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : sanitizeForPersistence(inner);
    }
    return out;
  }
  return value;
}

function resolveMaxToolCallsForTurn(sessionMaxIterations: number | undefined): number {
  if (!Number.isInteger(sessionMaxIterations)) return MAX_TOOL_CALLS;
  return Math.max(1, Math.min(MAX_TOOL_CALLS, sessionMaxIterations as number));
}

/**
 * Select prompt mode for this turn.
 * Minimal mode is used for short conversational messages to reduce context load.
 */
export function selectPromptMode(message: string): PromptMode {
  const intent = classifyIntent(message);
  if (shouldUseMinimalMode(intent)) return 'minimal';

  const text = message.trim().toLowerCase();
  if (!text) return 'minimal';

  const conversationalPatterns = [
    /^(hi|hello|hey|yo|sup|thanks|thank you)[!.]*$/i,
    /^how are you[?.!]*$/i,
    /^what can you do[?.!]*$/i,
    /^who are you[?.!]*$/i,
  ];
  if (conversationalPatterns.some((pattern) => pattern.test(text))) {
    return 'minimal';
  }

  const actionWords = /\b(create|build|fix|run|test|deploy|commit|push|open|search|workflow|cron|task|file|folder|workspace|browser|app)\b/i;
  if (text.length <= 80 && !actionWords.test(text)) {
    return 'minimal';
  }
  return 'full';
}

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
    if (error.name === 'AbortError' || /cancelled|canceled|aborted/i.test(error.message)) {
      return false;
    }
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
          const retryMessage = await generateProgressMessage(userMessage, attempt);
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
// ERROR SANITIZATION
// =============================================================================

/**
 * Sanitize error messages for user-facing display.
 * Strips API keys, paths, stack traces.
 */
function sanitizeErrorForUser(error: unknown): string {
  let msg = error instanceof Error ? error.message : String(error);
  msg = msg.replace(/(?:key|token|auth|bearer|password|secret)[=:\s]+[A-Za-z0-9_\-./+]{20,}/gi, '[redacted]');
  msg = msg.replace(/(?:\/(?:app|home|workspace|usr|var|tmp)\/)[^\s,)]+/g, '[path]');
  msg = msg.replace(/\n\s*at\s+.+/g, '');
  if (msg.length > 200) msg = msg.substring(0, 200).trim() + '...';
  return msg.trim() || 'Unknown error';
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
 * Process one user message through the LLM + tool loop.
 *
 * This is the main runtime entry point after command parsing.
 * It refreshes stale repo context, runs the retry/circuit-breaker logic,
 * and returns final assistant text plus tool/task metadata.
 *
 * @param message - User message
 * @param session - Current session
 * @param onProgress - Optional callback for intermediate progress messages
 * @returns Final agent response payload
 */
export async function processMessage(
  message: string,
  session: Session,
  onProgress?: (text: string) => Promise<void>,
  options?: AgentProcessOptions
): Promise<AgentResponse> {
  const startTime = Date.now();
  const sManager = await getSessionManager();
  const intent = classifyIntent(message);
  const promptMode = options?.promptMode ?? (shouldUseMinimalMode(intent) ? 'minimal' : selectPromptMode(message));
  const responsePreferences = getResponsePreferences(session);
  let retryAttempts = 1;
  await options?.onLifecycle?.('preparing', { promptMode });

  try {
    if (options?.abortSignal?.aborted) {
      throw new Error(options.abortSignal.reason ? String(options.abortSignal.reason) : 'Operation cancelled');
    }

    const preferenceUpdate = parsePreferenceUpdate(message);
    if (preferenceUpdate) {
      session.metadata.responsePreferences = {
        ...responsePreferences,
        ...preferenceUpdate,
      };
      await sManager.updateSession(session);
      return {
        text: [
          '*Response preferences updated*',
          `• detail: ${session.metadata.responsePreferences.detail}`,
          `• tone: ${session.metadata.responsePreferences.tone}`,
          `• emoji: ${session.metadata.responsePreferences.emoji}`,
          '',
          'I will use these defaults in future replies.',
        ].join('\n'),
        telemetry: {
          promptMode,
          model: MODEL,
          retries: 0,
          totalToolCalls: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          tools: [],
          durationMs: Date.now() - startTime,
          startedAt: new Date(startTime).toISOString(),
          finishedAt: new Date().toISOString(),
        },
        promptMode,
        intent: 'status',
      };
    }

    // Deterministic conversational responses for capability/inventory asks.
    if (intent === 'capability_summary' || intent === 'tool_inventory') {
      const text = intent === 'capability_summary'
        ? buildCapabilitySummary(responsePreferences)
        : buildToolInventory({ full: wantsFullInventory(message) }, responsePreferences);

      const durationMs = Date.now() - startTime;
      const telemetry: AgentTurnTelemetry = {
        promptMode,
        model: MODEL,
        retries: 0,
        totalToolCalls: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        tools: [],
        durationMs,
        startedAt: new Date(startTime).toISOString(),
        finishedAt: new Date().toISOString(),
      };

      await sManager.recordMemoryTiers(session, {
        userMessage: message,
        assistantMessage: text,
        toolNames: [],
        durableNotes: [],
      });
      await options?.onLifecycle?.('completed', { promptMode });
      return { text, telemetry, promptMode, intent };
    }

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
          intent,
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

    // Store progress callback for tool-level progress messages
    activeProgressCallback = onProgress;
    await options?.onLifecycle?.('planning', { promptMode });

    // Single path: LLM with ALL tools — the LLM IS the router
    const response = await handleWithRetry(
      async (attempt) => {
        retryAttempts = Math.max(retryAttempts, attempt);
        return handleWithTools(message, session, attempt, {
          ...options,
          promptMode,
        });
      },
      session.id,
      message,
      onProgress
    );

    activeProgressCallback = undefined;

    // Success - reset error count
    resetErrorCount(session.id);
    const durationMs = Date.now() - startTime;
    const telemetry: AgentTurnTelemetry = response.telemetry ?? {
      promptMode,
      model: MODEL,
      retries: Math.max(0, retryAttempts - 1),
      totalToolCalls: response.toolCalls?.length ?? 0,
      successfulToolCalls: response.toolCalls?.length ?? 0,
      failedToolCalls: 0,
      tools: [],
      durationMs,
      startedAt: new Date(startTime).toISOString(),
      finishedAt: new Date().toISOString(),
    };

    const toolNames = response.toolCalls?.map((tc) => tc.name) ?? [];
    const durableNotes = deriveDurableNotes(message, response.text, toolNames);
    await sManager.recordMemoryTiers(session, {
      userMessage: message,
      assistantMessage: response.text,
      toolNames,
      durableNotes,
    });
    for (const note of durableNotes) {
      const lowered = note.toLowerCase();
      const category: 'preference' | 'decision' | 'fact' =
        lowered.includes('prefers') ? 'preference' : lowered.includes('decided') ? 'decision' : 'fact';
      sManager.addMemory(session.id, category, note, `runtime durable note ${toolNames.join(' ')}`.trim(), 2);
    }

    await options?.onLifecycle?.('completed', { promptMode });
    return { ...response, telemetry, promptMode, intent: response.intent ?? intent };

  } catch (error) {
    if (options?.abortSignal?.aborted) {
      const cancelledMsg = "🐕 Stopped. I cancelled that run.";
      await options?.onLifecycle?.('cancelled', { error: cancelledMsg, promptMode });
      return {
        text: cancelledMsg,
        intent,
        promptMode,
      };
    }

    logger.error('Agent error', { error, sessionId: session.id });
    await options?.onLifecycle?.('failed', {
      error: sanitizeErrorForUser(error),
      promptMode,
    });

    // Track error for circuit breaker
    const shouldContinue = trackError(session.id);

    // Check if it's a retriable error
    const isRetriable = isRetriableError(error, 1);

    if (!shouldContinue) {
      return {
        text: "🐕 I've run into too many issues. Let me rest for a bit. Try again in a few minutes!",
        intent,
      };
    }

    if (!isRetriable) {
      // Non-retriable errors (400, 401, 404) - don't suggest retry
      const safeMsg = sanitizeErrorForUser(error);
      return {
        text: `🐕 Something went wrong: ${safeMsg}`,
        intent,
        promptMode,
      };
    }

    return {
      text: "🐕 Oops! Something went wrong. Let me shake that off and try again. What were you trying to do?",
      intent,
      promptMode,
    };
  } finally {
    const duration = Date.now() - startTime;
    logger.debug('Agent response time', { duration });
  }
}

// =============================================================================
// UNIFIED MESSAGE HANDLER (All Tools)
// =============================================================================

/** Tools that may take >5 seconds and warrant a progress message */
const SLOW_TOOLS = new Set(['web_fetch', 'web_search', 'browser_open', 'browser_action', 'browser_snapshot', 'task_create']);

/** Progress callback stored for use during tool execution */
let activeProgressCallback: ((text: string) => Promise<void>) | undefined;

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
  attempt: number = 1,
  options?: AgentProcessOptions
): Promise<AgentResponse> {
  if (options?.abortSignal?.aborted) {
    throw new Error(options.abortSignal.reason ? String(options.abortSignal.reason) : 'Operation cancelled');
  }

  const turnStartedAt = Date.now();
  const openai = getOpenAI();
  const registry = getToolRegistry();
  const tools = registry.toOpenAIFormat();
  const toolCalls: ToolCallRecord[] = [];
  const toolTelemetry: ToolTelemetry[] = [];
  const identityManager = getIdentityManager();
  await identityManager.whenReady();
  const promptMode = options?.promptMode ?? selectPromptMode(message);

  // Match skills against this message and build activated context
  const skillManager = getSkillManager();
  const matchedSkills = await skillManager.matchSkills(message);
  const activatedContext = skillManager.buildActivatedSkillsContext(matchedSkills);

  // Build session context (workspace, task, git state, summaries, recalled memories)
  const sessionContext = await buildContextSection(session, message);

  const history = buildMessageHistory(session);

  // On retry (including 400 bad request), simplify context to avoid repeating the same oversized payload
  const finalHistory = attempt > 1
    ? history.slice(-4) // Keep last 4 messages to ensure tool_call + tool_result pairs are preserved
    : history;

  // SANITY CHECK: Ensure we didn't slice in the middle of a tool output pair
  while (finalHistory.length > 0 && finalHistory[0].role === 'tool') {
    // If we have the full history available, try to grab the parent
    const firstMsgIndex = history.indexOf(finalHistory[0]);
    if (firstMsgIndex > 0) {
      finalHistory.unshift(history[firstMsgIndex - 1]);
    } else {
      // If we can't find the parent, drop the orphan tool output
      finalHistory.shift();
    }
  }

  // Build messages
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: identityManager.buildSystemPrompt(activatedContext, sessionContext, { mode: promptMode }) },
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
  }, options?.abortSignal ? { signal: options.abortSignal } : undefined);

  let callCount = 0;
  const maxToolCallsForTurn = resolveMaxToolCallsForTurn(session.preferences.maxIterations);

  // Process tool calls
  while (
    response.choices[0]?.message?.tool_calls &&
    response.choices[0].message.tool_calls.length > 0 &&
    callCount < maxToolCallsForTurn
  ) {
    await options?.onLifecycle?.('tool_execution', { toolCallCount: callCount, promptMode });
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
      if (options?.abortSignal?.aborted) {
        throw new Error(options.abortSignal.reason ? String(options.abortSignal.reason) : 'Operation cancelled');
      }
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
      const sanitizedArgs = sanitizeForPersistence(finalArgs) as Record<string, unknown>;

      logger.info(`LLM requested tool call: ${toolName}`, { tool_call_id: toolCall.id, args: sanitizedArgs });

      // Send progress message for slow tools after 4 seconds
      let toolProgressTimer: ReturnType<typeof setTimeout> | undefined;
      if (SLOW_TOOLS.has(toolName) && activeProgressCallback) {
        const progressCb = activeProgressCallback;
        toolProgressTimer = setTimeout(() => {
          const toolLabels: Record<string, string> = {
            web_fetch: 'fetching that page',
            web_search: 'searching the web',
            browser_open: 'opening the browser',
            browser_action: 'interacting with the page',
            browser_snapshot: 'reading the page',
            task_create: 'setting up the task',
          };
          const label = toolLabels[toolName] ?? toolName;
          progressCb(`🐕 Still ${label}... 🔄`).catch(() => { });
        }, 4000);
      }

      // Execute via registry (pass session context for session-aware tools)
      await options?.onLifecycle?.('tool_execution', { toolName, toolCallCount: callCount, promptMode });

      let result;
      try {
        result = await registry.execute(toolName, finalArgs, {
          sessionId: session.id,
          autonomyLevel: session.preferences.autonomyLevel,
        });
      } catch (error) {
        if (toolProgressTimer) clearTimeout(toolProgressTimer);
        toolTelemetry.push({
          name: toolName,
          success: false,
          durationMs: Date.now() - toolStart,
          error: sanitizeErrorForUser(error),
        });
        throw error;
      }

      if (toolProgressTimer) clearTimeout(toolProgressTimer);
      toolTelemetry.push({
        name: toolName,
        success: result.success,
        durationMs: Date.now() - toolStart,
        ...(result.success ? {} : { error: result.output }),
      });

      toolCalls.push({
        name: toolName,
        args: sanitizedArgs,
        result,
      });

      // Persist tool result to session (AFTER successful execution to avoid orphaned entries)
      // Compress large tool results to prevent session bloat
      const maxPersist = pipeline.toolResultMaxPersist;
      const persistResult = result.output && result.output.length > maxPersist
        ? result.output.slice(0, maxPersist / 2) + `\n... [truncated, full output was ${result.output.length} chars]`
        : result.output;
      await sManager.addToolMessage(
        session,
        { name: toolName, args: sanitizedArgs, result: persistResult, duration: Date.now() - toolStart },
        JSON.stringify({ ...result, output: persistResult }),
        toolCall.id
      );

      // SYNC SESSION STATE BASED ON TOOLS
      if (toolName === 'workspace_select' && result.success) {
        try {
          const workspace = result.metadata as Record<string, unknown> | undefined;
          if (!workspace?.name || !workspace?.path) {
            logger.warn('workspace_select returned incomplete data, skipping session sync');
          } else {
            const profile = workspace.profile as Record<string, unknown> | undefined;
            session.currentProject = {
              name: workspace.name as string,
              path: workspace.path as string,
              type: ((workspace.projectType as string) || 'unknown') as import('../workspace/types.js').ProjectType,
              mainFiles: (profile?.entryPoints as string[]) || [],
              profile: profile as import('../workspace/types.js').ProjectProfile | undefined,
              gitBranch: (workspace.git as Record<string, unknown>)?.branch as string || null,
              lastCommit: null,
              hasUncommitted: (workspace.git as Record<string, unknown>)?.dirty as boolean || false,
              refreshedAt: new Date().toISOString()
            };
            session.repoMap = null; // Clear old map

            await sManager.updateSession(session);

            // Rebuild system prompt so LLM sees the new workspace
            const updatedContext = await buildContextSection(session);
            messages[0] = {
              role: 'system',
              content: identityManager.buildSystemPrompt(activatedContext, updatedContext, { mode: promptMode }),
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
          const created = result.metadata as Record<string, unknown> | undefined;
          if (!created?.name || !created?.path) {
            logger.warn('workspace_create returned incomplete data, skipping session sync');
          } else {
            const profile = created.profile as Record<string, unknown> | undefined;
            session.currentProject = {
              name: created.name as string,
              path: created.path as string,
              type: ((created.projectType as string) || 'unknown') as import('../workspace/types.js').ProjectType,
              mainFiles: (profile?.entryPoints as string[]) || [],
              profile: profile as import('../workspace/types.js').ProjectProfile | undefined,
              gitBranch: (created.git as Record<string, unknown>)?.branch as string || 'main',
              lastCommit: null,
              hasUncommitted: false,
              refreshedAt: new Date().toISOString()
            };
            session.repoMap = null;

            await sManager.updateSession(session);

            const updatedContext = await buildContextSection(session);
            messages[0] = {
              role: 'system',
              content: identityManager.buildSystemPrompt(activatedContext, updatedContext, { mode: promptMode }),
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
          const taskResult = result.metadata as Record<string, unknown> | undefined;
          if (!taskResult?.taskId) {
            logger.warn('task_create returned incomplete data, skipping session sync');
          } else {
            session.activeTaskId = taskResult.taskId as import('../task/types.js').TaskId;
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
    }, options?.abortSignal ? { signal: options.abortSignal } : undefined);
  }

  // Get final text response
  await options?.onLifecycle?.('responding', { promptMode });
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

  const durationMs = Date.now() - turnStartedAt;
  const successfulToolCalls = toolTelemetry.filter((t) => t.success).length;
  const telemetry: AgentTurnTelemetry = {
    promptMode,
    model: MODEL,
    retries: Math.max(0, attempt - 1),
    totalToolCalls: toolTelemetry.length,
    successfulToolCalls,
    failedToolCalls: toolTelemetry.length - successfulToolCalls,
    tools: toolTelemetry,
    durationMs,
    startedAt: new Date(turnStartedAt).toISOString(),
    finishedAt: new Date().toISOString(),
  };

  return {
    text,
    toolCalls,
    telemetry,
    promptMode,
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

    case 'file_delete': {
      // "delete file src/index.ts", "remove main.py"
      const match = msg.match(/(?:delete|remove|destroy|unlink)\s+(?:the\s+)?(?:file\s+)?([a-zA-Z0-9_.\-/]+)/i);
      if (match?.[1]) {
        return { path: match[1], confirm: false }; // Always require explicit confirmation
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

/**
 * Extract durable notes from one turn for long-horizon personalization.
 */
function deriveDurableNotes(
  userMessage: string,
  assistantMessage: string,
  toolNames: string[]
): string[] {
  const notes: string[] = [];
  const text = userMessage.trim();
  const lower = text.toLowerCase();

  const preferenceMatch = text.match(/\b(i prefer|always|never|call me)\b(.+)/i);
  if (preferenceMatch?.[0]) {
    notes.push(`User prefers: ${preferenceMatch[0].trim()}`);
  }

  if (toolNames.includes('workspace_select') || toolNames.includes('workspace_create')) {
    notes.push('User decided to work in the currently selected workspace for this turn.');
  }
  if (toolNames.includes('workflow_create')) {
    notes.push('User decided to automate a repeatable flow with a saved workflow.');
  }
  if (toolNames.includes('cron_create')) {
    notes.push('User decided to schedule workflow automation with cron.');
  }

  if (!notes.length && (lower.includes('remember this') || lower.includes('note this'))) {
    notes.push(`User explicit note: ${text.slice(0, 180)}`);
  }

  if (assistantMessage.toLowerCase().includes('completed') && toolNames.length > 0) {
    notes.push(`Completed tool-based action path: ${toolNames.join(', ')}.`);
  }

  return notes.slice(0, 4);
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

  // SANITY CHECK: Ensure we didn't slice in the middle of a tool output pair
  // If the first message is a tool output, we must include its parent assistant message
  while (recent.length > 0 && recent[0].role === 'tool') {
    const firstMsgIndex = session.messages.indexOf(recent[0]);
    if (firstMsgIndex > 0) {
      // Try to grab the parent message
      const parent = session.messages[firstMsgIndex - 1];
      if (parent.role === 'assistant' && parent.toolCalls) {
        recent.unshift(parent);
      } else {
        // Parent is missing or invalid type? Drop this orphan tool output.
        recent.shift();
      }
    } else {
      // No parent exists in session? Drop orphan.
      recent.shift();
    }
  }

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
 * Convert a user request into a standalone harness task goal.
 *
 * Harness CLIs do not receive full chat history, so this function
 * produces a concise goal string that includes required context.
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
 * Generate a progress update for user-visible retries.
 *
 * Flow:
 * 1) build a factual template message
 * 2) optionally run bounded rewrite (timeout + sanitizer)
 * 3) fall back to the template on any rewrite failure
 *
 * @param userMessage - The original user message
 * @param attempt - Current attempt number (1 = initial, 2+ = retries)
 * @returns Final progress text
 */
export async function generateProgressMessage(userMessage: string, attempt: number = 1): Promise<string> {
  const factual = generateFactualProgressMessage(userMessage, attempt);
  return rewriteProgressMessageBounded(factual);
}

/**
 * Build the template-based fallback progress message.
 */
function generateFactualProgressMessage(userMessage: string, attempt: number = 1): string {
  const lower = userMessage.toLowerCase();

  // Action detection — expanded keyword groups with multiple phrasings each
  const actionPools: Array<{ keywords: string[]; phrases: string[] }> = [
    { keywords: ['status', 'how', 'check'], phrases: ['sniffing out the status', 'checking on things', 'looking into that'] },
    { keywords: ['fix', 'bug', 'error', 'broken'], phrases: ['hunting down that bug', 'tracking the issue', 'digging into the problem'] },
    { keywords: ['create', 'new', 'build', 'add', 'scaffold'], phrases: ['building something new', 'putting that together', 'setting things up'] },
    { keywords: ['git', 'commit', 'push', 'sync'], phrases: ['wrangling your git changes', 'syncing things up', 'handling the version control'] },
    { keywords: ['test', 'spec', 'coverage'], phrases: ['running some tests', 'checking the test suite', 'making sure things pass'] },
    { keywords: ['deploy', 'publish', 'release'], phrases: ['preparing the deployment', 'getting things ready to ship', 'packaging it up'] },
    { keywords: ['refactor', 'clean', 'improve'], phrases: ['tidying up the code', 'polishing things up', 'cleaning house'] },
    { keywords: ['search', 'find', 'look', 'where'], phrases: ['sniffing around for that', 'tracking it down', 'searching the codebase'] },
  ];

  let action = 'fetching that for you';
  for (const pool of actionPools) {
    if (pool.keywords.some(kw => lower.includes(kw))) {
      action = pool.phrases[Math.floor(Math.random() * pool.phrases.length)];
      break;
    }
  }

  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  if (attempt === 1) {
    const initial = [
      `On it! I'm ${action} 🐕`,
      `Working on it - ${action}! 🦴`,
      `Let me handle that - ${action} now 🐾`,
      `Woof! Just a sec while I'm ${action}`,
      `Got it, ${action}! 🐕`,
    ];
    return pick(initial);
  }

  const retries = [
    `Still ${action}, almost there! 🐾`,
    `One more moment - ${action}...`,
    `Hanging in there! Still ${action} 🐕`,
    `Making progress on this - ${action}`,
    `Nearly done, just finishing up! 🦴`,
  ];

  return pick(retries);
}

/** Internal test hooks for unit-level behavior checks. */
export const __testing = {
  sanitizeForPersistence,
  resolveMaxToolCallsForTurn,
  sanitizeErrorForUser,
  isRetriableError,
  sanitizeProgressRewrite,
  selectPromptMode,
  deriveDurableNotes,
};

/**
 * Rewrite progress text with strict latency/output bounds.
 * Returns the original template text on timeout, API error, or invalid rewrite.
 */
async function rewriteProgressMessageBounded(factual: string): Promise<string> {
  // Kill switch for reliability/debugging.
  if (!pipeline.progressRewriteEnabled) {
    return factual;
  }

  try {
    const openai = getOpenAI();

    const rewritePromise = openai.chat.completions.create({
      model: pipeline.notificationModel,
      messages: [
        {
          role: 'system',
          content: [
            'Rewrite the message into ONE short sentence for WhatsApp.',
            'Keep it dog-themed and friendly.',
            'Do not add new facts.',
            'No markdown, no lists, no line breaks.',
            'Max 90 characters.'
          ].join(' ')
        },
        {
          role: 'user',
          content: factual
        }
      ],
      max_tokens: 40,
      temperature: 0.9,
    });

    // Bound latency for progress updates.
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Progress rewrite timeout')), pipeline.progressRewriteTimeoutMs);
    });

    const response = await Promise.race([rewritePromise, timeoutPromise]);
    const rewritten = response.choices[0]?.message?.content?.trim() ?? '';
    return sanitizeProgressRewrite(rewritten, factual);
  } catch (error) {
    logger.debug('Progress rewrite failed, using factual fallback', { error: error instanceof Error ? error.message : String(error) });
    return factual;
  }
}

/**
 * Validate and normalize rewritten progress text before sending to users.
 */
function sanitizeProgressRewrite(candidate: string, fallback: string): string {
  if (!candidate) return fallback;

  // Strip newlines and normalize whitespace.
  let text = candidate.replace(/\s+/g, ' ').trim();

  // Remove surrounding quotes and markdown-ish wrappers.
  text = text.replace(/^["'`]+|["'`]+$/g, '');
  text = text.replace(/[*_~]/g, '');

  // Bound length for WhatsApp progress updates.
  if (text.length === 0 || text.length > 120) return fallback;

  // Reject multi-sentence rewrites; keep concise.
  const sentenceCount = (text.match(/[.!?](?:\s|$)/g) ?? []).length;
  if (sentenceCount > 1) return fallback;

  return text;
}
