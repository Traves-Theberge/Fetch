/**
 * @fileoverview Session Manager - High-Level Session API
 * 
 * Provides the primary interface for managing user sessions, messages,
 * and repo-map caching. Acts as facade over SessionStore.
 * 
 * @module session/manager
 * @see {@link SessionManager} - Main manager class
 * @see {@link SessionStore} - Underlying persistence
 * 
 * ## Responsibilities
 * 
 * - Session lifecycle (create, get, update)
 * - Message management (add user/assistant/tool messages)
 * - Message compaction (LLM-summarize old messages to save context)
 * - Repo-map caching (auto-refresh on staleness)
 * 
 * ## Usage Pattern
 * 
 * ```typescript
 * const manager = new SessionManager();
 * await manager.init();
 * 
 * const session = await manager.getSession('user123');
 * await manager.addUserMessage(session, 'Hello!');
 * ```
 * 
 * ## Message Flow
 * 
 * ```
 * User Input → addUserMessage()
 *      ↓
 * Agent Processing
 *      ↓
 * addAssistantMessage() or addToolMessage()
 * ```
 */

import { 
  Session, 
  Message, 
  createMessage,
  ToolCall
} from './types.js';
import { SessionStore, getSessionStore } from './store.js';
import { pipeline } from '../config/pipeline.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// SESSION MANAGER CLASS
// =============================================================================

/**
 * High-level manager for user sessions and conversation state.
 * 
 * Provides methods for session CRUD, message persistence,
 * context compaction, and repo-map caching.
 * 
 * @class
 * @example
 * ```typescript
 * const manager = new SessionManager();
 * await manager.init();
 * 
 * const session = await manager.getSession('user123');
 * await manager.addUserMessage(session, 'Fix the bug');
 * ```
 */
export class SessionManager {
  private store: SessionStore;
  private compactionFailures: Map<string, number> = new Map();

  constructor(store?: SessionStore) {
    this.store = store || getSessionStore();
  }

  /**
   * Initialize the session manager
   */
  async init(): Promise<void> {
    await this.store.init();
  }

  /**
   * Get or create a session for a user
   */
  async getSession(userId: string): Promise<Session> {
    return this.store.getOrCreate(userId);
  }

  /**
   * Alias for getSession (used by handler)
   */
  async getOrCreateSession(userId: string): Promise<Session> {
    return this.getSession(userId);
  }

  /**
   * Get session by Session ID
   */
  async getSessionById(sessionId: string): Promise<Session | undefined> {
    return this.store.getById(sessionId);
  }

  /**
   * Update a session
   */
  async updateSession(session: Session): Promise<void> {
    await this.store.update(session);
  }

  // ============================================================================
  // Message Management
  // ============================================================================

  /**
   * Add a user message to the session
   */
  async addUserMessage(session: Session, content: string): Promise<Message> {
    const message = createMessage('user', content);
    session.messages.push(message);
    await this.store.update(session);
    
    // Compact if message count exceeds threshold
    this.compactIfNeeded(session).then(() => {
      this.compactionFailures.delete(session.id);
    }).catch(err => {
      const count = (this.compactionFailures.get(session.id) ?? 0) + 1;
      this.compactionFailures.set(session.id, count);
      if (count >= 3) {
        logger.error(`Compaction failing repeatedly for session ${session.id} (${count} failures)`, err);
      } else {
        logger.warn('Background compaction failed', err);
      }
    });

    return message;
  }

  /**
   * Add an assistant message to the session
   */
  async addAssistantMessage(session: Session, content: string): Promise<Message> {
    const message = createMessage('assistant', content);
    session.messages.push(message);
    await this.store.update(session);
    return message;
  }

  /**
   * Add an assistant message with tool calls (when LLM requests tools)
   */
  async addAssistantToolCallMessage(
    session: Session,
    content: string | null,
    toolCalls: Array<{ id: string; name: string; arguments: string }>
  ): Promise<Message> {
    const message = createMessage(
      'assistant',
      content || '',
      undefined,
      toolCalls.map(tc => ({ id: tc.id, name: tc.name, arguments: tc.arguments }))
    );
    session.messages.push(message);
    await this.store.update(session);
    return message;
  }

  /**
   * Add a tool call message to the session
   */
  async addToolMessage(
    session: Session, 
    toolCall: ToolCall,
    content?: string,
    toolCallId?: string
  ): Promise<Message> {
    const message = createMessage(
      'tool', 
      content || `Tool: ${toolCall.name}`,
      toolCall
    );
    // Override the auto-generated ID with the tool_call_id for proper pairing
    if (toolCallId) {
      message.id = toolCallId;
    }
    session.messages.push(message);
    await this.store.update(session);
    return message;
  }

  // ============================================================================
  // Compaction (Context Pipeline)
  // ============================================================================

  /**
   * Compact message history when it exceeds the threshold.
   *
   * LLM-summarizes old messages into session.metadata.compactionSummary,
   * then shrinks the message array to the last `historyWindow` messages.
   * One summary, refreshed each compaction cycle.
   */
  async compactIfNeeded(session: Session): Promise<void> {
    if (session.messages.length <= pipeline.compactionThreshold) return;

    const keep = pipeline.historyWindow;
    const oldMessages = session.messages.slice(0, -keep);
    const recentMessages = session.messages.slice(-keep);

    // Build transcript of old messages for summarization
    const transcript = oldMessages.map(m => {
      const role = m.role.toUpperCase();
      let content = m.content;
      if (m.toolCalls) content += ` [Tools: ${m.toolCalls.map(t => t.name).join(', ')}]`;
      if (m.toolCall) content = `[${m.toolCall.name}]: ${m.toolCall.result ?? 'no result'}`;
      return `${role}: ${content}`;
    }).join('\n');

    // LLM-generate compact summary
    const summary = await this.generateCompactionSummary(transcript, session);

    // Replace old messages with summary in metadata
    if (!session.metadata) session.metadata = {};
    session.metadata.compactionSummary = summary;
    session.metadata.compactedAt = new Date().toISOString();
    session.metadata.compactedMessageCount = (session.metadata.compactedMessageCount ?? 0) + oldMessages.length;
    session.messages = recentMessages;

    await this.store.update(session);
    logger.info('Compacted session', {
      sessionId: session.id,
      removed: oldMessages.length,
      remaining: recentMessages.length,
      totalCompacted: session.metadata.compactedMessageCount
    });
  }

  /**
   * Generate a compaction summary from a transcript of old messages.
   * Uses a cheap/fast model to stay within token budget.
   */
  private async generateCompactionSummary(transcript: string, session: Session): Promise<string> {
    try {
      const OpenAI = (await import('openai')).default;
      const { env } = await import('../config/env.js');

      const openai = new OpenAI({
        apiKey: env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
      });

      const workspace = session.currentProject?.name ?? 'unknown';

      const response = await openai.chat.completions.create({
        model: pipeline.compactionModel,
        messages: [
          {
            role: 'system',
            content: `You are summarizing a conversation between a user and an AI coding assistant (Fetch).
Workspace: ${workspace}

Condense the following conversation transcript into a concise summary. Include:
- Key decisions made
- Files discussed or modified
- Tools used and their results
- Any unresolved questions or pending work

Be specific — mention file names, function names, and concrete details.
Keep it under ${pipeline.compactionMaxTokens} tokens.`
          },
          {
            role: 'user',
            content: transcript
          }
        ],
        max_tokens: pipeline.compactionMaxTokens,
        temperature: 0.3,
      });

      return response.choices[0]?.message?.content ?? 'Unable to generate summary';
    } catch (err) {
      logger.error('Compaction summary generation failed', err);
      // Fallback: simple truncated transcript
      return `[Auto-summary failed — ${transcript.length} chars of conversation compacted]`;
    }
  }

  // ============================================================================
  // Repo Map Management
  // ============================================================================

  /**
   * Update the cached repo map
   */
  async updateRepoMap(session: Session, repoMap: string): Promise<void> {
    session.repoMap = repoMap;
    session.repoMapUpdatedAt = new Date().toISOString();
    await this.store.update(session);
    logger.debug('Updated repo map', { sessionId: session.id });
  }

  /**
   * Check if repo map needs refresh (older than 5 minutes)
   */
  isRepoMapStale(session: Session): boolean {
    if (!session.repoMapUpdatedAt) return true;
    
    const updatedAt = new Date(session.repoMapUpdatedAt).getTime();
    return Date.now() - updatedAt > pipeline.repoMapTtl;
  }

}


// Singleton instance
let managerInstance: SessionManager | null = null;
let initPromise: Promise<SessionManager> | null = null;

/**
 * Get the singleton session manager instance
 */
export async function getSessionManager(): Promise<SessionManager> {
  if (managerInstance) return managerInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const instance = new SessionManager();
    await instance.init();
    managerInstance = instance;
    return instance;
  })();

  return initPromise;
}
