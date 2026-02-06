/**
 * @fileoverview Message Handler - Orchestrator Architecture
 *
 * Handles incoming WhatsApp messages using the orchestrator
 * architecture that delegates to harnesses.
 *
 * @module handler
 * @see {@link processMessage} - Agent entry point
 * @see {@link handleMessage} - Main message handler
 */

import { nanoid } from 'nanoid';
import { SessionManager, getSessionManager } from '../session/manager.js';
import { processMessage, type AgentResponse } from '../agent/core.js';
import { TaskManager, getTaskManager as getPersistentTaskManager } from '../task/manager.js';
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
  const { initializeTaskIntegration } = await import('../task/integration.js');
  await initializeTaskIntegration();
  logger.success('Task-harness integration ready');

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

    // Update session message history
    session.messages = session.messages || [];
    session.messages.push(
      { id: nanoid(), role: 'user', content: message, timestamp: new Date().toISOString() },
      {
        id: nanoid(),
        role: 'assistant',
        content: response.text,
        timestamp: new Date().toISOString(),
      }
    );
    await sManager.updateSession(session);

    return responses;
  } catch (error) {
    logger.error('[V2] Message handling failed', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return [
      `🐕 Oops! Something went wrong: ${errorMessage}\n\nTry again or type /help.`,
    ];
  }
}

import { getModeManager } from '../modes/manager.js';
import { FetchMode } from '../modes/types.js';
import { formatForWhatsApp } from '../agent/whatsapp-format.js';

// ... existing imports ...

// =============================================================================
// RESPONSE BUILDING
// =============================================================================

/**
 * Build WhatsApp response array from agent response
 */
function buildResponses(response: AgentResponse): string[] {
  const responses: string[] = [];
  const mm = getModeManager();
  const state = mm.getState();
  
  let emoji = '🟢'; // DEFAULT: ALERT
  switch(state.mode) {
      case FetchMode.WORKING: emoji = '🔵'; break;
      case FetchMode.GUARDING: emoji = '🔴'; break;
      case FetchMode.WAITING: emoji = '🟡'; break;
      case FetchMode.RESTING: emoji = '💤'; break;
  }

  // Main text response — format for WhatsApp (single formatting point)
  if (response.text) {
      responses.push(`${emoji} ${formatForWhatsApp(response.text)}`);
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
// TASK MANAGEMENT
// =============================================================================

/**
 * Get task manager instance
 */
export function getTaskManager(): TaskManager {
  if (!taskManager) {
    throw new Error('V2 Handler not initialized');
  }
  return taskManager;
}

/**
 * Get session manager instance
 */
export function getSessionManagerV2(): SessionManager {
  if (!sessionManager) {
    throw new Error('V2 Handler not initialized');
  }
  return sessionManager;
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
