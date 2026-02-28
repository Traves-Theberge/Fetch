import { describe, it, expect } from 'vitest';
import { extractSymbols } from '../../src/workspace/symbols.js';

describe('extractSymbols', () => {
  it('deduplicates repeated symbol matches by name and type', () => {
    const content = [
      'export const foo = 1;',
      'export const foo = 2;',
      'export function bar() {}',
      'export function bar() {}',
    ].join('\n');

    const symbols = extractSymbols(content, 'sample.ts');

    expect(symbols).toEqual([
      { name: 'bar', type: 'function' },
      { name: 'foo', type: 'const' },
    ]);
  });
});
