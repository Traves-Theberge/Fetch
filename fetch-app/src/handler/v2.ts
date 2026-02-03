/**
 * @fileoverview V2 Message Handler - Orchestrator Architecture
 *
 * Handles incoming WhatsApp messages using the v2 orchestrator
 * architecture that delegates to harnesses.
 *
 * @module handler/v2
 * @see {@link processMessageV2} - V2 agent entry point
 * @see {@link handleMessageV2} - V2 message handler
 */

import { nanoid } from 'nanoid';
import { SessionManager, getSessionManager } from '../session/manager.js';
import { processMessageV2, type AgentResponse } from '../agent/core-v2.js';
import { initializeV2Registry } from '../tools/v2/registry.js';
import { TaskManager } from '../task/manager.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// SINGLETON STATE
// =============================================================================

/** Session manager singleton */
let sessionManager: SessionManager;

/** Task manager singleton */
let taskManager: TaskManager;

/** Initialization flag */
let initialized = false;

// =============================================================================
// FEATURE FLAGS
// =============================================================================

/**
 * Check if v2 agent is enabled
 *
 * Can be controlled via:
 * - FETCH_V2_ENABLED=true environment variable
 * - User session preference (future)
 */
export function isV2Enabled(): boolean {
  return process.env.FETCH_V2_ENABLED === 'true';
}

/**
 * Check if user should use v2 agent
 * Supports gradual rollout via user ID hashing
 */
export function shouldUseV2(userId: string): boolean {
  if (!isV2Enabled()) return false;

  // Gradual rollout: FETCH_V2_ROLLOUT_PERCENT=10 (0-100)
  const rolloutPercent = parseInt(
    process.env.FETCH_V2_ROLLOUT_PERCENT ?? '100',
    10
  );

  if (rolloutPercent >= 100) return true;
  if (rolloutPercent <= 0) return false;

  // Hash user ID for consistent rollout
  const hash = simpleHash(userId);
  return hash % 100 < rolloutPercent;
}

/**
 * Simple string hash for rollout bucketing
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit int
  }
  return Math.abs(hash);
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize v2 handler components
 */
export async function initializeHandlerV2(): Promise<void> {
  if (initialized) return;

  logger.section('⚙️  Initializing V2 Handler');

  // Initialize components
  sessionManager = await getSessionManager();
  logger.success('Session manager ready');

  await initializeV2Registry();
  logger.success('V2 tool registry loaded');

  taskManager = new TaskManager();
  logger.success('Task manager ready');

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
 * Process an incoming WhatsApp message with v2 agent
 *
 * @param userId - WhatsApp JID (phone number)
 * @param message - Incoming message text
 * @returns Array of response messages to send
 */
export async function handleMessageV2(
  userId: string,
  message: string
): Promise<string[]> {
  // Ensure initialized
  if (!initialized) {
    await initializeHandlerV2();
  }

  const startTime = Date.now();
  logger.info(`[V2] Processing message (${message.length} chars)`);

  try {
    // Get or create session
    const session = await sessionManager.getOrCreateSession(userId);

    // Update last activity
    session.lastActivityAt = new Date().toISOString();
    await sessionManager.updateSession(session);

    // Check for slash commands (these bypass the agent)
    if (message.startsWith('/')) {
      return handleSlashCommand(message, userId);
    }

    // Process with v2 agent
    const response = await processMessageV2(message, session);

    // Build response array
    const responses = buildResponses(response);

    const duration = Date.now() - startTime;
    logger.success(
      `[V2] Response ready (${responses.length} parts, ${duration}ms)`
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
    await sessionManager.updateSession(session);

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
 * Shutdown v2 handler
 */
export async function shutdownV2(): Promise<void> {
  logger.info('[V2] Shutting down handler...');
  initialized = false;
}
