/**
 * @fileoverview Tool Manager — lifecycle, security, and execution context for agent tools.
 *
 * Wraps the ToolRegistry with enable/disable lifecycle, usage/error tracking,
 * local-only policy enforcement, and tool discovery from `src/tools/`.
 *
 * @module tools/manager
 */

import {
  ToolResult,
  ToolContext,
  ToolPermission,
  ExecutionMode,
  ToolUsageStats,
} from './types.js';
import { ToolRegistry, type OrchestratorTool } from './registry.js';
import { checkToolPermission } from '../security/permissions.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// ToolManager
// ============================================================================

export class ToolManager {
  private static instance: ToolManager | undefined;

  private readonly registry: ToolRegistry;
  private disabledTools: Set<string> = new Set();
  private usageStats: Map<string, ToolUsageStats> = new Map();
  private executionMode: ExecutionMode = ExecutionMode.LOCAL;
  private maxPermission: ToolPermission = ToolPermission.EXECUTE;

  private constructor(registry?: ToolRegistry) {
    this.registry = registry ?? ToolRegistry.getInstance();
  }

  /** Returns the singleton ToolManager instance. */
  public static getInstance(): ToolManager {
    if (!ToolManager.instance) {
      ToolManager.instance = new ToolManager();
    }
    return ToolManager.instance;
  }

  /** Creates a non-singleton instance (useful for testing). */
  public static create(registry: ToolRegistry): ToolManager {
    return new ToolManager(registry);
  }

  /** Resets the singleton (for testing only). */
  public static resetInstance(): void {
    ToolManager.instance = undefined;
  }

  // --------------------------------------------------------------------------
  // Execution mode & permission ceiling
  // --------------------------------------------------------------------------

  /** Sets the current execution mode (LOCAL or CLOUD). */
  public setExecutionMode(mode: ExecutionMode): void {
    this.executionMode = mode;
    logger.info(`ToolManager execution mode set to '${mode}'`);
  }

  /** Returns the current execution mode. */
  public getExecutionMode(): ExecutionMode {
    return this.executionMode;
  }

  /** Sets the maximum permission level allowed for tool execution. */
  public setMaxPermission(permission: ToolPermission): void {
    this.maxPermission = permission;
    logger.info(`ToolManager max permission set to '${permission}'`);
  }

  /** Returns the current maximum permission level. */
  public getMaxPermission(): ToolPermission {
    return this.maxPermission;
  }

  // --------------------------------------------------------------------------
  // Enable / Disable lifecycle
  // --------------------------------------------------------------------------

  /** Disables a tool by name. Disabled tools cannot be executed. */
  public disable(toolName: string): boolean {
    const tool = this.registry.get(toolName);
    if (!tool) return false;
    this.disabledTools.add(toolName);
    logger.info(`Tool disabled: ${toolName}`);
    return true;
  }

  /** Re-enables a previously disabled tool. */
  public enable(toolName: string): boolean {
    const removed = this.disabledTools.delete(toolName);
    if (removed) {
      logger.info(`Tool enabled: ${toolName}`);
    }
    return removed;
  }

  /** Returns true if the tool is currently disabled. */
  public isDisabled(toolName: string): boolean {
    return this.disabledTools.has(toolName);
  }

  /** Returns the names of all currently disabled tools. */
  public listDisabled(): string[] {
    return Array.from(this.disabledTools);
  }

  // --------------------------------------------------------------------------
  // Tool querying
  // --------------------------------------------------------------------------

  /** Returns all registered tools (including disabled ones). */
  public listAll(): OrchestratorTool[] {
    return this.registry.list();
  }

  /** Returns only tools that are local-only. */
  public listLocalOnly(): OrchestratorTool[] {
    return this.registry.list().filter((t) => t.localOnly === true);
  }

  /** Returns only enabled tools. */
  public listEnabled(): OrchestratorTool[] {
    return this.registry.list().filter((t) => !this.disabledTools.has(t.name));
  }

  // --------------------------------------------------------------------------
  // Execution with policy enforcement
  // --------------------------------------------------------------------------

  /**
   * Executes a tool by name, enforcing:
   * 1. Disabled-tool check
   * 2. Local-only / permission policy (via security/permissions)
   * 3. Usage and error tracking
   *
   * Delegates actual handler invocation to the underlying ToolRegistry.
   */
  public async execute(
    name: string,
    args: unknown,
    context?: ToolContext,
  ): Promise<ToolResult> {
    // 1. Check if tool exists
    const tool = this.registry.get(name);
    if (!tool) {
      return {
        success: false,
        output: `Tool '${name}' not found`,
        duration: 0,
      };
    }

    // 2. Check if disabled
    if (this.disabledTools.has(name)) {
      return {
        success: false,
        output: `Tool '${name}' is currently disabled`,
        duration: 0,
      };
    }

    // 3. Permission / local-only policy check
    const policyResult = checkToolPermission(
      {
        name: tool.name,
        localOnly: tool.localOnly ?? false,
        permission: tool.permission ?? ToolPermission.READ,
      },
      this.executionMode,
      this.maxPermission,
    );

    if (!policyResult.allowed) {
      return {
        success: false,
        output: policyResult.reason ?? `Tool '${name}' blocked by permission policy`,
        duration: 0,
      };
    }

    // 4. Delegate to registry (handles schema validation, autonomy, handler)
    const result = await this.registry.execute(name, args, context);

    // 5. Track usage
    this.recordUsage(name, result);

    return result;
  }

  // --------------------------------------------------------------------------
  // Usage statistics
  // --------------------------------------------------------------------------

  /** Returns usage stats for a single tool. */
  public getStats(toolName: string): ToolUsageStats | undefined {
    return this.usageStats.get(toolName);
  }

  /** Returns usage stats for all tools that have been executed at least once. */
  public getAllStats(): Map<string, ToolUsageStats> {
    return new Map(this.usageStats);
  }

  /** Resets all usage statistics. */
  public resetStats(): void {
    this.usageStats.clear();
  }

  /** Computes the error rate (0–1) for a tool. Returns 0 if never executed. */
  public getErrorRate(toolName: string): number {
    const stats = this.usageStats.get(toolName);
    if (!stats) return 0;
    const total = stats.successCount + stats.errorCount;
    return total === 0 ? 0 : stats.errorCount / total;
  }

  // --------------------------------------------------------------------------
  // Shutdown
  // --------------------------------------------------------------------------

  /** Shuts down the underlying registry (closes file watchers, etc.). */
  public async shutdown(): Promise<void> {
    await this.registry.shutdown();
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private recordUsage(toolName: string, result: ToolResult): void {
    const existing = this.usageStats.get(toolName) ?? {
      successCount: 0,
      errorCount: 0,
      totalDuration: 0,
      lastUsed: 0,
    };

    if (result.success) {
      existing.successCount++;
    } else {
      existing.errorCount++;
    }
    existing.totalDuration += result.duration;
    existing.lastUsed = Date.now();

    this.usageStats.set(toolName, existing);
  }
}

// ============================================================================
// Module-level accessor
// ============================================================================

export const getToolManager = (): ToolManager => ToolManager.getInstance();
