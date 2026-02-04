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
import { initializeToolRegistry } from '../tools/registry.js';
import { TaskManager, getTaskManager as getPersistentTaskManager } from '../task/manager.js';
import { taskQueue } from '../task/queue.js';
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

  await initializeToolRegistry();
  logger.success('Tool registry loaded');

  taskManager = await getPersistentTaskManager();
  logger.success('Task manager ready');

  // Sync queue with active task from persistent storage
  const currentTask = taskManager.getCurrentTask();
  if (currentTask && ['pending', 'running', 'waiting_input'].includes(currentTask.status)) {
    taskQueue.setCurrentTask(currentTask);
    logger.info(`TaskQueue synced with active task: ${currentTask.id}`);
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
  // const tManager = taskManager!;

  try {
    // Get or create session
    const session = await sManager.getOrCreateSession(userId);

    // Update last activity
    session.lastActivityAt = new Date().toISOString();
    await sManager.updateSession(session);

    // Check for slash commands (these bypass the agent)
    if (message.startsWith('/')) {
      return handleSlashCommand(message, userId);
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

// =============================================================================
// SLASH COMMANDS
// =============================================================================

/**
 * Handle slash commands (bypass agent)
 */
function handleSlashCommand(message: string, _userId: string): string[] {
  const cmd = message.toLowerCase().split(' ')[0];

  switch (cmd) {
    case '/help':
      return [
        `🐕 *Fetch Commands*

*Workspace*
/projects - List available projects
/select <name> - Select a project
/status - Current project status

*Tasks*
/task <description> - Start a coding task
/tasks - List active tasks
/cancel - Cancel current task

*Settings*
/auto [full|guided|manual] - Set autonomy level
/reset - Reset session

*Info*
/help - Show this help
/version - Show version info`,
      ];

    case '/version':
      return [`🐕 Fetch v2.0.0 (Orchestrator Architecture)`];

    case '/reset':
      return [`🐕 Session reset! Fresh start.`];

    default:
      return [`🐕 Unknown command: ${cmd}\n\nType /help for available commands.`];
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

  // Main text response
  if (response.text) {
    responses.push(response.text);
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
