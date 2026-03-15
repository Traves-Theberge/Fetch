/**
 * @fileoverview Permission policy engine for tool execution.
 *
 * Enforces local-only restrictions and read/write/execute permission levels
 * based on the current execution mode and tool metadata.
 *
 * @module security/permissions
 */

import { ExecutionMode, ToolPermission } from '../tools/types.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

/** Metadata the permission engine needs from a tool to make a policy decision. */
export interface PermissionCheckInput {
  /** Tool name (for logging) */
  name: string;
  /** Whether the tool is restricted to local execution */
  localOnly: boolean;
  /** Permission level required by the tool */
  permission: ToolPermission;
}

/** Result of a permission check. */
export interface PermissionCheckResult {
  /** Whether the tool is allowed to execute */
  allowed: boolean;
  /** Reason the tool was blocked (only present when allowed === false) */
  reason?: string;
}

// ============================================================================
// Permission Policy
// ============================================================================

/**
 * Checks whether a tool is allowed to execute under the given execution mode
 * and maximum permission level.
 *
 * Rules:
 * 1. Local-only tools are blocked when `mode` is `CLOUD`.
 * 2. A tool's required permission must not exceed `maxPermission`.
 *    Permission hierarchy: READ < WRITE < EXECUTE.
 */
export function checkToolPermission(
  tool: PermissionCheckInput,
  mode: ExecutionMode,
  maxPermission: ToolPermission = ToolPermission.EXECUTE,
): PermissionCheckResult {
  // Rule 1: local-only enforcement
  if (tool.localOnly && mode === ExecutionMode.CLOUD) {
    const reason = `Tool '${tool.name}' is local-only and cannot run in cloud mode`;
    logger.warn(reason);
    return { allowed: false, reason };
  }

  // Rule 2: permission-level enforcement
  if (!isPermissionSufficient(tool.permission, maxPermission)) {
    const reason = `Tool '${tool.name}' requires '${tool.permission}' permission but session allows at most '${maxPermission}'`;
    logger.warn(reason);
    return { allowed: false, reason };
  }

  return { allowed: true };
}

// ============================================================================
// Helpers
// ============================================================================

const PERMISSION_RANK: Record<ToolPermission, number> = {
  [ToolPermission.READ]: 0,
  [ToolPermission.WRITE]: 1,
  [ToolPermission.EXECUTE]: 2,
};

/**
 * Returns true when `required` does not exceed `ceiling`.
 */
function isPermissionSufficient(
  required: ToolPermission,
  ceiling: ToolPermission,
): boolean {
  return PERMISSION_RANK[required] <= PERMISSION_RANK[ceiling];
}
