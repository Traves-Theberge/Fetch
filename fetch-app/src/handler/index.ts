/**
 * @fileoverview Message Handler
 *
 * Entry point for incoming WhatsApp messages. Manages session lifecycle,
 * delegates to the agent core (LLM-first single path), and builds
 * WhatsApp-formatted responses.
 *
 * @module handler
 * @see {@link handleMessage} - Main message handler
 * @see {@link processMessage} - Agent core (LLM + tools)
 */

import { SessionManager, getSessionManager } from '../session/manager.js';
import { processMessage, type AgentResponse } from '../agent/core.js';
import { type TaskManager, getTaskManager as getPersistentTaskManager } from '../task/manager.js';
import type { TaskId } from '../task/types.js';
import { formatForWhatsApp } from '../agent/whatsapp-format.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// SINGLETON STATE
// =============================================================================

/** Session manager singleton */
let sessionManager: SessionManager | null = null;

/** Task manager singleton */
let taskManager: TaskManager | null = null;

/** Initialization flag */
let initialized = false;

/** WhatsApp send callback for proactive messages (task completions, etc.) */
let sendWhatsApp: ((userId: string, text: string) => Promise<void>) | null = null;

/**
 * Register WhatsApp send function for proactive messages.
 * Called by bridge/client.ts during initialization.
 */
export function registerWhatsAppSender(fn: (userId: string, text: string) => Promise<void>): void {
  sendWhatsApp = fn;
  logger.info('WhatsApp sender registered for proactive messages');
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize handler components
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

  // Subscribe to task completion events — write to session + notify WhatsApp
  const integration = getTaskIntegration();

  integration.on('task:completed', async ({ taskId, sessionId }: { taskId: string; sessionId?: string }) => {
    if (!sessionId || sessionId === 'unknown') return;

    try {
      const sManager = sessionManager!;
      const session = await sManager.getOrCreateSession(sessionId);
      const taskMgr = await getPersistentTaskManager();
      const task = taskMgr.getTask(taskId as TaskId);

      if (!task) return;

      // Add completion message to session history
      const summary = task.result?.summary ?? 'Task completed';
      await sManager.addAssistantMessage(session, `✅ Task completed: ${summary}`);

      // Clear active task
      session.activeTaskId = null;
      await sManager.updateSession(session);

      // Send WhatsApp notification
      if (sendWhatsApp) {
        await sendWhatsApp(sessionId, `🐕 ✅ Task finished!\n\n${summary}`);
      }
    } catch (err) {
      logger.error('Failed to handle task:completed event', err);
    }
  });

  integration.on('task:failed', async ({ sessionId, error }: { taskId: string; sessionId?: string; error?: string }) => {
    if (!sessionId || sessionId === 'unknown') return;

    try {
      const sManager = sessionManager!;
      const session = await sManager.getOrCreateSession(sessionId);

      await sManager.addAssistantMessage(session, `❌ Task failed: ${error ?? 'Unknown error'}`);

      session.activeTaskId = null;
      await sManager.updateSession(session);

      // Send WhatsApp notification
      if (sendWhatsApp) {
        await sendWhatsApp(sessionId, `🐕 ❌ Task failed: ${error ?? 'Unknown error'}`);
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
 * Process an incoming WhatsApp message
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

  // Type-safety assertions
  const sManager = sessionManager!;

  try {
    // Get or create session
    const session = await sManager.getOrCreateSession(userId);

    // Update last activity
    session.lastActivityAt = new Date().toISOString();
    await sManager.updateSession(session);

    // Check for slash commands (these bypass the agent)
    if (message.startsWith('/')) {
      const { parseCommand } = await import('../commands/parser.js');
      const result = await parseCommand(message, session, sManager);
      if (result.handled) {
        // Format slash command responses for WhatsApp too
        return (result.responses || []).map(r => formatForWhatsApp(r));
      }
    }

    // Process with agent
    const response = await processMessage(message, session, onProgress);

    // Build response array
    const responses = buildResponses(response);

    const duration = Date.now() - startTime;
    logger.success(
      `Response ready (${responses.length} parts, ${duration}ms)`
    );

    // Store messages via SessionManager (triggers compaction + proper persistence)
    await sManager.addUserMessage(session, message);
    await sManager.addAssistantMessage(session, response.text);

    return responses;
  } catch (error) {
    logger.error('Message handling failed', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return [
      `🐕 Oops! Something went wrong: ${errorMessage}\n\nTry again or type /help.`,
    ];
  }
}

// =============================================================================
// RESPONSE BUILDING
// =============================================================================

/**
 * Build WhatsApp response array from agent response
 */
function buildResponses(response: AgentResponse): string[] {
  const responses: string[] = [];

  // Main text response — format for WhatsApp (single formatting point)
  if (response.text) {
      responses.push(`🐕 ${formatForWhatsApp(response.text)}`);
  }

  // Task started notification
  if (response.taskStarted && response.taskId) {
    responses.push(
      `\n📋 *Task Started*: ${response.taskId}\nI'll update you on progress!`
    );
  }

  return responses;
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Shutdown handler
 */
export async function shutdown(): Promise<void> {
  logger.info('Shutting down handler...');
  initialized = false;
}
