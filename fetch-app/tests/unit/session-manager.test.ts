/**
 * @fileoverview Session Manager Unit Tests
 *
 * Tests for SessionManager: session lifecycle, message management,
 * repo-map staleness, and background compaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock: logger (silence output) ────────────────────────────────────────────
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Mock: session store ──────────────────────────────────────────────────────
const sessions = new Map();

vi.mock('../../src/session/store.js', () => {
  return {
    getSessionStore: vi.fn(() => ({
      init: vi.fn(),
      getOrCreate: vi.fn((userId: string) => {
        if (sessions.has(userId)) return sessions.get(userId);
        // Create a fresh session matching the shape from types.ts
        const session = {
          id: `sess_${userId}`,
          userId,
          metadata: {},
          messages: [],
          currentProject: null,
          availableProjects: [],
          activeFiles: [],
          repoMap: null,
          repoMapUpdatedAt: null,
          preferences: {
            autonomyLevel: 'cautious',
            autoCommit: true,
            verboseMode: false,
            maxIterations: 25,
          },
          activeTaskId: null,
          gitStartCommit: null,
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
        };
        sessions.set(userId, session);
        return session;
      }),
      getById: vi.fn((id: string) => {
        for (const s of sessions.values()) {
          if (s.id === id) return s;
        }
        return undefined;
      }),
      update: vi.fn((session: { userId: string }) => {
        sessions.set(session.userId, session);
      }),
    })),
  };
});

// ── Mock: pipeline config ────────────────────────────────────────────────────
vi.mock('../../src/config/pipeline.js', () => ({
  pipeline: {
    compactionThreshold: 5,
    historyWindow: 3,
    compactionModel: 'test-model',
    compactionMaxTokens: 500,
    repoMapTtl: 10 * 60 * 1000, // 10 minutes in ms
  },
}));

// ── Mock: OpenAI (for compaction summary generation) ─────────────────────────
vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Compacted summary' } }],
        }),
      },
    };
  },
}));

// ── Mock: env config (needed by generateCompactionSummary) ───────────────────
vi.mock('../../src/config/env.js', () => ({
  env: {
    OPENROUTER_API_KEY: 'test-key',
    SUMMARY_MODEL: 'test-model',
  },
}));

// ── Import after mocks ──────────────────────────────────────────────────────
const { SessionManager } = await import('../../src/session/manager.js');

// =============================================================================
// TESTS
// =============================================================================

describe('SessionManager', () => {
  let manager: InstanceType<typeof SessionManager>;

  beforeEach(async () => {
    sessions.clear();
    vi.clearAllMocks();
    manager = new SessionManager();
    await manager.init();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Session Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  describe('session lifecycle', () => {
    it('should create a new session for a new user', async () => {
      const session = await manager.getOrCreateSession('user_new');

      expect(session).toBeDefined();
      expect(session.userId).toBe('user_new');
      expect(session.id).toBe('sess_user_new');
      expect(session.messages).toEqual([]);
      expect(session.repoMap).toBeNull();
      expect(session.repoMapUpdatedAt).toBeNull();
    });

    it('should return the same session for an existing user', async () => {
      const first = await manager.getOrCreateSession('user_repeat');
      const second = await manager.getOrCreateSession('user_repeat');

      expect(first.id).toBe(second.id);
      expect(first.userId).toBe(second.userId);
    });

    it('should create distinct sessions for different users', async () => {
      const alice = await manager.getOrCreateSession('alice');
      const bob = await manager.getOrCreateSession('bob');

      expect(alice.id).not.toBe(bob.id);
      expect(alice.userId).toBe('alice');
      expect(bob.userId).toBe('bob');
    });

    it('should retrieve a session by session ID', async () => {
      const created = await manager.getOrCreateSession('user_byid');
      const found = await manager.getSessionById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('should return undefined for an unknown session ID', async () => {
      const result = await manager.getSessionById('nonexistent_id');
      expect(result).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Message Management
  // ──────────────────────────────────────────────────────────────────────────

  describe('addUserMessage', () => {
    it('should append a user message with correct role and content', async () => {
      const session = await manager.getOrCreateSession('user_msg');
      const message = await manager.addUserMessage(session, 'Hello there');

      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello there');
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]).toBe(message);
    });

    it('should include a valid ISO timestamp on user messages', async () => {
      const before = new Date().toISOString();
      const session = await manager.getOrCreateSession('user_ts');
      const message = await manager.addUserMessage(session, 'Timestamped');
      const after = new Date().toISOString();

      expect(message.timestamp).toBeDefined();
      expect(message.timestamp >= before).toBe(true);
      expect(message.timestamp <= after).toBe(true);
    });

    it('should assign a unique ID to each user message', async () => {
      const session = await manager.getOrCreateSession('user_ids');
      const msg1 = await manager.addUserMessage(session, 'First');
      const msg2 = await manager.addUserMessage(session, 'Second');

      expect(msg1.id).toBeDefined();
      expect(msg2.id).toBeDefined();
      expect(msg1.id).not.toBe(msg2.id);
    });
  });

  describe('addAssistantMessage', () => {
    it('should append an assistant message with correct role and content', async () => {
      const session = await manager.getOrCreateSession('asst_msg');
      const message = await manager.addAssistantMessage(session, 'I can help');

      expect(message.role).toBe('assistant');
      expect(message.content).toBe('I can help');
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]).toBe(message);
    });

    it('should include a valid timestamp on assistant messages', async () => {
      const session = await manager.getOrCreateSession('asst_ts');
      const message = await manager.addAssistantMessage(session, 'Reply');

      const parsed = new Date(message.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
    });
  });

  describe('message ordering', () => {
    it('should preserve insertion order across mixed message types', async () => {
      const session = await manager.getOrCreateSession('order_test');
      await manager.addUserMessage(session, 'User message 1');
      await manager.addAssistantMessage(session, 'Assistant response 1');
      await manager.addUserMessage(session, 'User message 2');
      await manager.addAssistantMessage(session, 'Assistant response 2');

      expect(session.messages).toHaveLength(4);
      expect(session.messages[0].role).toBe('user');
      expect(session.messages[0].content).toBe('User message 1');
      expect(session.messages[1].role).toBe('assistant');
      expect(session.messages[1].content).toBe('Assistant response 1');
      expect(session.messages[2].role).toBe('user');
      expect(session.messages[2].content).toBe('User message 2');
      expect(session.messages[3].role).toBe('assistant');
      expect(session.messages[3].content).toBe('Assistant response 2');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Session Update / Persistence
  // ──────────────────────────────────────────────────────────────────────────

  describe('updateSession', () => {
    it('should persist session changes via the store', async () => {
      const session = await manager.getOrCreateSession('user_update');
      session.repoMap = 'new repo map content';

      await manager.updateSession(session);

      // Verify the store received the updated session
      const stored = sessions.get('user_update');
      expect(stored).toBeDefined();
      expect(stored.repoMap).toBe('new repo map content');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Repo Map
  // ──────────────────────────────────────────────────────────────────────────

  describe('isRepoMapStale', () => {
    it('should report stale when repoMapUpdatedAt is null', async () => {
      const session = await manager.getOrCreateSession('stale_null');
      expect(session.repoMapUpdatedAt).toBeNull();
      expect(manager.isRepoMapStale(session)).toBe(true);
    });

    it('should report fresh when recently updated', async () => {
      const session = await manager.getOrCreateSession('stale_fresh');
      session.repoMapUpdatedAt = new Date().toISOString();

      expect(manager.isRepoMapStale(session)).toBe(false);
    });

    it('should report stale when older than the TTL', async () => {
      const session = await manager.getOrCreateSession('stale_old');
      // Set timestamp to 15 minutes ago (TTL is 10 minutes)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      session.repoMapUpdatedAt = fifteenMinutesAgo;

      expect(manager.isRepoMapStale(session)).toBe(true);
    });

    it('should report fresh when just inside the TTL window', async () => {
      const session = await manager.getOrCreateSession('stale_edge');
      // Set timestamp to 9 minutes ago (TTL is 10 minutes)
      const nineMinutesAgo = new Date(Date.now() - 9 * 60 * 1000).toISOString();
      session.repoMapUpdatedAt = nineMinutesAgo;

      expect(manager.isRepoMapStale(session)).toBe(false);
    });
  });

  describe('updateRepoMap', () => {
    it('should set the repo map and update the timestamp', async () => {
      const session = await manager.getOrCreateSession('repo_update');
      const before = new Date().toISOString();

      await manager.updateRepoMap(session, 'src/\n  index.ts\n  utils/');

      expect(session.repoMap).toBe('src/\n  index.ts\n  utils/');
      expect(session.repoMapUpdatedAt).toBeDefined();
      expect(session.repoMapUpdatedAt! >= before).toBe(true);
    });

    it('should make a previously stale session fresh', async () => {
      const session = await manager.getOrCreateSession('repo_refresh');
      expect(manager.isRepoMapStale(session)).toBe(true);

      await manager.updateRepoMap(session, 'updated map');

      expect(manager.isRepoMapStale(session)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Compaction
  // ──────────────────────────────────────────────────────────────────────────

  describe('compaction', () => {
    it('should not compact when message count is at or below the threshold', async () => {
      const session = await manager.getOrCreateSession('compact_below');
      // Add exactly compactionThreshold (5) messages
      for (let i = 0; i < 5; i++) {
        session.messages.push({
          id: `msg_${i}`,
          role: 'user',
          content: `Message ${i}`,
          timestamp: new Date().toISOString(),
        });
      }

      await manager.compactIfNeeded(session);

      // Messages should remain unchanged (5 <= threshold of 5)
      expect(session.messages).toHaveLength(5);
      expect(session.metadata.compactionSummary).toBeUndefined();
    });

    it('should compact when messages exceed the threshold', async () => {
      const session = await manager.getOrCreateSession('compact_above');
      // Add 7 messages (exceeds threshold of 5)
      for (let i = 0; i < 7; i++) {
        session.messages.push({
          id: `msg_${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
          timestamp: new Date().toISOString(),
        });
      }

      await manager.compactIfNeeded(session);

      // Should keep only the last historyWindow (3) messages
      expect(session.messages).toHaveLength(3);
      expect(session.messages[0].content).toBe('Message 4');
      expect(session.messages[1].content).toBe('Message 5');
      expect(session.messages[2].content).toBe('Message 6');

      // Summary should be stored in metadata
      expect(session.metadata.compactionSummary).toBe('Compacted summary');
      expect(session.metadata.compactedAt).toBeDefined();
      expect(session.metadata.compactedMessageCount).toBe(4);
    });

    it('should compact from latest persisted session state when given a stale object', async () => {
      const session = await manager.getOrCreateSession('compact_stale');
      for (let i = 0; i < 6; i++) {
        session.messages.push({
          id: `seed_${i}`,
          role: 'user',
          content: `Seed ${i}`,
          timestamp: new Date().toISOString(),
        });
      }
      await manager.updateSession(session);

      const staleSnapshot = {
        ...session,
        messages: session.messages.slice(),
      };

      session.messages.push({
        id: 'newest',
        role: 'assistant',
        content: 'Newest message',
        timestamp: new Date().toISOString(),
      });
      await manager.updateSession(session);

      await manager.compactIfNeeded(staleSnapshot);

      const refreshed = await manager.getSessionById(session.id);
      expect(refreshed).toBeDefined();
      expect(refreshed!.messages).toHaveLength(3);
      expect(refreshed!.messages.some((m) => m.content === 'Newest message')).toBe(true);
    });
  });
});
