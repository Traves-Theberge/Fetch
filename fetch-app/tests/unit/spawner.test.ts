import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    child.pid = 1234;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { writable: true, write: vi.fn() };
    child.kill = vi.fn(() => true);
    latestChild = child;
    return child;
  }),
}));

import { HarnessSpawner } from '../../src/harness/spawner.js';

describe('HarnessSpawner lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestChild = null;
  });

  it('preserves killed terminal status when close exits non-zero', async () => {
    const spawner = new HarnessSpawner();
    const statuses: string[] = [];

    spawner.on('status', (event) => {
      statuses.push(event.status);
    });

    const instance = await spawner.spawn({
      command: 'mock',
      args: [],
      env: {},
      cwd: '/tmp',
      timeoutMs: 1000,
    });

    const killed = spawner.kill(instance.id);
    expect(killed).toBe(true);
    latestChild!.emit('close', 1);

    expect(statuses).toContain('killed');
    expect(statuses[statuses.length - 1]).toBe('killed');
  });

  it('prunes old terminal instances by TTL', () => {
    const spawner = new HarnessSpawner() as unknown as {
      instances: Map<string, { status: string; startTime: number; endedAt?: number }>;
      pruneTerminalInstances: () => void;
    };

    const now = Date.now();
    spawner.instances.set('hrn_old', {
      status: 'completed',
      startTime: now - (20 * 60 * 1000),
      endedAt: now - (20 * 60 * 1000),
    });
    spawner.instances.set('hrn_new', {
      status: 'completed',
      startTime: now,
      endedAt: now,
    });

    spawner.pruneTerminalInstances();
    expect(spawner.instances.has('hrn_old')).toBe(false);
    expect(spawner.instances.has('hrn_new')).toBe(true);
  });

  it('caps retained terminal instances by count', () => {
    const spawner = new HarnessSpawner() as unknown as {
      instances: Map<string, { status: string; startTime: number; endedAt?: number }>;
      pruneTerminalInstances: () => void;
    };

    const base = Date.now();
    for (let i = 0; i < 205; i++) {
      spawner.instances.set(`hrn_${i}`, {
        status: 'completed',
        startTime: base + i,
        endedAt: base + i,
      });
    }
    spawner.instances.set('hrn_running', {
      status: 'running',
      startTime: base + 9999,
    });

    spawner.pruneTerminalInstances();

    const terminalCount = Array.from(spawner.instances.values())
      .filter((instance) => ['completed', 'failed', 'killed'].includes(instance.status)).length;
    expect(terminalCount).toBe(200);
    expect(spawner.instances.has('hrn_running')).toBe(true);
  });
});
