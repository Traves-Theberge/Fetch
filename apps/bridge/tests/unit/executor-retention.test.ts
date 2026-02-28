import { describe, expect, it } from 'vitest';
import { HarnessExecutor } from '../../src/harness/executor.js';

describe('HarnessExecutor retention', () => {
  it('prunes terminal executions older than TTL', () => {
    const executor = new HarnessExecutor() as unknown as {
      executions: Map<string, { status: string; startedAt: string; completedAt?: string }>;
      pruneTerminalExecutions: () => void;
    };

    const old = new Date(Date.now() - (20 * 60 * 1000)).toISOString();
    const fresh = new Date().toISOString();

    executor.executions.set('hrn_old', {
      status: 'completed',
      startedAt: old,
      completedAt: old,
    });
    executor.executions.set('hrn_new', {
      status: 'failed',
      startedAt: fresh,
      completedAt: fresh,
    });

    executor.pruneTerminalExecutions();
    expect(executor.executions.has('hrn_old')).toBe(false);
    expect(executor.executions.has('hrn_new')).toBe(true);
  });

  it('caps terminal execution retention and preserves active executions', () => {
    const executor = new HarnessExecutor() as unknown as {
      executions: Map<string, { status: string; startedAt: string; completedAt?: string }>;
      pruneTerminalExecutions: () => void;
    };

    const base = Date.now();
    for (let i = 0; i < 205; i++) {
      const stamp = new Date(base + i).toISOString();
      executor.executions.set(`hrn_${i}`, {
        status: 'completed',
        startedAt: stamp,
        completedAt: stamp,
      });
    }
    executor.executions.set('hrn_running', {
      status: 'running',
      startedAt: new Date(base + 9999).toISOString(),
    });

    executor.pruneTerminalExecutions();

    const terminalCount = Array.from(executor.executions.values())
      .filter((execution) => ['completed', 'failed', 'killed'].includes(execution.status)).length;
    expect(terminalCount).toBe(200);
    expect(executor.executions.has('hrn_running')).toBe(true);
  });
});
