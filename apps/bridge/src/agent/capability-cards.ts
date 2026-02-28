/**
 * @fileoverview Deterministic capability and tool inventory response builders.
 *
 * @module agent/capability-cards
 */

import { ToolInputSchemas } from '../validation/tools.js';
import type { ResponsePreferences } from './response-policy.js';

type InventoryOptions = {
  full?: boolean;
};

const SLASH_COMMANDS = ['/stop', '/undo', '/clear', '/help', '/status', '/version', '/usage', '/trust'];

function collectToolGroups(): Record<string, string[]> {
  const allTools = Object.keys(ToolInputSchemas);
  return {
    Workspace: allTools.filter((name) => name.startsWith('workspace_') || name === 'file_delete' || name === 'folder_delete'),
    Task: allTools.filter((name) => name.startsWith('task_')),
    Interaction: allTools.filter((name) => name === 'ask_user' || name === 'report_progress'),
    GitHub: allTools.filter((name) => name.startsWith('github_')),
    Web: allTools.filter((name) => name.startsWith('web_')),
    Browser: allTools.filter((name) => name.startsWith('browser_') && name !== 'browser_test'),
    WorkflowRuntime: allTools.filter((name) => name.startsWith('workflow_') || name.startsWith('cron_') || name === 'app_run' || name === 'app_test' || name === 'browser_test'),
  };
}

/**
 * Build concise capability summary for generic "what can you do" asks.
 */
export function buildCapabilitySummary(preferences?: ResponsePreferences): string {
  const detail = preferences?.detail ?? 'standard';
  const tone = preferences?.tone ?? 'conversational';
  const opener = tone === 'direct' ? '*Capabilities*' : '*What I can do for you right now*';
  const base = [
    opener,
    '• Build, debug, and refactor code in your active workspace',
    '• Run tests, app commands, and browser checks',
    '• Handle GitHub workflows: branches, PRs, issues, CI status',
  ];

  if (detail !== 'brief') {
    base.push('• Research docs/web content and extract what matters');
    base.push('• Create repeatable workflows and cron automation');
  }
  if (detail === 'deep') {
    base.push('• Delegate complex multi-file tasks across available coding harnesses');
  }

  base.push('');
  base.push(tone === 'direct'
    ? 'Give one objective and I will execute it.'
    : 'Give me one outcome and I will execute it step by step.');
  return base.join('\n');
}

/**
 * Build deterministic tool inventory with stable category ordering.
 */
export function buildToolInventory(options: InventoryOptions = {}, preferences?: ResponsePreferences): string {
  const detail = preferences?.detail ?? 'standard';
  const groups = collectToolGroups();
  const ordered = [
    ['Workspace', groups.Workspace],
    ['Task', groups.Task],
    ['Interaction', groups.Interaction],
    ['GitHub', groups.GitHub],
    ['Web', groups.Web],
    ['Browser', groups.Browser],
    ['Workflow & Runtime', groups.WorkflowRuntime],
  ] as const;

  const totalTools = ordered.reduce((sum, [, tools]) => sum + tools.length, 0);
  const lines: string[] = ['*Tool Inventory*', `• ${SLASH_COMMANDS.length} slash commands`, `• ${totalTools} orchestrator tools`, ''];

  for (const [label, tools] of ordered) {
    if (tools.length === 0) continue;
    lines.push(`*${label}* (${tools.length})`);
    if (options.full || detail === 'deep') {
      for (const name of tools) lines.push(`• ${name}`);
    } else {
      const previewCount = detail === 'brief' ? 3 : 4;
      lines.push(`• ${tools.slice(0, previewCount).join(', ')}${tools.length > previewCount ? ', ...' : ''}`);
    }
  }

  lines.push('');
  lines.push(options.full ? 'Tell me which tool flow you want to run first.' : 'Ask "show full tool list" if you want every command name.');
  return lines.join('\n');
}
