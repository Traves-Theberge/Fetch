import { describe, expect, it, vi } from 'vitest';
import { OutputParser, extractSummary, createParser } from '../../src/harness/output-parser.js';

describe('OutputParser', () => {
  it('collects complete lines from streamed data', () => {
    const parser = new OutputParser();
    parser.write('line1\nline2\nline3\n');
    expect(parser.getLines()).toEqual(['line1', 'line2', 'line3']);
  });

  it('buffers incomplete lines until newline arrives', () => {
    const parser = new OutputParser();
    parser.write('partial');
    expect(parser.getLines()).toEqual([]);
    parser.write(' complete\n');
    expect(parser.getLines()).toEqual(['partial complete']);
  });

  it('emits line events for each complete line', () => {
    const parser = new OutputParser();
    const lines: string[] = [];
    parser.on('line', (line: string) => lines.push(line));
    parser.write('a\nb\n');
    expect(lines).toEqual(['a', 'b']);
  });

  it('detects question patterns with ? suffix', () => {
    const parser = new OutputParser();
    const handler = vi.fn();
    parser.on('question', handler);
    parser.write('Do you want to continue?\n');
    expect(handler).toHaveBeenCalledWith({ question: 'Do you want to continue?' });
  });

  it('detects [Y/n] question patterns', () => {
    const parser = new OutputParser();
    const handler = vi.fn();
    parser.on('question', handler);
    parser.write('Overwrite file? [Y/n]\n');
    expect(handler).toHaveBeenCalled();
  });

  it('detects progress bar patterns', () => {
    const parser = new OutputParser();
    const handler = vi.fn();
    parser.on('progress', handler);
    parser.write('[=====>   ] 50%\n');
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].percent).toBe(50);
  });

  it('detects spinner progress patterns', () => {
    const parser = new OutputParser();
    const handler = vi.fn();
    parser.on('progress', handler);
    parser.write('⠋ Installing dependencies\n');
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Installing dependencies',
    }));
  });

  it('detects file create operations', () => {
    const parser = new OutputParser();
    const handler = vi.fn();
    parser.on('file_op', handler);
    parser.write('Created src/index.ts\n');
    expect(handler).toHaveBeenCalledWith({ operation: 'create', path: 'src/index.ts' });
  });

  it('detects file modify operations', () => {
    const parser = new OutputParser();
    const handler = vi.fn();
    parser.on('file_op', handler);
    parser.write('Edited package.json\n');
    expect(handler).toHaveBeenCalledWith({ operation: 'modify', path: 'package.json' });
  });

  it('detects file delete operations', () => {
    const parser = new OutputParser();
    const handler = vi.fn();
    parser.on('file_op', handler);
    parser.write('Deleted old-file.ts\n');
    expect(handler).toHaveBeenCalledWith({ operation: 'delete', path: 'old-file.ts' });
  });

  it('accumulates file operations', () => {
    const parser = new OutputParser();
    parser.write('Created a.ts\nModified b.ts\nRemoved c.ts\n');
    const ops = parser.getFileOperations();
    expect(ops).toHaveLength(3);
    expect(ops[0].operation).toBe('create');
    expect(ops[2].operation).toBe('delete');
  });

  it('detects error patterns', () => {
    const parser = new OutputParser();
    const handler = vi.fn();
    parser.on('error', handler);
    parser.write('Error: something went wrong\n');
    expect(handler).toHaveBeenCalledWith({ message: 'Error: something went wrong' });
  });

  it('detects completion patterns', () => {
    const parser = new OutputParser();
    parser.write('Done.\n');
    expect(parser.isCompleted()).toBe(true);
  });

  it('emits complete event', () => {
    const parser = new OutputParser();
    const handler = vi.fn();
    parser.on('complete', handler);
    parser.write('Successfully deployed\n');
    expect(handler).toHaveBeenCalled();
  });

  it('flush processes trailing buffer content', () => {
    const parser = new OutputParser();
    parser.write('no newline');
    expect(parser.getLines()).toEqual([]);
    parser.flush();
    expect(parser.getLines()).toEqual(['no newline']);
  });

  it('reset clears all state', () => {
    const parser = new OutputParser();
    parser.write('Created file.ts\nDone.\n');
    expect(parser.getLines().length).toBeGreaterThan(0);
    parser.reset();
    expect(parser.getLines()).toEqual([]);
    expect(parser.getFileOperations()).toEqual([]);
    expect(parser.isCompleted()).toBe(false);
  });

  it('getOutput joins lines with newlines', () => {
    const parser = new OutputParser();
    parser.write('a\nb\nc\n');
    expect(parser.getOutput()).toBe('a\nb\nc');
  });

  it('findQuestion returns the most recent question', () => {
    const parser = new OutputParser();
    parser.write('First question?\nSome output\nSecond question?\n');
    expect(parser.findQuestion()).toBe('Second question?');
  });

  it('findQuestion returns null when no questions exist', () => {
    const parser = new OutputParser();
    parser.write('Just some output\n');
    expect(parser.findQuestion()).toBeNull();
  });

  it('forces line break when buffer exceeds maxLineLength', () => {
    const parser = new OutputParser({ maxLineLength: 20 });
    parser.write('a'.repeat(25));
    expect(parser.getLines()).toHaveLength(1);
    expect(parser.getLines()[0]).toHaveLength(25);
  });

  it('handles Buffer input', () => {
    const parser = new OutputParser();
    parser.write(Buffer.from('buffer line\n'));
    expect(parser.getLines()).toEqual(['buffer line']);
  });

  it('handles carriage return line endings', () => {
    const parser = new OutputParser();
    parser.write('line1\r\nline2\r\n');
    expect(parser.getLines()).toEqual(['line1', 'line2']);
  });
});

describe('extractSummary', () => {
  it('extracts text after ## Summary heading', () => {
    const parser = new OutputParser();
    parser.write('## Summary\nThis is the summary.\nMore details.\n# Next Section\n');
    const summary = extractSummary(parser);
    expect(summary).toContain('This is the summary.');
    expect(summary).toContain('More details.');
  });

  it('falls back to last paragraph when no summary heading', () => {
    const parser = new OutputParser();
    parser.write('Some short line\n\nThis is a longer paragraph that serves as the final meaningful content of the output.\n');
    const summary = extractSummary(parser);
    expect(summary).toContain('longer paragraph');
  });

  it('returns default when output is empty', () => {
    const parser = new OutputParser();
    expect(extractSummary(parser)).toBe('Task completed.');
  });
});

describe('createParser', () => {
  it('returns a configured OutputParser instance', () => {
    const parser = createParser();
    expect(parser).toBeInstanceOf(OutputParser);
  });
});
