/**
 * @fileoverview Prompt fragment builders used by the core agent loop.
 *
 * This module builds:
 * - task framing prompts for harness goal generation
 * - dynamic context sections injected into system prompts
 *
 * @module agent/prompts
 */

import type { Session } from '../session/types.js';

// =============================================================================
// TASK FRAMING PROMPT
// =============================================================================

/**
 * Build the prompt used to convert a user request into a harness task goal.
 *
 * @param session - Current session context
 * @param userRequest - Original user request
 * @returns Prompt text for the framing model call
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

/**
 * Build the dynamic context section for the main system prompt.
 *
 * Includes workspace, active task, compaction summary, repo map,
 * recalled memory snippets, and conversation size metadata.
 *
 * @param session - Current session
 * @param userMessage - Optional current user text for memory recall matching
 * @returns Context block text
 */
export async function buildContextSection(session: Session, userMessage?: string): Promise<string> {
  const parts: string[] = [];

  // Thread metadata
  const threadId = session.metadata?.activeThreadId;
  if (threadId) parts.push(`🧵 **Thread**: \`${threadId}\``);

  // WORKSPACE — This is the MOST IMPORTANT context for the LLM
  if (session.currentProject) {
    const proj = session.currentProject;
    const profile = proj.profile;
    const typeLabel = proj.type === 'unknown' ? 'project' : proj.type;

    parts.push(`## 🎯 ACTIVE WORKSPACE: ${proj.name}`);
    parts.push(`Path: \`${proj.path}\``);

    if (profile) {
      parts.push(`Type: ${typeLabel} (${profile.language})`);
      if (profile.framework) parts.push(`Framework: ${profile.framework}`);
      if (profile.packageManager) parts.push(`Package Manager: ${profile.packageManager}`);
      if (profile.testCommand) parts.push(`Test: \`${profile.testCommand}\``);
      if (profile.buildCommand) parts.push(`Build: \`${profile.buildCommand}\``);
      if (profile.entryPoints.length > 0) parts.push(`Entry Points: ${profile.entryPoints.join(', ')}`);
    } else {
      parts.push(`Type: ${typeLabel}`);
    }

    parts.push(`YOU ARE INSIDE THIS WORKSPACE. All file operations, tasks, and queries target this workspace. Do NOT ask the user to select or confirm a workspace.`);
    if (proj.gitBranch) {
      parts.push(`Branch: \`${proj.gitBranch}\`${proj.hasUncommitted ? ' ⚠️ (uncommitted changes)' : ' ✨ (clean)'}`);
    }
  } else {
    parts.push('## Workspace: None selected');
    if (session.availableProjects?.length) {
      const projectList = session.availableProjects.slice(0, 5).join(', ');
      parts.push(`Available projects: ${projectList}`);
      parts.push(`Help the user select one with workspace_select before doing any file/code work. Browser, web search, and general questions do NOT require a workspace.`);
    }
  }

  // Active task
  if (session.activeTaskId) {
    const { getTaskManager } = await import('../task/manager.js');
    const taskManager = await getTaskManager();
    const task = taskManager.getTask(session.activeTaskId);
    if (task) {
      const goalPreview = task.goal.length > 50
        ? task.goal.substring(0, 50) + '...'
        : task.goal;
      parts.push(`🎯 **Active task**: ${goalPreview}`);
      parts.push(`📊 **Status**: ${task.status}`);
    }
  }

  const runtime = session.metadata?.agentRuntime as Record<string, unknown> | undefined;
  const responsePrefs = session.metadata?.responsePreferences as
    | { detail?: string; tone?: string; emoji?: string }
    | undefined;
  const activeRun = runtime?.activeRun as { phase?: string; promptMode?: string; startedAt?: string } | undefined;
  if (activeRun?.phase) {
    parts.push(`⚙️ **Active run**: ${activeRun.phase}${activeRun.promptMode ? ` (${activeRun.promptMode})` : ''}`);
  }
  const shortTermSummary = runtime?.shortTermSummary;
  if (typeof shortTermSummary === 'string' && shortTermSummary.trim()) {
    parts.push('\n## Short-Term Memory');
    parts.push(shortTermSummary);
  }

  if (responsePrefs && (responsePrefs.detail || responsePrefs.tone || responsePrefs.emoji)) {
    parts.push('\n## Response Preferences');
    if (responsePrefs.detail) parts.push(`- Detail: ${responsePrefs.detail}`);
    if (responsePrefs.tone) parts.push(`- Tone: ${responsePrefs.tone}`);
    if (responsePrefs.emoji) parts.push(`- Emoji: ${responsePrefs.emoji}`);
  }
  const durableNotes = runtime?.durableNotes;
  if (Array.isArray(durableNotes) && durableNotes.length > 0) {
    parts.push('\n## Durable Notes');
    for (const note of durableNotes.slice(0, 8)) {
      if (typeof note === 'string' && note.trim()) {
        parts.push(`- ${note}`);
      }
    }
  }

  // Compaction summary
  if (session.metadata?.compactionSummary) {
    parts.push('\n## Conversation History 🧠');
    parts.push(session.metadata.compactionSummary);
    if (session.metadata.compactedMessageCount) {
      parts.push(`_(${session.metadata.compactedMessageCount} earlier messages condensed)_`);
    }
  }

  // Repository Map
  if (session.repoMap) {
    parts.push('\n' + session.repoMap);
  }

  // Recalled memories from structured memory store
  if (userMessage) {
    try {
      const { getSessionManager } = await import('../session/manager.js');
      const sManager = await getSessionManager();
      const memories = await sManager.recallMemories(session.id, userMessage);
      if (memories.length > 0) {
        parts.push('\n## Recalled Context');
        for (const mem of memories) {
          parts.push(`- [${mem.category}] ${mem.content}`);
        }
      }
    } catch {
      // Memory recall is best-effort, don't block on failure
    }
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
