import { describe, expect, it } from 'vitest';

import {
  buildOutputConstraints,
  classifyIntent,
  evaluateIntentGate,
  getResponsePreferences,
  parsePreferenceUpdate,
  selectToolNamesForTurn,
  shouldUseMinimalMode,
  wantsFullInventory,
} from '../../src/agent/response-policy.js';
import { createSession } from '../../src/session/types.js';

describe('response policy', () => {
  it('classifies capability and inventory asks', () => {
    expect(classifyIntent('what can you do?')).toBe('capability_summary');
    expect(classifyIntent('what tools do you have?')).toBe('tool_inventory');
    expect(classifyIntent('show full tool list')).toBe('tool_inventory');
  });

  it('uses deterministic then heuristic intent gate stages', () => {
    expect(evaluateIntentGate('what can you do?')).toEqual({
      intent: 'capability_summary',
      stage: 'deterministic',
    });
    expect(evaluateIntentGate('please publish this repo to github')).toEqual({
      intent: 'action_request',
      stage: 'heuristic',
    });
    expect(evaluateIntentGate('can you make it blue use codex')).toEqual({
      intent: 'action_request',
      stage: 'heuristic',
    });
  });

  it('keeps action requests out of minimal mode', () => {
    const intent = classifyIntent('run tests and push');
    expect(intent).toBe('action_request');
    expect(shouldUseMinimalMode(intent)).toBe(false);
  });

  it('detects explicit full inventory requests', () => {
    expect(wantsFullInventory('show full tool list')).toBe(true);
    expect(wantsFullInventory('list all commands')).toBe(true);
    expect(wantsFullInventory('what tools do you have?')).toBe(false);
  });

  it('returns stable output constraints for key intents', () => {
    expect(buildOutputConstraints('capability_summary')).toContain('immediate action option');
    expect(buildOutputConstraints('tool_inventory')).toContain('Grouped bullet list');
  });

  it('parses preference updates from natural language', () => {
    expect(parsePreferenceUpdate('be brief from now on')).toEqual({ detail: 'brief' });
    expect(parsePreferenceUpdate('be more conversational and use more emojis')).toEqual({
      tone: 'conversational',
      emoji: 'normal',
    });
    expect(parsePreferenceUpdate('run tests now')).toBeNull();
  });

  it('reads persisted response preferences from session metadata', () => {
    const session = createSession('user-pref');
    session.metadata.responsePreferences = { detail: 'deep', tone: 'direct', emoji: 'low' };
    expect(getResponsePreferences(session)).toEqual({ detail: 'deep', tone: 'direct', emoji: 'low' });
  });

  it('selects a narrowed tool set for action requests', () => {
    const session = createSession('user-tool-select');
    const tools = selectToolNamesForTurn('commit and push this workspace to github', 'action_request', session);
    expect(tools).toContain('workspace_sync');
    expect(tools).toContain('workspace_status');
    expect(tools.some((name) => name.startsWith('github_'))).toBe(true);
  });

  it('returns no tools for pure greeting turns', () => {
    const session = createSession('user-no-tools');
    const tools = selectToolNamesForTurn('hey', 'greeting', session);
    expect(tools).toEqual([]);
  });

  it('keeps general fallback tools minimal and excludes task_status', () => {
    const session = createSession('user-general-fallback');
    const tools = selectToolNamesForTurn('what is up', 'general', session);
    expect(tools).toContain('workspace_status');
    expect(tools).toContain('ask_user');
    expect(tools).not.toContain('task_status');
  });
});
