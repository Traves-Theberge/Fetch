import { describe, it, expect } from 'vitest';
import { generateTaskId, generateProgressId } from '../../src/utils/id.js';

describe('generateTaskId', () => {
  it('returns a string with tsk_ prefix', () => {
    const id = generateTaskId();
    expect(id).toMatch(/^tsk_[A-Za-z0-9_-]{10}$/);
  });

  it('returns unique ids on successive calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateTaskId()));
    expect(ids.size).toBe(50);
  });
});

describe('generateProgressId', () => {
  it('returns a string with prg_ prefix', () => {
    const id = generateProgressId();
    expect(id).toMatch(/^prg_[A-Za-z0-9_-]{8}$/);
  });

  it('returns unique ids on successive calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateProgressId()));
    expect(ids.size).toBe(50);
  });
});
