/**
 * @fileoverview Harness Adapter Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from '../../src/harness/claude.js';
import { GeminiAdapter } from '../../src/harness/gemini.js';
import { CopilotAdapter } from '../../src/harness/copilot.js';

describe('Claude Adapter', () => {
  const adapter = new ClaudeAdapter();

  describe('buildConfig', () => {
    it('should build correct config', () => {
      const config = adapter.buildConfig(
        'Add dark mode',
        '/workspace/project',
        300000
      );

      expect(config.command).toBe('claude');
      expect(config.args).toContain('--print');
      expect(config.args).toContain('-p');
      expect(config.args).toContain('Add dark mode');
      expect(config.cwd).toBe('/workspace/project');
      expect(config.timeoutMs).toBe(300000);
    });

    it('should set non-interactive environment', () => {
      const config = adapter.buildConfig('test', '/workspace', 60000);

      expect(config.env.CI).toBe('true');
      expect(config.env.TERM).toBe('dumb');
    });
  });

  describe('parseOutputLine', () => {
    it('should detect questions', () => {
      expect(adapter.parseOutputLine('? Do you want to continue?')).toBe('question');
    });

    it('should detect file edits', () => {
      expect(adapter.parseOutputLine('Edited src/app.ts')).toBe('progress');
      expect(adapter.parseOutputLine('Created src/new.ts')).toBe('progress');
    });

    it('should detect completion', () => {
      expect(adapter.parseOutputLine('Done.')).toBe('complete');
      expect(adapter.parseOutputLine('Completed')).toBe('complete');
    });

    it('should return null for regular output', () => {
      expect(adapter.parseOutputLine('Working on files...')).toBeNull();
    });
  });

  describe('detectQuestion', () => {
    it('should detect direct questions', () => {
      const question = adapter.detectQuestion('Should I update the tests?');
      expect(question).toBe('Should I update the tests?');
    });

    it('should detect yes/no prompts', () => {
      const question = adapter.detectQuestion('Continue? [y/n]');
      expect(question).toBe('Continue? [y/n]');
    });

    it('should return null for non-questions', () => {
      const question = adapter.detectQuestion('Processing files');
      expect(question).toBeNull();
    });
  });

  describe('extractFileOperations', () => {
    it('should extract created files', () => {
      const output = 'Created src/new.ts\nCreated src/types.ts';
      const ops = adapter.extractFileOperations(output);
      
      expect(ops.created).toEqual(['src/new.ts', 'src/types.ts']);
    });

    it('should extract modified files', () => {
      const output = 'Edited src/app.ts\nModified src/config.ts';
      const ops = adapter.extractFileOperations(output);
      
      expect(ops.modified).toContain('src/app.ts');
      expect(ops.modified).toContain('src/config.ts');
    });

    it('should extract deleted files', () => {
      const output = 'Deleted src/old.ts';
      const ops = adapter.extractFileOperations(output);
      
      expect(ops.deleted).toEqual(['src/old.ts']);
    });
  });
});

describe('Gemini Adapter', () => {
  const adapter = new GeminiAdapter();

  describe('buildConfig', () => {
    it('should build correct config', () => {
      const config = adapter.buildConfig(
        'Fix bug',
        '/workspace/project',
        300000
      );

      expect(config.command).toBe('gemini');
      expect(config.args).toContain('-p');
      expect(config.args).toContain('Fix bug');
      expect(config.cwd).toBe('/workspace/project');
    });

    it('should include sandbox flag', () => {
      const config = adapter.buildConfig('test', '/workspace', 60000);
      expect(config.args).toContain('--sandbox=none');
    });
  });

  describe('parseOutputLine', () => {
    it('should detect questions', () => {
      expect(adapter.parseOutputLine('> Continue with changes?')).toBe('question');
    });

    it('should detect file operations', () => {
      expect(adapter.parseOutputLine('[Created] src/new.ts')).toBe('progress');
      expect(adapter.parseOutputLine('[Modified] src/app.ts')).toBe('progress');
    });

    it('should detect completion', () => {
      expect(adapter.parseOutputLine('Done')).toBe('complete');
    });
  });
});

describe('Copilot Adapter', () => {
  const adapter = new CopilotAdapter();

  describe('buildConfig', () => {
    it('should build correct config with gh copilot', () => {
      const config = adapter.buildConfig(
        'Explain this code',
        '/workspace/project',
        300000
      );

      expect(config.command).toBe('gh');
      expect(config.args).toContain('copilot');
      expect(config.args).toContain('suggest');
      expect(config.cwd).toBe('/workspace/project');
    });
  });

  describe('parseOutputLine', () => {
    it('should detect suggestions', () => {
      expect(adapter.parseOutputLine('Suggestion: Use async/await')).toBe('progress');
    });

    it('should detect commands', () => {
      expect(adapter.parseOutputLine('$ npm install lodash')).toBe('progress');
    });

    it('should detect completion', () => {
      expect(adapter.parseOutputLine('Suggestion complete')).toBe('complete');
    });
  });
});
