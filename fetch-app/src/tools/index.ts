/**
 * @fileoverview Tools Module Exports
 * @module tools
 *
 * ## V2 Tools (Orchestrator Mode)
 *
 * The v2 architecture uses 8 high-level tools that delegate
 * actual coding work to harnesses (Claude Code, Gemini CLI, etc.).
 *
 * ### Workspace (3)
 * - `workspace_list` - List available workspaces
 * - `workspace_select` - Select active workspace
 * - `workspace_status` - Get workspace status
 *
 * ### Task (4)
 * - `task_create` - Create a new task
 * - `task_status` - Get task status
 * - `task_cancel` - Cancel a task
 * - `task_respond` - Respond to task question
 *
 * ### Interaction (2)
 * - `ask_user` - Ask user a question
 * - `report_progress` - Report task progress
 */

// Core types
export * from './types.js';

// V2 Registry (new 8-tool set)
export * from './v2/registry.js';

// V2 Tool handlers
export { workspaceTools, handleWorkspaceList, handleWorkspaceSelect, handleWorkspaceStatus } from './workspace.js';
export { taskTools, handleTaskCreate, handleTaskStatus, handleTaskCancel, handleTaskRespond } from './task.js';
export { interactionTools, handleAskUser, handleReportProgress } from './interaction.js';

// Legacy registry (for backward compatibility during transition)
export { getToolRegistry, initializeToolRegistry } from './registry.js';

// Legacy git utilities (used by agent/action.ts, agent/core.ts, commands/parser.ts)
export { getCurrentCommit, resetToCommit } from './legacy/git.js';
