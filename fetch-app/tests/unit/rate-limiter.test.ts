import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockStore = {
  getRateLimits: vi.fn().mockReturnValue([]),
  insertRateLimit: vi.fn(),
  clearRateLimits: vi.fn(),
  clearAllRateLimits: vi.fn(),
  pruneStaleRateLimits: vi.fn(),
};

vi.mock('../../src/session/store.js', () => ({
  getSessionStore: () => mockStore,
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('RateLimiter', () => {
  let RateLimiter: typeof import('../../src/security/rateLimiter.js').RateLimiter;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStore.getRateLimits.mockReturnValue([]);
    const module = await import('../../src/security/rateLimiter.js');
    RateLimiter = module.RateLimiter;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows requests under the limit', () => {
    const limiter = new RateLimiter(5, 60000);
    mockStore.getRateLimits.mockReturnValue([1, 2, 3]);
    expect(limiter.isAllowed('user1')).toBe(true);
    expect(mockStore.insertRateLimit).toHaveBeenCalled();
    limiter.shutdown();
  });

  it('blocks requests at the limit', () => {
    const limiter = new RateLimiter(3, 60000);
    mockStore.getRateLimits.mockReturnValue([1, 2, 3]);
    expect(limiter.isAllowed('user1')).toBe(false);
    expect(mockStore.insertRateLimit).not.toHaveBeenCalled();
    limiter.shutdown();
  });

  it('getRemaining returns correct remaining quota', () => {
    const limiter = new RateLimiter(10, 60000);
    mockStore.getRateLimits.mockReturnValue([1, 2, 3]);
    expect(limiter.getRemaining('user1')).toBe(7);
    limiter.shutdown();
  });

  it('getRemaining returns 0 when at limit', () => {
    const limiter = new RateLimiter(3, 60000);
    mockStore.getRateLimits.mockReturnValue([1, 2, 3, 4]);
    expect(limiter.getRemaining('user1')).toBe(0);
    limiter.shutdown();
  });

  it('clear delegates to store', () => {
    const limiter = new RateLimiter();
    limiter.clear('user1');
    expect(mockStore.clearRateLimits).toHaveBeenCalledWith('user1');
    limiter.shutdown();
  });

  it('clearAll delegates to store', () => {
    const limiter = new RateLimiter();
    limiter.clearAll();
    expect(mockStore.clearAllRateLimits).toHaveBeenCalled();
    limiter.shutdown();
  });

  it('shutdown clears timer and state', () => {
    const limiter = new RateLimiter();
    limiter.shutdown();
    expect(mockStore.clearAllRateLimits).toHaveBeenCalled();
    // Second shutdown is safe (no-op)
    limiter.shutdown();
  });
});
