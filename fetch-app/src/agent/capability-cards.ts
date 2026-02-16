/**
 * @fileoverview Deterministic capability and tool inventory response builders.
 *
 * @module agent/capability-cards
 */

import { ToolInputSchemas } from '../validation/tools.js';

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
export function buildCapabilitySummary(): string {
  return [
    '*What I can do for you right now*',
    '• Build, debug, and refactor code in your active workspace',
    '• Run tests, app commands, and browser checks',
    '• Handle GitHub workflows: branches, PRs, issues, CI status',
    '• Research docs/web content and extract what matters',
    '• Create repeatable workflows and cron automation',
    '',
    'Give me one outcome and I will execute it step by step.',
  ].join('\n');
}

/**
 * Build deterministic tool inventory with stable category ordering.
 */
export function buildToolInventory(options: InventoryOptions = {}): string {
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
  const lines: string[] = [`*Tool Inventory*`, `• ${SLASH_COMMANDS.length} slash commands`, `• ${totalTools} orchestrator tools`, ''];

  for (const [label, tools] of ordered) {
    if (tools.length === 0) continue;
    lines.push(`*${label}* (${tools.length})`);
    if (options.full) {
      for (const name of tools) lines.push(`• ${name}`);
    } else {
      lines.push(`• ${tools.slice(0, 4).join(', ')}${tools.length > 4 ? ', ...' : ''}`);
    }
  }

  lines.push('');
  lines.push(options.full ? 'Tell me which tool flow you want to run first.' : 'Ask "show full tool list" if you want every command name.');
  return lines.join('\n');
}
