import { afterEach, describe, expect, it } from 'vitest';
import {
  createMessage,
  createSession,
  resetIdGenerator,
  setIdGenerator,
} from '../../src/session/types.js';

describe('session ID generator injection', () => {
  afterEach(() => {
    resetIdGenerator();
  });

  it('uses injected generator for session and message IDs', () => {
    setIdGenerator(() => 'fixed-id');

    const session = createSession('user-1');
    const message = createMessage('user', 'hello');

    expect(session.id).toBe('fixed-id');
    expect(message.id).toBe('fixed-id');
  });
});
