/**
 * @fileoverview Message Handler - Main Processing Entry Point
 * 
 * Orchestrates the flow of incoming WhatsApp messages through command
 * parsing, session management, and agent execution.
 * 
 * @module handler
 * @see {@link handleMessage} - Main message processing function
 * @see {@link initializeHandler} - Component initialization
 * 
 * ## Processing Flow
 * 
 * ```
 * Incoming Message
 *      ↓
 * initializeHandler() (if not initialized)
 *      ↓
 * Get/Create Session
 *      ↓
 * parseCommand() ──→ Command? → Execute & Return
 *      ↓ No
 * agent.processMessage()
 *      ↓
 * Return Responses
 * ```
 * 
 * ## Components
 * 
 * | Component | Purpose |
 * |-----------|--------|
 * | SessionManager | User session persistence |
 * | AgentCore | LLM-based message processing |
 * | ToolRegistry | Available agent tools |
 * | CommandParser | Slash command handling |
 * 
 * @example
 * ```typescript
 * import { handleMessage, initializeHandler } from './handler/index.js';
 * 
 * await initializeHandler();
 * const responses = await handleMessage('user123', 'Hello!');
 * // Send responses back to WhatsApp
 * ```
 */

// Session type used implicitly through SessionManager
import { SessionManager, getSessionManager } from '../session/manager.js';
import { AgentCore } from '../agent/core.js';
import { getToolRegistry, initializeToolRegistry } from '../tools/registry.js';
import { parseCommand } from '../commands/parser.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// SINGLETON STATE
// =============================================================================

/** Session manager singleton */
let sessionManager: SessionManager;

/** Agent core singleton */
let agent: AgentCore;

/** Initialization flag */
let initialized = false;

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initializes the message handler components.
 * 
 * Sets up session manager, tool registry, and agent core.
 * Safe to call multiple times (idempotent).
 * 
 * @returns {Promise<void>}
 */
export async function initializeHandler(): Promise<void> {
  if (initialized) return;
  
  logger.section('⚙️  Initializing Handler');
  
  // Initialize components
  sessionManager = await getSessionManager();
  logger.success('Session manager ready');
  
  await initializeToolRegistry();
  logger.success('Tool registry loaded');
  
  agent = new AgentCore(sessionManager, getToolRegistry());
  logger.success('Agent core ready');
  
  initialized = true;
  logger.divider();
}

/**
 * Process an incoming WhatsApp message
 * 
 * @param userId - WhatsApp JID (phone number)
 * @param message - Incoming message text
 * @returns Array of response messages to send
 */
export async function handleMessage(
  userId: string,
  message: string
): Promise<string[]> {
  // Ensure initialized
  if (!initialized) {
    await initializeHandler();
  }

  const startTime = Date.now();
  logger.info(`Processing message (${message.length} chars)`);

  try {
    // Get or create session
    const session = await sessionManager.getOrCreateSession(userId);
    
    // Update last activity
    session.lastActivityAt = new Date().toISOString();
    await sessionManager.updateSession(session);

    // Check for commands
    const commandResult = await parseCommand(message, session, sessionManager, agent);
    
    if (commandResult.handled) {
      const duration = Date.now() - startTime;
      logger.success(`Command completed in ${duration}ms`);
      return commandResult.responses || [];
    }

    // Process with agent
    const responses = await agent.processMessage(session, message);
    
    const duration = Date.now() - startTime;
    logger.success(`Agent response ready (${responses.length} parts, ${duration}ms)`);

    return responses;

  } catch (error) {
    logger.error('Message handling failed', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return [`❌ Error: ${errorMessage}\n\nPlease try again or type /help.`];
  }
}

/**
 * Handle a quick response (yes/no/etc.)
 * This is optimized for approval responses.
 */
export async function handleQuickResponse(
  userId: string,
  response: 'yes' | 'no' | 'skip' | 'yesall'
): Promise<string[]> {
  return handleMessage(userId, response);
}

/**
 * Get session status for a user
 */
export async function getSessionStatus(userId: string): Promise<{
  hasActiveTask: boolean;
  taskStatus?: string;
  awaitingApproval: boolean;
  autonomyLevel: string;
}> {
  if (!initialized) {
    await initializeHandler();
  }

  const session = await sessionManager.getOrCreateSession(userId);
  
  return {
    hasActiveTask: !!session.currentTask,
    taskStatus: session.currentTask?.status,
    awaitingApproval: !!session.currentTask?.pendingApproval,
    autonomyLevel: session.preferences.autonomyLevel
  };
}

/**
 * Force stop any active task for a user
 */
export async function forceStop(userId: string): Promise<string[]> {
  return handleMessage(userId, '/stop');
}

/**
 * Clean up resources
 */
export async function shutdown(): Promise<void> {
  logger.info('Shutting down message handler...');
  initialized = false;
}

// Export singleton accessor
export function getAgent(): AgentCore {
  if (!agent) {
    throw new Error('Handler not initialized');
  }
  return agent;
}
