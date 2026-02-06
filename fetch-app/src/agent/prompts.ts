/**
 * @fileoverview Prompt Utilities
 *
 * Utility prompt builders for specific use cases (task framing, context building).
 * Core identity and system prompt are managed by IdentityManager (identity/manager.ts).
 * Identity data comes from COLLAR.md, ALPHA.md, and data/agents/*.md via IdentityLoader.
 *
 * @module agent/prompts
 */

import type { Session } from '../session/types.js';

// =============================================================================
// TASK FRAMING PROMPT
// =============================================================================

/**
 * Build the task framing prompt
 *
 * Used to transform a user's request into a clear goal for the harness.
 * The harness (Claude Code, etc.) will receive this goal.
 *
 * @param session - Current session for context
 * @param userRequest - Original user request
 * @returns System prompt for task framing
 */
export function buildTaskFramePrompt(session: Session, userRequest: string): string {
  const workspace = session.currentProject?.name ?? 'unknown';
  const branch = session.currentProject?.gitBranch ?? 'main';

  return `You are converting a user request into a clear coding task goal.

## Context
- Workspace: ${workspace}
- Branch: ${branch}
- User Request: "${userRequest}"

## Your Job

Create a clear, actionable goal for a coding agent. The agent has full file system access
and can write/modify code, but doesn't have our chat history.

## Goal Requirements

1. **Self-contained**: Include all necessary context
2. **Specific**: Name files, functions, or components when possible
3. **Bounded**: Clear scope of what to do (and not do)
4. **Testable**: The user should know when it's "done"

## Format

Write 2-4 sentences starting with an action verb. Include:
- What to do
- Where to do it (files/directories if known)
- Any constraints or considerations
- Definition of done

## Examples

User: "add dark mode"
Goal: "Add a dark mode toggle to the application. Create a useTheme hook in src/hooks/ that manages theme state and persists to localStorage. Update the root CSS variables in globals.css to support both light and dark themes. The toggle should be accessible from the settings page."

User: "fix the login bug"
Goal: "Fix the login issue where users are redirected incorrectly after authentication. Investigate the auth callback handler and session management. Ensure users land on their dashboard after successful login, not the home page."

User: "write tests for auth"
Goal: "Add comprehensive tests for the authentication module in src/auth/. Include unit tests for login, logout, and session refresh flows. Use the existing test patterns and mocking approach found in the codebase. Target 80%+ coverage for auth-related files."

Now write the goal:`;
}

// =============================================================================
// CONTEXT BUILDER
// =============================================================================

import { getSessionStore } from '../session/store.js';

/**
 * Build the context section for the system prompt.
 * Provides session-aware context: workspace, task, git state, summaries, repo map.
 *
 * @param session - Current session
 * @returns Formatted context block
 */
export function buildContextSection(session: Session): string {
  const parts: string[] = ['## Current Context'];

  // V3.1: Add Metadata
  const threadId = session.metadata?.activeThreadId;
  // FetchMode handled by ModeManager.
  if(threadId) parts.push(`🧵 **Thread**: \`${threadId}\``);

  // Workspace status
  if (session.currentProject) {
    parts.push(`📂 **Workspace**: ${session.currentProject.name}`);
    if (session.currentProject.gitBranch) {
      parts.push(`🌿 **Branch**: ${session.currentProject.gitBranch}`);
    }
    if (session.currentProject.hasUncommitted) {
      parts.push(`📝 **Note**: Has uncommitted changes`);
    }
  } else {
    parts.push('📂 **Workspace**: None selected');
    if (session.availableProjects?.length) {
      const projectList = session.availableProjects.slice(0, 5).join(', ');
      parts.push(`💡 **Available**: ${projectList}`);
    }
  }

  // Active task
  if (session.currentTask) {
    const task = session.currentTask;
    const goalPreview = task.goal.length > 50 
      ? task.goal.substring(0, 50) + '...' 
      : task.goal;
    parts.push(`🎯 **Active task**: ${goalPreview}`);
    parts.push(`📊 **Status**: ${task.status}`);
  }

  // Summaries (V3.1)
  try {
      const store = getSessionStore();
      const summaries = store.getSummaries(session.id, 2); // Get last 2 summaries
      if (summaries && summaries.length > 0) {
          parts.push(`\n## Recent Memories 🧠`);
          summaries.reverse().forEach(sum => {
              parts.push(`\n[Summary from ${new Date(sum.created_at).toLocaleTimeString()}]`);
              parts.push(sum.content);
          });
      }
  } catch {
      // Ignore summary errors during prompt build
  }

  // Repository Map
  if (session.repoMap) {
    parts.push('\n' + session.repoMap);
  }

  // Conversation context
  if (session.messages && session.messages.length > 0) {
    parts.push(`\n💬 **Conversation**: ${session.messages.length} messages in context`);
  }

  return parts.join('\n');
}

// =============================================================================
// EXPORTS
// =============================================================================

// buildTaskFramePrompt is exported at definition
// buildContextSection is exported at definition
