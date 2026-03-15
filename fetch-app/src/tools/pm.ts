/**
 * @fileoverview Project management tool handlers.
 *
 * Implements PM integration tools (`pm_list`, `pm_view`, `pm_comment`, `pm_update`)
 * for Linear, Jira, and GitHub issue tracking.
 *
 * @module tools/pm
 */

import {
  PMListInputSchema,
  PMViewInputSchema,
  PMCommentInputSchema,
  PMUpdateInputSchema,
} from '../validation/tools.js';
import type { ToolResult } from './types.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// pm_list
// ============================================================================

export async function handlePMList(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parseResult = PMListInputSchema.safeParse(input);
  if (!parseResult.success) {
    return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
  }

  const { provider } = parseResult.data;
  logger.info(`pm_list: listing tasks from ${provider}`);

  // TODO: implement provider-specific list logic
  return {
    success: false,
    output: '',
    error: `PM provider '${provider}' is not yet configured. Please set up the integration first.`,
    duration: Date.now() - start,
  };
}

// ============================================================================
// pm_view
// ============================================================================

export async function handlePMView(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parseResult = PMViewInputSchema.safeParse(input);
  if (!parseResult.success) {
    return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
  }

  const { provider, taskId } = parseResult.data;
  logger.info(`pm_view: viewing task ${taskId} from ${provider}`);

  // TODO: implement provider-specific view logic
  return {
    success: false,
    output: '',
    error: `PM provider '${provider}' is not yet configured. Please set up the integration first.`,
    duration: Date.now() - start,
  };
}

// ============================================================================
// pm_comment
// ============================================================================

export async function handlePMComment(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parseResult = PMCommentInputSchema.safeParse(input);
  if (!parseResult.success) {
    return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
  }

  const { provider, taskId } = parseResult.data;
  logger.info(`pm_comment: commenting on task ${taskId} in ${provider}`);

  // TODO: implement provider-specific comment logic
  return {
    success: false,
    output: '',
    error: `PM provider '${provider}' is not yet configured. Please set up the integration first.`,
    duration: Date.now() - start,
  };
}

// ============================================================================
// pm_update
// ============================================================================

export async function handlePMUpdate(input: unknown): Promise<ToolResult> {
  const start = Date.now();
  const parseResult = PMUpdateInputSchema.safeParse(input);
  if (!parseResult.success) {
    return { success: false, output: '', error: `Invalid input: ${parseResult.error.message}`, duration: Date.now() - start };
  }

  const { provider, taskId, status } = parseResult.data;
  logger.info(`pm_update: updating task ${taskId} to '${status}' in ${provider}`);

  // TODO: implement provider-specific update logic
  return {
    success: false,
    output: '',
    error: `PM provider '${provider}' is not yet configured. Please set up the integration first.`,
    duration: Date.now() - start,
  };
}

// ============================================================================
// Tool descriptions for registry
// ============================================================================

export const pmTools: Record<string, { description: string }> = {
  pm_list: {
    description:
      'List tasks from a project management provider (Linear, Jira, or GitHub). Supports filtering by team, assignee, state, labels, and custom JQL queries.',
  },
  pm_view: {
    description:
      'View details of a specific task from a project management provider, including title, description, status, assignee, and comments.',
  },
  pm_comment: {
    description:
      'Add a comment to a task in a project management provider. Useful for posting status updates, questions, or notes.',
  },
  pm_update: {
    description:
      'Update the status of a task in a project management provider. Changes the task state (e.g. open, in progress, done).',
  },
};
