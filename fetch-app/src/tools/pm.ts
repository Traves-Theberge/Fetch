/**
 * @fileoverview Project management tool handlers.
 *
 * Stub implementation for PM tools (Linear, Jira, GitHub Issues).
 * Providers are not yet connected — handlers return informative placeholders.
 *
 * @module tools/pm
 */

import type { ToolResult } from './types.js';

const NOT_CONFIGURED = 'PM provider integration is not yet configured. Set up credentials in your environment to enable this tool.';

export async function handlePMList(_input: unknown): Promise<ToolResult> {
  return { success: false, output: NOT_CONFIGURED, duration: 0 };
}

export async function handlePMView(_input: unknown): Promise<ToolResult> {
  return { success: false, output: NOT_CONFIGURED, duration: 0 };
}

export async function handlePMComment(_input: unknown): Promise<ToolResult> {
  return { success: false, output: NOT_CONFIGURED, duration: 0 };
}

export async function handlePMUpdate(_input: unknown): Promise<ToolResult> {
  return { success: false, output: NOT_CONFIGURED, duration: 0 };
}

export const pmTools: Record<string, { description: string }> = {
  pm_list: {
    description: 'List tasks from a project management provider (Linear, Jira, or GitHub Issues).',
  },
  pm_view: {
    description: 'View details of a specific task from a project management provider.',
  },
  pm_comment: {
    description: 'Add a comment to a task in a project management provider.',
  },
  pm_update: {
    description: 'Update the status of a task in a project management provider.',
  },
};
