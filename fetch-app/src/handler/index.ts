/**
 * Message Handler
 * 
 * Main entry point for processing incoming WhatsApp messages.
 * Orchestrates command parsing, session management, and agent execution.
 */

// Session type used implicitly through SessionManager
import { SessionManager, getSessionManager } from '../session/manager.js';
import { AgentCore } from '../agent/core.js';
import { getToolRegistry, initializeToolRegistry } from '../tools/registry.js';
import { parseCommand } from '../commands/parser.js';
import { logger } from '../utils/logger.js';

// Singleton instances
let sessionManager: SessionManager;
let agent: AgentCore;
let initialized = false;

/**
 * Initialize the message handler
 */
export async function initializeHandler(): Promise<void> {
  if (initialized) return;
  
  logger.info('Initializing message handler...');
  
  // Initialize components
  sessionManager = await getSessionManager();
  await initializeToolRegistry();
  agent = new AgentCore(sessionManager, getToolRegistry());
  
  initialized = true;
  logger.info('Message handler ready');
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
  logger.info('Handling message', { userId, messageLength: message.length });

  try {
    // Get or create session
    const session = await sessionManager.getOrCreateSession(userId);
    
    // Update last activity
    session.lastActivityAt = new Date().toISOString();
    await sessionManager.updateSession(session);

    // Check for commands
    const commandResult = await parseCommand(message, session, sessionManager, agent);
    
    if (commandResult.handled) {
      logger.info('Command handled', { 
        userId, 
        duration: Date.now() - startTime 
      });
      return commandResult.responses || [];
    }

    // Process with agent
    const responses = await agent.processMessage(session, message);
    
    logger.info('Message processed', {
      userId,
      responseCount: responses.length,
      duration: Date.now() - startTime
    });

    return responses;

  } catch (error) {
    logger.error('Message handling error', { userId, error });
    
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
