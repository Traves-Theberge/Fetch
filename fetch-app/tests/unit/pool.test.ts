import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

let latestChild: (EventEmitter & {
  pid: number;
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { writable: boolean; write: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
}) | null = null;

vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { writable: boolean; write: ReturnType<typeof vi.fn> };
      kill: ReturnType<typeof vi.fn>;
    };
    child.pid = Math.floor(Math.random() * 10000) + 1000;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { writable: true, write: vi.fn() };
    child.kill = vi.fn(() => true);
    latestChild = child;
    return child;
  }),
}));

import { HarnessPool } from '../../src/harness/pool.js';

describe('HarnessPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestChild = null;
    // Reset the singleton between tests
    (HarnessPool as unknown as { instance: undefined }).instance = undefined;
  });

  it('returns stats with zero running and queued initially', () => {
    const pool = HarnessPool.getInstance();
    const stats = pool.getStats();

    expect(stats.running).toBe(0);
    expect(stats.queued).toBe(0);
    expect(stats.maxConcurrent).toBe(1);

    pool.shutdown();
  });

  it('getInstance returns the same instance', () => {
    const pool1 = HarnessPool.getInstance();
    const pool2 = HarnessPool.getInstance();

    expect(pool1).toBe(pool2);

    pool1.shutdown();
  });

  it('setMaxConcurrent updates the max', () => {
    const pool = HarnessPool.getInstance();

    pool.setMaxConcurrent(4);
    const stats = pool.getStats();

    expect(stats.maxConcurrent).toBe(4);

    pool.shutdown();
  });

  it('shutdown clears the queue and removes listeners', () => {
    const pool = HarnessPool.getInstance();

    // Verify pool is functional before shutdown
    expect(pool.getStats().running).toBe(0);

    pool.shutdown();

    // After shutdown, listeners are removed
    expect(pool.listenerCount('status')).toBe(0);
    expect(pool.listenerCount('output')).toBe(0);
  });

  it('acquire spawns immediately when pool has capacity', async () => {
    const pool = HarnessPool.getInstance();

    const promise = pool.acquire({
      command: 'test-harness',
      args: ['--flag'],
      env: { FOO: 'bar' },
      cwd: '/tmp/workspace',
    });

    expect(latestChild).not.toBeNull();

    // Complete the process so promise resolves
    if (latestChild) {
      latestChild.stdout.emit('data', Buffer.from('output'));
      latestChild.emit('close', 0);
    }

    const instance = await promise;
    expect(instance).toBeDefined();
    expect(instance.id).toBeDefined();

    pool.shutdown();
  });
});
