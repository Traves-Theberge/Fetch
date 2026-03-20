import { describe, it, expect } from 'vitest';
import { buildTaskFramePrompt } from '../../src/agent/prompts.js';
import type { Session } from '../../src/session/types.js';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    userId: 'user-1',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentProject: undefined,
    availableProjects: [],
    ...overrides,
  } as Session;
}

describe('buildTaskFramePrompt', () => {
  it('includes workspace and branch from session', () => {
    const session = makeSession({
      currentProject: {
        name: 'my-repo',
        path: '/code/my-repo',
        gitBranch: 'feat-x',
        type: 'node',
      } as Session['currentProject'],
    });

    const prompt = buildTaskFramePrompt(session, 'add tests');

    expect(prompt).toContain('Workspace: my-repo');
    expect(prompt).toContain('Branch: feat-x');
    expect(prompt).toContain('"add tests"');
  });

  it('defaults workspace to unknown and branch to main', () => {
    const session = makeSession();

    const prompt = buildTaskFramePrompt(session, 'fix bug');

    expect(prompt).toContain('Workspace: unknown');
    expect(prompt).toContain('Branch: main');
  });

  it('includes PM task when present', () => {
    const session = makeSession({
      metadata: {
        activePMTask: {
          id: 'PROJ-42',
          title: 'Implement feature',
          url: 'https://pm.example.com/PROJ-42',
          provider: 'linear',
        },
      },
    } as Partial<Session>);

    const prompt = buildTaskFramePrompt(session, 'work on ticket');

    expect(prompt).toContain('PM Task: Implement feature [PROJ-42]');
    expect(prompt).toContain('https://pm.example.com/PROJ-42');
  });

  it('omits PM task line when no active PM task', () => {
    const session = makeSession();

    const prompt = buildTaskFramePrompt(session, 'refactor');

    expect(prompt).not.toContain('PM Task');
  });

  it('contains goal requirements and examples', () => {
    const session = makeSession();

    const prompt = buildTaskFramePrompt(session, 'anything');

    expect(prompt).toContain('Self-contained');
    expect(prompt).toContain('Specific');
    expect(prompt).toContain('Bounded');
    expect(prompt).toContain('Testable');
    expect(prompt).toContain('Now write the goal:');
  });
});
