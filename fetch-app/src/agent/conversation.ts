/**
 * @fileoverview Conversation Mode Handler
 * 
 * Handles simple chat messages without tool use or task creation.
 * This is the lightweight mode for greetings, thanks, and general questions
 * where no code manipulation is needed.
 * 
 * @module agent/conversation
 * @see {@link handleConversation} - Main entry point
 * @see {@link ../intent.ts} - Intent classification that routes here
 * 
 * ## When Used
 * 
 * Conversation mode is triggered when the intent classifier detects:
 * - Greetings: "Hey!", "Good morning", "What's up?"
 * - Thanks: "Thanks!", "Great job", "Appreciate it"
 * - Farewells: "Bye", "See ya", "Good night"
 * - General questions (non-code): "What does X mean?"
 * 
 * ## Characteristics
 * 
 * - **No tools**: Pure LLM response without tool calls
 * - **Fast**: Minimal latency, short responses
 * - **Friendly**: Warm, approachable tone
 * - **Context-aware**: Knows about current project/task
 * 
 * @example
 * ```typescript
 * import { handleConversation } from './conversation.js';
 * 
 * const responses = await handleConversation(
 *   session,
 *   "Hey there!",
 *   { type: 'conversation', confidence: 0.95, reason: 'greeting' }
 * );
 * // ["Hey! 👋 How can I help you with your code today?"]
 * ```
 */

import OpenAI from 'openai';
import { Session } from '../session/types.js';
import { logger } from '../utils/logger.js';
import { ClassifiedIntent } from './intent.js';
import { buildConversationPrompt, buildMessageHistory } from './prompts.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** OpenRouter API key from environment */
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/** LLM model to use (configurable via AGENT_MODEL env var) */
const MODEL = process.env.AGENT_MODEL || 'openai/gpt-4o-mini';

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Handles conversation mode - quick LLM response without tools.
 * 
 * Generates a friendly, context-aware response for non-coding interactions.
 * Uses minimal tokens and fast response times optimized for mobile.
 * 
 * @param {Session} session - Current user session with context
 * @param {string} message - The user's message text
 * @param {ClassifiedIntent} intent - Classification result with reason
 * @returns {Promise<string[]>} Array of response messages (usually one)
 * 
 * @example
 * ```typescript
 * // Greeting
 * await handleConversation(session, "Hello!", greetingIntent);
 * // → ["Hey! 👋 How can I help you today?"]
 * 
 * // Thanks
 * await handleConversation(session, "Thanks for the help!", thanksIntent);
 * // → ["You're welcome! Let me know if you need anything else."]
 * ```
 */
export async function handleConversation(
  session: Session,
  message: string,
  intent: ClassifiedIntent
): Promise<string[]> {
  logger.info('Conversation mode', { 
    userId: session.userId, 
    reason: intent.reason,
    message: message.substring(0, 50)
  });

  const openai = new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1'
  });

  // Use centralized prompt builder
  const systemPrompt = buildConversationPrompt(session);

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...buildMessageHistory(session, 4),
        { role: 'user', content: message }
      ],
      max_tokens: 300,  // Short responses for mobile
      temperature: 0.7, // Slightly creative for friendly tone
    });

    const reply = response.choices[0]?.message?.content?.trim() || 
      "Hey! How can I help you today?";

    logger.debug('Conversation response', { reply: reply.substring(0, 100) });
    
    return [reply];
  } catch (error) {
    logger.error('Conversation mode error', { error });
    return ["Hey! I'm here to help. What would you like to work on?"];
  }
}
