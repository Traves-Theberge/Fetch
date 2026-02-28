/**
 * @fileoverview Public exports for the tools subsystem.
 *
 * Exposes tool handlers, registry, custom-tool loader, and shared tool types.
 *
 * @module tools
 */

// Core types
export * from './types.js';

// Tool Registry
export { ToolRegistry, getToolRegistry } from './registry.js';
export type { OrchestratorTool, ToolHandler } from './registry.js';

// Tool handlers
export { workspaceTools, handleWorkspaceList, handleWorkspaceSelect, handleWorkspaceStatus, handleWorkspaceCreate, handleWorkspaceDelete, handleWorkspaceSync } from './workspace.js';
export { taskTools, handleTaskCreate, handleTaskStatus, handleTaskCancel, handleTaskRespond } from './task.js';
export { interactionTools, handleAskUser, handleReportProgress } from './interaction.js';

// Web tools
export { webTools, handleWebFetch, handleWebSearch } from './web.js';

// Browser tools
export { browserTools, handleBrowserOpen, handleBrowserSnapshot, handleBrowserAction, handleBrowserScreenshot } from './browser.js';

// Custom tool loader
export { loadToolDefinition, buildToolSchema } from './loader.js';
export type { CustomToolDefinition } from './loader.js';
