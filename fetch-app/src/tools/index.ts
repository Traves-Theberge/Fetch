/**
 * @fileoverview Tools Module Exports
 * @module tools
 *
 * ## Orchestrator Tools
 *
 * The architecture uses 8 high-level tools that delegate
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

// Tool Registry
export { ToolRegistry, getToolRegistry, initializeToolRegistry, orchestratorTools } from './registry.js';
export type { OrchestratorTool, ToolHandler } from './registry.js';

// Tool handlers
export { workspaceTools, handleWorkspaceList, handleWorkspaceSelect, handleWorkspaceStatus } from './workspace.js';
export { taskTools, handleTaskCreate, handleTaskStatus, handleTaskCancel, handleTaskRespond } from './task.js';
export { interactionTools, handleAskUser, handleReportProgress } from './interaction.js';
