/**
 * @fileoverview Handles inbound WhatsApp messages and task event notifications.
 *
 * Responsibilities:
 * - initialize session/task integrations
 * - route deterministic slash commands
 * - delegate regular messages to agent core
 * - format and return WhatsApp-ready replies
 * - push proactive task notifications via registered sender
 *
 * @module handler
 */

import { SessionManager, getSessionManager } from '../session/manager.js';
import { processMessage, selectPromptMode, type AgentResponse } from '../agent/core.js';
import { type TaskManager, getTaskManager as getPersistentTaskManager } from '../task/manager.js';
import type { TaskId } from '../task/types.js';
import { formatAndChunkForWhatsApp, formatForWhatsApp } from '../agent/whatsapp-format.js';
import { formatAndChunkForDiscord, formatForDiscord } from '../agent/discord-format.js';
import { composeWhatsAppResponse, composeDiscordResponse } from '../agent/composer.js';
import { formatNotification } from '../agent/notifications.js';
import type { ResponseEnvelope } from '../agent/envelope.js';
import { logger } from '../utils/logger.js';

export type BridgeType = 'whatsapp' | 'discord';

// =============================================================================
// SINGLETON STATE
// =============================================================================

/** Session manager singleton. */
let sessionManager: SessionManager | null = null;

/** Task manager singleton. */
let taskManager: TaskManager | null = null;

/** Guard to prevent duplicate initialization. */
let initialized = false;

/** Optional sender used for proactive task notifications. */
let sendWhatsApp: ((userId: string, text: string) => Promise<void>) | null = null;

/** Active bridge type for formatter dispatch. */
let activeBridgeType: BridgeType = 'whatsapp';

const BROKEN_CODEX_SKILL_LINK_PATTERN =
  /failed to stat skills entry .*\/root\/\.codex\/skills\/|missing symlink.*\/root\/\.codex\/skills\//i;

/**
 * Registers a callback used to send proactive WhatsApp messages.
 * @deprecated Use registerSender instead for bridge-agnostic registration.
 */
export function registerWhatsAppSender(fn: (userId: string, text: string) => Promise<void>): void {
  sendWhatsApp = fn;
  activeBridgeType = 'whatsapp';
  logger.info('WhatsApp sender registered for proactive messages');
}

/**
 * Registers a callback used to send proactive messages for the given bridge type.
 */
export function registerSender(fn: (userId: string, text: string) => Promise<void>, bridge: BridgeType): void {
  sendWhatsApp = fn;
  activeBridgeType = bridge;
  logger.info(`${bridge} sender registered for proactive messages`);
}

/** Returns the active bridge type. */
export function getActiveBridgeType(): BridgeType {
  return activeBridgeType;
}

function composeForActiveBridge(envelope: ResponseEnvelope): string {
  return activeBridgeType === 'discord'
    ? composeDiscordResponse(envelope)
    : composeWhatsAppResponse(envelope);
}

function formatForActiveBridge(text: string): string {
  return activeBridgeType === 'discord'
    ? formatForDiscord(text)
    : formatForWhatsApp(text);
}

function formatAndChunkForActiveBridge(text: string, intent?: AgentResponse['intent']): string[] {
  return activeBridgeType === 'discord'
    ? formatAndChunkForDiscord(text, intent)
    : formatAndChunkForWhatsApp(text, intent);
}

function renderEnvelopeChunks(envelope: ResponseEnvelope, intent?: AgentResponse['intent']): string[] {
  const composed = composeForActiveBridge(envelope);
  const chunks = formatAndChunkForActiveBridge(composed, intent);
  return chunks;
}

async function sendEnvelopeNotification(userId: string, envelope: ResponseEnvelope): Promise<void> {
  if (!sendWhatsApp) return;
  const messages = renderEnvelopeChunks(envelope);
  for (const msg of messages) {
    await sendWhatsApp(userId, msg);
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initializes handler dependencies and task event listeners once.
 */
export async function initializeHandler(): Promise<void> {
  if (initialized) return;

  logger.section('⚙️  Initializing Handler');

  // Initialize components
  sessionManager = await getSessionManager();
  logger.success('Session manager ready');
  logger.success('Tool registry loaded');

  taskManager = await getPersistentTaskManager();
  logger.success('Task manager ready');

  // Log if there's an active task from previous session
  const currentTask = taskManager.getCurrentTask();
  if (currentTask && ['pending', 'running', 'waiting_input'].includes(currentTask.status)) {
    logger.info(`Active task restored from persistence: ${currentTask.id}`);
  }

  // Initialize task-harness integration
  const { initializeTaskIntegration, getTaskIntegration } = await import('../task/integration.js');
  await initializeTaskIntegration();
  logger.success('Task-harness integration ready');

  // Subscribe to task events — write to session + notify WhatsApp
  const integration = getTaskIntegration();

  integration.on('task:started', async ({ sessionId, goal }: { taskId: string; sessionId?: string; goal: string }) => {
    if (!sessionId || sessionId === 'unknown') return;

    try {
      const sManager = sessionManager!;
      const session = await sManager.getSessionById(sessionId);

      if (!session) return;

      // Notify WhatsApp with persona
      if (sendWhatsApp) {
        const notification = await formatNotification('task:started', {
          goal,
          scopeKey: session.id,
        });
        await sendEnvelopeNotification(session.userId, {
          kind: 'progress',
          severity: 'info',
          mode: 'conversational',
          emojiLevel: 'normal',
          title: 'Task Started',
          summary: notification,
        });
      }
    } catch (err) {
      logger.error('Failed to handle task:started event', err);
    }
  });

  integration.on('task:completed', async ({ taskId, sessionId }: { taskId: string; sessionId?: string }) => {
    if (!sessionId || sessionId === 'unknown') return;

    try {
      const sManager = sessionManager!;
      const session = await sManager.getSessionById(sessionId);

      if (!session) {
        logger.warn(`Session not found for task completion`, { sessionId });
        return;
      }

      const taskMgr = await getPersistentTaskManager();
      const task = taskMgr.getTask(taskId as TaskId);

      if (!task) return;

      const summary = task.result?.summary ?? 'Task completed';

      // Clear active task
      session.activeTaskId = null;
      await sManager.updateSession(session);

      // Build enriched completion message via hybrid notification system
      const durationSec = (task.startedAt && task.completedAt)
        ? Math.round((new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 1000)
        : undefined;

      const notification = await formatNotification('task:completed', {
        summary,
        filesCreated: task.result?.filesCreated,
        filesModified: task.result?.filesModified,
        filesDeleted: task.result?.filesDeleted,
        durationSec,
        scopeKey: session.id,
      });
      const completedEnvelope: ResponseEnvelope = {
        kind: 'action_result',
        severity: 'success',
        mode: 'conversational',
        emojiLevel: 'normal',
        title: 'Task Completed',
        summary: notification,
      };
      await sManager.addAssistantMessage(session, composeForActiveBridge(completedEnvelope));
      if (sendWhatsApp) {
        await sendEnvelopeNotification(session.userId, completedEnvelope);
      }
    } catch (err) {
      logger.error('Failed to handle task:completed event', err);
    }
  });

  integration.on('task:failed', async ({ sessionId, error }: { taskId: string; sessionId?: string; error?: string }) => {
    if (!sessionId || sessionId === 'unknown') return;

    try {
      const sManager = sessionManager!;
      const session = await sManager.getSessionById(sessionId);

      if (!session) {
        logger.warn(`Session not found for task failure`, { sessionId });
        return;
      }

      const userFacingError = normalizeTaskFailure(error);

      session.activeTaskId = null;
      await sManager.updateSession(session);

      // Send WhatsApp notification
      const notification = await formatNotification('task:failed', {
        error: userFacingError,
        scopeKey: session.id,
      });
      const failedEnvelope: ResponseEnvelope = {
        kind: 'error',
        severity: 'error',
        mode: 'conversational',
        emojiLevel: 'normal',
        title: 'Task Failed',
        summary: notification,
      };
      await sManager.addAssistantMessage(session, composeForActiveBridge(failedEnvelope));
      if (sendWhatsApp) {
        await sendEnvelopeNotification(session.userId, failedEnvelope);
      }
    } catch (err) {
      logger.error('Failed to handle task:failed event', err);
    }
  });

  initialized = true;
  logger.divider();
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Processes one incoming WhatsApp message.
 *
 * @param userId - WhatsApp JID (phone number)
 * @param message - Incoming message text
 * @param onProgress - Optional callback for intermediate messages
 * @returns Array of response messages to send
 */
export async function handleMessage(
  userId: string,
  message: string,
  onProgress?: (text: string) => Promise<void>
): Promise<string[]> {
  // Ensure initialized
  if (!initialized) {
    await initializeHandler();
  }

  const startTime = Date.now();
  logger.info(`Processing message (${message.length} chars)`);

  // Validate non-empty message
  if (!message || !message.trim()) {
    return ['I didn\'t catch that - could you send a message?'];
  }

  // Type-safety assertions
  const sManager = sessionManager!;

  try {
    // Get or create session
    const session = await sManager.getOrCreateSession(userId);

    // Update last activity
    session.lastActivityAt = new Date().toISOString();
    await sManager.updateSession(session);

    // Allow deterministic stop/cancel to interrupt an in-flight run.
    const lowerMessage = message.trim().toLowerCase();
    if (lowerMessage === '/stop' || lowerMessage === '/cancel' || lowerMessage.startsWith('/stop ') || lowerMessage.startsWith('/cancel ')) {
      await sManager.cancelAgentRun(session, 'Cancelled by /stop');
    }

    // Check for commands (slash commands AND natural language triggers like "what can you do")
    const { parseCommand } = await import('../commands/parser.js');
    const result = await parseCommand(message, session, sManager);
    if (result.handled) {
      if (result.envelopes?.length) {
        const rendered: string[] = [];
        for (const envelope of result.envelopes) {
          rendered.push(...renderEnvelopeChunks(envelope));
        }
        return rendered;
      }
      // Format command responses for active bridge
      return (result.responses || []).map(r => formatForActiveBridge(r));
    }

    const promptMode = selectPromptMode(message);
    const runAcquire = await sManager.acquireAgentRun(session, message, promptMode);
    if (!runAcquire.acquired) {
      return [formatForActiveBridge('I am still working on your previous request. Send /stop to interrupt it first.')];
    }

    const runId = runAcquire.run.runId;

    // Process with agent
    // Add a "thinking" message if it takes more than 3 seconds on the first try
    let initialSent = false;
    let settled = false;
    const thinkingTimer = setTimeout(() => {
      if (!initialSent && !settled && onProgress) {
        import('../agent/core.js').then(({ generateProgressMessage }) => {
          return generateProgressMessage(message, 1);
        }).then((progressMessage) => {
          if (!settled) {
            return onProgress(progressMessage);
          }
          return Promise.resolve();
        }).then(() => {
          if (!settled) {
            initialSent = true;
          }
        }).catch(err => {
          logger.warn('Thinking timer callback failed', err);
        });
      }
    }, 3000);

    let response: AgentResponse;
    try {
      response = await processMessage(message, session, (text) => {
        initialSent = true; // Any progress (even from retry) suppresses the initial timer
        return onProgress ? onProgress(text) : Promise.resolve();
      }, {
        runId,
        promptMode,
        abortSignal: runAcquire.signal,
        onLifecycle: async (phase, details) => {
          await sManager.updateAgentRunPhase(session, runId, phase, {
            ...(details?.error ? { lastError: details.error } : {}),
          });
        },
      });
    } finally {
      settled = true;
      clearTimeout(thinkingTimer);
    }

    // Build response array
    // If a task was started, suppress the LLM's conversational response —
    // the task:started and task:completed event listeners handle all notifications.
    const responses = response.taskStarted ? [] : buildResponses(response);

    const duration = Date.now() - startTime;
    logger.success(
      `Response ready (${responses.length} parts, ${duration}ms)`
    );

    // Store messages via SessionManager (triggers compaction + proper persistence)
    await sManager.addUserMessage(session, message);
    await sManager.addAssistantMessage(session, response.text);
    const completionPhase = /stopped\. i cancelled/i.test(response.text) ? 'cancelled' : 'completed';
    await sManager.completeAgentRun(session, runId, completionPhase, { telemetry: response.telemetry });

    return responses;
  } catch (error) {
    logger.error('Message handling failed', error);

    try {
      const existing = await sManager.getOrCreateSession(userId);
      const active = sManager.getActiveAgentRun(existing.id);
      if (active) {
        await sManager.completeAgentRun(existing, active.runId, 'failed', {
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (cleanupError) {
      logger.warn('Failed to finalize agent run state after handler error', cleanupError);
    }

    const errorMessage = sanitizeError(error);
    return [
      `Oops! Something went wrong: ${errorMessage}\n\nTry again or type /help.`,
    ];
  }
}

// =============================================================================
// RESPONSE BUILDING
// =============================================================================

/**
 * Converts an agent response into one or more WhatsApp messages.
 */
function buildResponses(response: AgentResponse): string[] {
  const responses: string[] = [];

  if (response.envelope) {
    responses.push(...renderEnvelopeChunks(response.envelope, response.intent));
    return responses;
  }

  // Main text response — format for WhatsApp (single formatting point)
  if (response.text) {
    // Strip leading 🐕 from LLM response to avoid duplication (legacy safety)
    let cleanText = response.text.replace(/^🐕\s*/, '').trim();
    // Replace em dashes and en dashes with hyphens (LLM doesn't always follow the rule)
    cleanText = cleanText.replace(/[—–]/g, '-');

    // Safeguard: detect repetition loops
    cleanText = deduplicateResponse(cleanText);

    const chunks = formatAndChunkForActiveBridge(cleanText, response.intent);
    for (const chunk of chunks) {
      responses.push(chunk);
    }
  }

  // Task started notification — now handled via proactive event in task:started
  // Remove mechanical message here to prevent double-notifying

  return responses;
}

// =============================================================================
// REPETITION DETECTION
// =============================================================================

/**
 * Removes obvious repetition loops from model output before sending to users.
 */
function deduplicateResponse(text: string): string {
  // 1. Exact byte-level repetition (catches copy-paste loops)
  const byteMatch = text.match(/(.{30,}?)\1{2,}/);
  if (byteMatch) {
    const idx = text.indexOf(byteMatch[1]);
    return text.substring(0, idx + byteMatch[1].length).trim();
  }

  // 2. Sentence-level dedup — split on sentence boundaries, remove repeats
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length < 4) return text;

  const seen = new Map<string, number>();
  const result: string[] = [];
  let dupeCount = 0;

  for (const sentence of sentences) {
    // Normalize: lowercase, collapse whitespace, strip punctuation for comparison
    const key = sentence.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    if (key.length < 10) {
      result.push(sentence);
      continue;
    }

    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);

    if (count <= 1) {
      result.push(sentence);
    } else {
      dupeCount++;
      if (dupeCount >= 3) break; // Stop after 3 duplicates — clearly looping
    }
  }

  return result.join(' ').trim();
}

// =============================================================================
// ERROR SANITIZATION
// =============================================================================

/**
 * Sanitizes internal error details before returning them to WhatsApp.
 */
function sanitizeError(error: unknown): string {
  let msg = error instanceof Error ? error.message : String(error);

  // Strip API keys / tokens (anything that looks like a long hex/base64 string after "key" or "token")
  msg = msg.replace(/(?:key|token|auth|bearer|password|secret)[=:\s]+[A-Za-z0-9_\-./+]{20,}/gi, '[redacted]');

  // Strip file paths (Unix and container paths)
  msg = msg.replace(/(?:\/(?:app|home|workspace|usr|var|tmp)\/)[^\s,)]+/g, '[path]');

  // Strip stack traces (lines starting with "at ")
  msg = msg.replace(/\n\s*at\s+.+/g, '');

  // Strip HTTP headers / raw request details
  msg = msg.replace(/(?:headers|request|response):\s*\{[^}]+\}/gi, '');

  // Cap length — don't dump huge error messages into WhatsApp
  if (msg.length > 200) {
    msg = msg.substring(0, 200).trim() + '...';
  }

  return msg.trim() || 'Unknown error';
}

/**
 * Maps raw task failures into short user-facing messages.
 */
function normalizeTaskFailure(error?: string): string {
  const raw = (error ?? 'Unknown error').trim();
  if (BROKEN_CODEX_SKILL_LINK_PATTERN.test(raw)) {
    return 'Codex skill links were misconfigured in the runtime. Fetch repaired the broken links; retry the task.';
  }
  const dejson = raw
    .replace(/\{\s*"type"\s*:\s*"(?:thread|turn|item)\.[\s\S]*?(?=\n|$)/g, '')
    .trim();
  const safe = sanitizeError(dejson || raw);
  if (!safe || /^(process failed:\s*)?$/i.test(safe)) {
    return 'Task failed due to runtime/tooling error. Check logs and retry.';
  }
  return safe;
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Resets handler initialization state.
 */
export async function shutdown(): Promise<void> {
  logger.info('Shutting down handler...');
  initialized = false;
}
