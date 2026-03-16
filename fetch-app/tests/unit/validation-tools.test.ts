import { describe, expect, it } from 'vitest';
import {
  AgentSelectionSchema,
  ProjectTemplateSchema,
  WorkspaceCreateInputSchema,
  WorkspaceDeleteInputSchema,
  TaskCreateInputSchema,
  AskUserInputSchema,
  WebFetchInputSchema,
  WebSearchInputSchema,
  BrowserActionInputSchema,
  ToolInputSchemas,
} from '../../src/validation/tools.js';

describe('AgentSelectionSchema', () => {
  it('accepts valid agent names', () => {
    for (const agent of ['copilot', 'gemini', 'claude', 'opencode', 'codex', 'auto']) {
      expect(AgentSelectionSchema.parse(agent)).toBe(agent);
    }
  });

  it('rejects invalid agent names', () => {
    expect(() => AgentSelectionSchema.parse('gpt4')).toThrow();
    expect(() => AgentSelectionSchema.parse('')).toThrow();
  });
});

describe('ProjectTemplateSchema', () => {
  it('accepts valid templates', () => {
    for (const t of ['empty', 'node', 'python', 'rust', 'go', 'react', 'next']) {
      expect(ProjectTemplateSchema.parse(t)).toBe(t);
    }
  });

  it('rejects invalid templates', () => {
    expect(() => ProjectTemplateSchema.parse('django')).toThrow();
  });
});

describe('WorkspaceCreateInputSchema', () => {
  it('accepts valid workspace creation input', () => {
    const result = WorkspaceCreateInputSchema.parse({ name: 'my-project' });
    expect(result.name).toBe('my-project');
    expect(result.template).toBe('empty');
    expect(result.initGit).toBe(true);
  });

  it('rejects empty name', () => {
    expect(() => WorkspaceCreateInputSchema.parse({ name: '' })).toThrow();
  });

  it('rejects names with special characters', () => {
    expect(() => WorkspaceCreateInputSchema.parse({ name: 'my project!' })).toThrow();
  });

  it('rejects extra properties', () => {
    expect(() => WorkspaceCreateInputSchema.parse({ name: 'test', extra: true })).toThrow();
  });
});

describe('WorkspaceDeleteInputSchema', () => {
  it('requires confirm to be true', () => {
    expect(() => WorkspaceDeleteInputSchema.parse({ name: 'test', confirm: false })).toThrow();
    const result = WorkspaceDeleteInputSchema.parse({ name: 'test', confirm: true });
    expect(result.confirm).toBe(true);
  });
});

describe('TaskCreateInputSchema', () => {
  it('accepts valid task with defaults', () => {
    const result = TaskCreateInputSchema.parse({ goal: 'Build a feature' });
    expect(result.goal).toBe('Build a feature');
    expect(result.agent).toBe('auto');
    expect(result.timeout).toBe(300000);
  });

  it('rejects empty goal', () => {
    expect(() => TaskCreateInputSchema.parse({ goal: '' })).toThrow();
  });
});

describe('AskUserInputSchema', () => {
  it('accepts question with options', () => {
    const result = AskUserInputSchema.parse({
      question: 'Which one?',
      options: ['A', 'B'],
    });
    expect(result.question).toBe('Which one?');
    expect(result.options).toEqual(['A', 'B']);
  });

  it('rejects too many options', () => {
    const options = Array.from({ length: 11 }, (_, i) => `Option ${i}`);
    expect(() => AskUserInputSchema.parse({ question: 'Pick', options })).toThrow();
  });
});

describe('WebFetchInputSchema', () => {
  it('accepts valid URL', () => {
    const result = WebFetchInputSchema.parse({ url: 'https://example.com' });
    expect(result.url).toBe('https://example.com');
  });

  it('rejects invalid URL', () => {
    expect(() => WebFetchInputSchema.parse({ url: 'not-a-url' })).toThrow();
  });
});

describe('WebSearchInputSchema', () => {
  it('accepts valid search with defaults', () => {
    const result = WebSearchInputSchema.parse({ query: 'test query' });
    expect(result.count).toBe(5);
    expect(result.category).toBe('general');
  });

  it('rejects empty query', () => {
    expect(() => WebSearchInputSchema.parse({ query: '' })).toThrow();
  });
});

describe('BrowserActionInputSchema', () => {
  it('accepts click with ref', () => {
    const result = BrowserActionInputSchema.parse({ action: 'click', ref: 5 });
    expect(result.action).toBe('click');
  });

  it('accepts click with coordinates', () => {
    const result = BrowserActionInputSchema.parse({ action: 'click', x: 100, y: 200 });
    expect(result.x).toBe(100);
  });

  it('rejects click without ref or coordinates', () => {
    expect(() => BrowserActionInputSchema.parse({ action: 'click' })).toThrow();
  });

  it('rejects partial coordinates', () => {
    expect(() => BrowserActionInputSchema.parse({ action: 'click', x: 100 })).toThrow();
  });

  it('accepts scroll actions without ref', () => {
    const result = BrowserActionInputSchema.parse({ action: 'scroll_down' });
    expect(result.action).toBe('scroll_down');
  });

  it('rejects type without text', () => {
    expect(() => BrowserActionInputSchema.parse({ action: 'type', ref: 1 })).toThrow();
  });
});

describe('ToolInputSchemas registry', () => {
  it('contains all expected tool categories', () => {
    const keys = Object.keys(ToolInputSchemas);
    expect(keys).toContain('workspace_list');
    expect(keys).toContain('task_create');
    expect(keys).toContain('ask_user');
    expect(keys).toContain('github_pr_create');
    expect(keys).toContain('web_fetch');
    expect(keys).toContain('browser_open');
    expect(keys).toContain('workflow_create');
    expect(keys).toContain('cron_create');
    expect(keys).toContain('app_run');
    expect(keys).toContain('pm_list');
  });

  it('has correct number of tool schemas', () => {
    const keys = Object.keys(ToolInputSchemas);
    expect(keys.length).toBeGreaterThanOrEqual(30);
  });
});
