/**
 * @fileoverview High-level session orchestration API.
 *
 * Responsibilities:
 * - session lifecycle operations over `SessionStore`
 * - message append operations (user/assistant/tool)
 * - background compaction of long histories
 * - repo-map cache freshness checks
 * - memory add/recall delegation
 *
 * @module session/manager
 */

import {
  Session,
  Message,
  createMessage,
  ToolCall,
  AgentRunState,
  AgentRunPhase,
  AgentTurnTelemetry,
  PromptMode,
  type MemoryCategory,
  type MemoryEntry,
  generateId,
} from './types.js';
import { SessionStore, getSessionStore } from './store.js';
import { pipeline } from '../config/pipeline.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// SESSION MANAGER CLASS
// =============================================================================

/**
 * Facade over session store with orchestration helpers used by handlers/tools.
 */
export class SessionManager {
  private store: SessionStore;
  private compactionFailures: Map<string, number> = new Map();
  private sessionWriteQueues: Map<string, Promise<void>> = new Map();
  private activeAgentRuns: Map<string, AgentRunState> = new Map();
  private runAbortControllers: Map<string, AbortController> = new Map();

  constructor(store?: SessionStore) {
    this.store = store || getSessionStore();
  }

  // ============================================================================
  // Agent Run Lifecycle
  // ============================================================================

  /**
   * Attempts to acquire a single active run slot for a session.
   * Returns the active run when one is already in progress.
   */
  async acquireAgentRun(
    session: Session,
    message: string,
    promptMode: PromptMode
  ): Promise<{ acquired: true; run: AgentRunState; signal: AbortSignal } | { acquired: false; activeRun: AgentRunState }> {
    return this.withSessionWriteLock(session.id, async () => {
      const current = await this.getLatestSessionOrFallback(session);
      const active = this.activeAgentRuns.get(session.id);
      if (active) {
        return { acquired: false, activeRun: active };
      }

      const now = new Date().toISOString();
      const run: AgentRunState = {
        runId: `run_${generateId(10)}`,
        phase: 'queued',
        promptMode,
        messagePreview: message.trim().slice(0, 140),
        startedAt: now,
        updatedAt: now,
      };

      const controller = new AbortController();
      this.activeAgentRuns.set(session.id, run);
      this.runAbortControllers.set(session.id, controller);
      this.applyActiveRunToSession(current, run);
      await this.store.update(current);
      this.syncSessionReference(session, current);

      return { acquired: true, run, signal: controller.signal };
    });
  }

  /**
   * Returns active in-memory run state, if any.
   */
  getActiveAgentRun(sessionId: string): AgentRunState | undefined {
    return this.activeAgentRuns.get(sessionId);
  }

  /**
   * Updates the current run phase and optional details.
   */
  async updateAgentRunPhase(
    session: Session,
    runId: string,
    phase: AgentRunPhase,
    patch?: Partial<Pick<AgentRunState, 'lastError' | 'cancelRequested' | 'cancelReason'>>
  ): Promise<void> {
    await this.withSessionWriteLock(session.id, async () => {
      const active = this.activeAgentRuns.get(session.id);
      if (!active || active.runId !== runId) return;

      const now = new Date().toISOString();
      const updated: AgentRunState = {
        ...active,
        ...patch,
        phase,
        updatedAt: now,
      };

      this.activeAgentRuns.set(session.id, updated);
      const current = await this.getLatestSessionOrFallback(session);
      this.applyActiveRunToSession(current, updated);
      await this.store.update(current);
      this.syncSessionReference(session, current);
    });
  }

  /**
   * Cancels the active run (if present) and aborts in-flight model/tool calls.
   */
  async cancelAgentRun(session: Session, reason: string = 'Cancelled by user'): Promise<{ cancelled: boolean; runId?: string }> {
    return this.withSessionWriteLock(session.id, async () => {
      const active = this.activeAgentRuns.get(session.id);
      if (!active) {
        return { cancelled: false };
      }

      const now = new Date().toISOString();
      const updated: AgentRunState = {
        ...active,
        phase: 'cancelled',
        cancelRequested: true,
        cancelReason: reason,
        updatedAt: now,
      };

      this.activeAgentRuns.set(session.id, updated);
      this.runAbortControllers.get(session.id)?.abort(reason);

      const current = await this.getLatestSessionOrFallback(session);
      this.applyActiveRunToSession(current, updated);
      await this.store.update(current);
      this.syncSessionReference(session, current);

      return { cancelled: true, runId: active.runId };
    });
  }

  /**
   * Completes and archives an active run record.
   */
  async completeAgentRun(
    session: Session,
    runId: string,
    phase: 'completed' | 'failed' | 'cancelled',
    details?: { lastError?: string; telemetry?: AgentTurnTelemetry }
  ): Promise<void> {
    await this.withSessionWriteLock(session.id, async () => {
      const active = this.activeAgentRuns.get(session.id);
      if (!active || active.runId !== runId) return;

      const now = new Date().toISOString();
      const finalRun: AgentRunState = {
        ...active,
        phase,
        updatedAt: now,
        ...(details?.lastError ? { lastError: details.lastError } : {}),
      };

      const current = await this.getLatestSessionOrFallback(session);
      const runtime = this.getRuntimeMetadata(current);
      const existingHistory = Array.isArray(runtime.recentRuns) ? runtime.recentRuns : [];
      const historyEntry = {
        ...finalRun,
        finishedAt: now,
        telemetry: details?.telemetry,
      };
      runtime.recentRuns = [historyEntry, ...existingHistory].slice(0, pipeline.runHistoryLimit);
      runtime.lastTelemetry = details?.telemetry ?? runtime.lastTelemetry;
      delete runtime.activeRun;
      current.metadata.agentRuntime = runtime;

      this.activeAgentRuns.delete(session.id);
      this.runAbortControllers.delete(session.id);
      await this.store.update(current);
      this.syncSessionReference(session, current);
    });
  }

  /**
   * Writes lightweight short-term and durable memory tiers for agent turns.
   */
  async recordMemoryTiers(
    session: Session,
    data: {
      userMessage: string;
      assistantMessage: string;
      toolNames: string[];
      durableNotes: string[];
    }
  ): Promise<void> {
    await this.withSessionWriteLock(session.id, async () => {
      const current = await this.getLatestSessionOrFallback(session);
      const runtime = this.getRuntimeMetadata(current);
      runtime.shortTermSummary = this.buildShortTermSummary(data.userMessage, data.assistantMessage, data.toolNames);
      runtime.shortTermUpdatedAt = new Date().toISOString();

      const existingDurable = Array.isArray(runtime.durableNotes) ? runtime.durableNotes : [];
      const merged = [...data.durableNotes, ...existingDurable]
        .map(n => n.trim())
        .filter(Boolean)
        .filter((note, idx, arr) => arr.indexOf(note) === idx)
        .slice(0, pipeline.durableNotesLimit);
      runtime.durableNotes = merged;
      current.metadata.agentRuntime = runtime;
      await this.store.update(current);
      this.syncSessionReference(session, current);
    });
  }

  /**
   * Initializes underlying store.
   */
  async init(): Promise<void> {
    await this.store.init();
  }

  /**
   * Returns session for user id, creating if missing.
   */
  async getSession(userId: string): Promise<Session> {
    return this.store.getOrCreate(userId);
  }

  /**
   * Alias of `getSession` for handler call sites.
   */
  async getOrCreateSession(userId: string): Promise<Session> {
    return this.getSession(userId);
  }

  /**
   * Returns session by session id.
   */
  async getSessionById(sessionId: string): Promise<Session | undefined> {
    return this.store.getById(sessionId);
  }

  /**
   * Persists a full session object.
   */


  async updateSession(session: Session): Promise<void> {
    await this.withSessionWriteLock(session.id, async () => {
      await this.store.update(session);
    });
  }

  /**
   * Lists sessions with pagination.
   */
  async listSessions(limit: number = 50, offset: number = 0): Promise<Session[]> {
    return this.store.list(limit, offset);
  }

  /**
   * Deletes a session by id.
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.store.delete(sessionId);
  }

  /**
   * Clears one session while preserving stable identity/preference fields.
   */
  async clearSession(sessionId: string): Promise<Session | undefined> {
    return this.store.clear(sessionId);
  }

  // ============================================================================
  // Message Management
  // ============================================================================

  /**
   * Appends user message and triggers background compaction check.
   */
  async addUserMessage(session: Session, content: string): Promise<Message> {
    const message = await this.withSessionWriteLock(session.id, async () => {
      const current = await this.getLatestSessionOrFallback(session);
      const created = createMessage('user', content);
      current.messages.push(created);
      await this.store.update(current);
      this.syncSessionReference(session, current);
      return created;
    });

    // Compact if message count exceeds threshold
    this.withSessionWriteLock(session.id, async () => {
      await this.compactIfNeededInternal(session.id, session);
    }).then(() => {
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
   * Appends assistant message to session history.
   */
  async addAssistantMessage(session: Session, content: string): Promise<Message> {
    return this.withSessionWriteLock(session.id, async () => {
      const current = await this.getLatestSessionOrFallback(session);
      const message = createMessage('assistant', content);
      current.messages.push(message);
      await this.store.update(current);
      this.syncSessionReference(session, current);
      return message;
    });
  }

  /**
   * Appends assistant message containing tool call requests.
   */
  async addAssistantToolCallMessage(
    session: Session,
    content: string | null,
    toolCalls: Array<{ id: string; name: string; arguments: string }>
  ): Promise<Message> {
    return this.withSessionWriteLock(session.id, async () => {
      const current = await this.getLatestSessionOrFallback(session);
      const message = createMessage(
        'assistant',
        content || '',
        undefined,
        toolCalls.map(tc => ({ id: tc.id, name: tc.name, arguments: tc.arguments }))
      );
      current.messages.push(message);
      await this.store.update(current);
      this.syncSessionReference(session, current);
      return message;
    });
  }

  /**
   * Appends tool-role message and optionally binds tool call id for pairing.
   */
  async addToolMessage(
    session: Session,
    toolCall: ToolCall,
    content?: string,
    toolCallId?: string
  ): Promise<Message> {
    return this.withSessionWriteLock(session.id, async () => {
      const current = await this.getLatestSessionOrFallback(session);
      const message = createMessage(
        'tool',
        content || `Tool: ${toolCall.name}`,
        toolCall
      );
      // Override the auto-generated ID with the tool_call_id for proper pairing
      if (toolCallId) {
        message.id = toolCallId;
      }
      current.messages.push(message);
      await this.store.update(current);
      this.syncSessionReference(session, current);
      return message;
    });
  }

  // ============================================================================
  // Compaction (Context Pipeline)
  // ============================================================================

  /**
   * Compacts session history when message count exceeds threshold.
   */
  async compactIfNeeded(session: Session): Promise<void> {
    await this.withSessionWriteLock(session.id, async () => {
      await this.compactIfNeededInternal(session.id, session);
    });
  }

  private async compactIfNeededInternal(sessionId: string, fallbackSession?: Session): Promise<void> {
    const session = await this.getLatestSessionOrFallback(fallbackSession, sessionId);
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

    // Preserve previous summary as a memory entry before overwriting
    const previousSummary = session.metadata?.compactionSummary;
    if (previousSummary) {
      try {
        this.store.addMemory(
          session.id,
          'compaction_summary',
          previousSummary,
          'compaction summary history context',
          2
        );
      } catch (e) {
        logger.warn('Failed to save previous compaction summary as memory', e);
      }
    }

    // LLM-generate compact summary (includes previous summary for continuity)
    const summary = await this.generateCompactionSummary(transcript, session);

    // Replace old messages with summary in metadata
    if (!session.metadata) session.metadata = {};
    session.metadata.compactionSummary = summary;
    session.metadata.compactedAt = new Date().toISOString();
    session.metadata.compactedMessageCount = (session.metadata.compactedMessageCount ?? 0) + oldMessages.length;
    session.messages = recentMessages;

    await this.store.update(session);
    if (fallbackSession) {
      this.syncSessionReference(fallbackSession, session);
    }
    logger.info('Compacted session', {
      sessionId: session.id,
      removed: oldMessages.length,
      remaining: recentMessages.length,
      totalCompacted: session.metadata.compactedMessageCount
    });
  }

  /**
   * Generates LLM summary for compaction transcript.
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
      const prevSummary = session.metadata?.compactionSummary;
      const chainContext = prevSummary
        ? `\n\nPrevious conversation summary (incorporate and build upon this):\n${prevSummary}`
        : '';

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
- User preferences or facts learned

Be specific — mention file names, function names, and concrete details.
Keep it under ${pipeline.compactionMaxTokens} tokens.${chainContext}`
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
   * Stores latest repo map snapshot on session.
   */
  async updateRepoMap(session: Session, repoMap: string): Promise<void> {
    await this.withSessionWriteLock(session.id, async () => {
      const current = await this.getLatestSessionOrFallback(session);
      current.repoMap = repoMap;
      current.repoMapUpdatedAt = new Date().toISOString();
      await this.store.update(current);
      this.syncSessionReference(session, current);
    });
    logger.debug('Updated repo map', { sessionId: session.id });
  }

  /**
   * Returns true when repo map is missing or older than configured TTL.
   */
  isRepoMapStale(session: Session): boolean {
    if (!session.repoMapUpdatedAt) return true;

    const updatedAt = new Date(session.repoMapUpdatedAt).getTime();
    return Date.now() - updatedAt > pipeline.repoMapTtl;
  }

  // ============================================================================
  // Memory Management
  // ============================================================================

  /**
   * Adds a memory entry for a session.
   */
  addMemory(
    sessionId: string,
    category: MemoryCategory,
    content: string,
    keywords: string,
    importance: number = 1
  ): MemoryEntry {
    return this.store.addMemory(sessionId, category, content, keywords, importance);
  }

  /**
   * Recalls top matching memories for a query.
   */
  recallMemories(sessionId: string, query: string, limit?: number): MemoryEntry[] {
    return this.store.recallMemories(sessionId, query, limit ?? pipeline.recallLimit);
  }

  private async withSessionWriteLock<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.sessionWriteQueues.get(sessionId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(work);
    const settled = run.then(() => undefined, () => undefined);
    this.sessionWriteQueues.set(sessionId, settled);

    try {
      return await run;
    } finally {
      if (this.sessionWriteQueues.get(sessionId) === settled) {
        this.sessionWriteQueues.delete(sessionId);
      }
    }
  }

  private async getLatestSessionOrFallback(fallback: Session | undefined, sessionId?: string): Promise<Session> {
    const id = sessionId ?? fallback?.id;
    if (!id) {
      throw new Error('Session id is required');
    }

    const current = await this.store.getById(id);
    if (current) {
      return current;
    }
    if (fallback) {
      return fallback;
    }
    throw new Error(`Session not found: ${id}`);
  }

  private syncSessionReference(target: Session, source: Session): void {
    if (target === source) return;
    Object.assign(target, source);
  }

  private getRuntimeMetadata(session: Session): Record<string, unknown> {
    if (!session.metadata) session.metadata = {};
    const runtime = session.metadata.agentRuntime;
    if (!runtime || typeof runtime !== 'object') {
      session.metadata.agentRuntime = {};
    }
    return session.metadata.agentRuntime as Record<string, unknown>;
  }

  private applyActiveRunToSession(session: Session, run: AgentRunState): void {
    const runtime = this.getRuntimeMetadata(session);
    runtime.activeRun = run;
    session.metadata.agentRuntime = runtime;
  }

  private buildShortTermSummary(
    userMessage: string,
    assistantMessage: string,
    toolNames: string[]
  ): string {
    const user = userMessage.trim().replace(/\s+/g, ' ').slice(0, 140);
    const assistant = assistantMessage.trim().replace(/\s+/g, ' ').slice(0, 180);
    const tools = toolNames.length > 0 ? `Tools: ${toolNames.join(', ')}` : 'Tools: none';
    return `User asked: "${user}" | Assistant: "${assistant}" | ${tools}`;
  }

}


// Singleton instance
let managerInstance: SessionManager | null = null;
let initPromise: Promise<SessionManager> | null = null;

/**
 * Returns process-wide session manager singleton, initialized on first access.
 */
export async function getSessionManager(): Promise<SessionManager> {
  if (managerInstance) return managerInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const instance = new SessionManager();
    await instance.init();
    managerInstance = instance;
    return instance;
  })().catch((error) => {
    initPromise = null;
    throw error;
  });

  return initPromise;
}
