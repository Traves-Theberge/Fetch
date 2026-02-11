/**
 * @fileoverview OpenCode CLI harness adapter
 *
 * Implements the HarnessAdapter interface for OpenCode CLI.
 * OpenCode is a Go-based open-source coding agent invoked with `opencode run --quiet`.
 *
 * @module harness/opencode
 * @see {@link HarnessAdapter} - Adapter interface
 * @see {@link HarnessExecutor} - Execution engine
 *
 * ## OpenCode CLI Usage
 *
 * ```bash
 * # Non-interactive mode (run subcommand, --quiet suppresses spinner)
 * opencode run --quiet "Add dark mode to the settings page"
 *
 * # With model override
 * opencode run --quiet --model provider/model-id "..."
 * ```
 *
 * ## Output Patterns
 *
 * OpenCode outputs include:
 * - Progress indicators: `- Working...`
 * - File operations: `Edited src/file.ts`
 * - Questions: `? Do you want to...`
 * - Completion: Summary of changes
 */

import type { AgentType } from '../task/types.js';
import { env } from '../config/env.js';
import {
  KENNEL_CONTAINER,
  type HarnessConfig,
  type HarnessOutputEventType,
} from './types.js';
import { AbstractHarnessAdapter } from './base.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * OpenCode CLI executable name
 */
const OPENCODE_COMMAND = 'opencode';

/**
 * Default OpenCode CLI arguments
 */
const DEFAULT_ARGS = [
  'run',       // Non-interactive run subcommand
  '--quiet',   // Suppress spinner/progress TUI
];

/**
 * Pattern for OpenCode questions
 */
const QUESTION_PATTERN = /^\s*\?\s+(.+)/m;

/**
 * Pattern for file edit operations
 */
const FILE_EDIT_PATTERN = /^(Edited|Created|Deleted|Modified|Wrote|Read)\s+(.+)$/m;

/**
 * Pattern for progress indicators
 */
const PROGRESS_PATTERN = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+(.+)$/m;

/**
 * Pattern for completion
 */
const COMPLETION_PATTERNS = [
  /^Done\.?$/im,
  /^Completed\.?$/im,
  /^Finished\.?$/im,
  /^Task completed/im,
];

// ============================================================================
// OpenCodeAdapter Class
// ============================================================================

/**
 * OpenCode CLI adapter
 *
 * Implements the HarnessAdapter interface for OpenCode.
 *
 * @example
 * ```typescript
 * const adapter = new OpenCodeAdapter();
 *
 * const config = adapter.buildConfig(
 *   'Add dark mode',
 *   '/workspace/my-project',
 *   300000
 * );
 *
 * // config.command = 'opencode'
 * // config.args = ['run', '--quiet', 'Add dark mode']
 * ```
 */
export class OpenCodeAdapter extends AbstractHarnessAdapter {
  /**
   * Agent type this adapter handles
   */
  readonly agent: AgentType = 'opencode';

  /**
   * Build execution configuration for a task
   *
   * @param goal - Task goal/prompt
   * @param workspacePath - Working directory
   * @param timeoutMs - Execution timeout
   * @returns Harness configuration
   */
  buildConfig(
    goal: string,
    workspacePath: string,
    timeoutMs: number
  ): HarnessConfig {
    const config: HarnessConfig = {
      command: OPENCODE_COMMAND,
      args: [
        ...DEFAULT_ARGS,
      ],
      env: {
        // Ensure non-interactive environment
        CI: 'true',
        TERM: 'dumb',
        ...(env.OPENCODE_API_KEY ? { OPENCODE_API_KEY: env.OPENCODE_API_KEY } : {}),
        ...(env.OPENROUTER_API_KEY ? { OPENROUTER_API_KEY: env.OPENROUTER_API_KEY } : {}),
      },
      cwd: workspacePath,
      timeoutMs,
      container: KENNEL_CONTAINER,
    };

    // Inject model selection if configured
    if (env.OPENCODE_MODEL) {
      config.args.push('--model', env.OPENCODE_MODEL);
    }

    // Goal is passed as positional arg after flags
    config.args.push(goal);

    // Inject CLI config file for harness-specific instructions
    config.env.OPENCODE_SYSTEM_PROMPT = '/app/data/cli-configs/OPENCODE.md';

    return config;
  }

  /**
   * Parse output line to detect special events
   *
   * @param line - Raw output line
   * @returns Event type or null
   */
  parseOutputLine(line: string): HarnessOutputEventType | null {
    // Check for question
    if (QUESTION_PATTERN.test(line)) {
      return 'question';
    }

    // Check for file operations (progress indicator)
    if (FILE_EDIT_PATTERN.test(line)) {
      return 'progress';
    }

    // Check for progress spinner
    if (PROGRESS_PATTERN.test(line)) {
      return 'progress';
    }

    // Check for completion
    if (COMPLETION_PATTERNS.some((p) => p.test(line))) {
      return 'complete';
    }

    // Regular output
    return null;
  }

  /**
   * OpenCode-specific question pattern: `? Do you want to...`
   */
  protected getAdapterQuestionPattern(): RegExp {
    return QUESTION_PATTERN;
  }

  // formatResponse() inherited from AbstractHarnessAdapter

  /**
   * Extract file operations from output
   *
   * Parses OpenCode output to find which files were modified.
   *
   * @param output - Full output buffer
   * @returns Object with created, modified, deleted files
   */
  extractFileOperations(output: string): {
    created: string[];
    modified: string[];
    deleted: string[];
  } {
    const created: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(FILE_EDIT_PATTERN);
      if (match) {
        const [, operation, filePath] = match;
        const cleanPath = filePath.trim();

        switch (operation.toLowerCase()) {
          case 'created':
          case 'wrote':
            created.push(cleanPath);
            break;
          case 'deleted':
            deleted.push(cleanPath);
            break;
          case 'edited':
          case 'modified':
          case 'read':
            modified.push(cleanPath);
            break;
        }
      }
    }

    return { created, modified, deleted };
  }

  /**
   * Progress pattern for summary paragraph filtering
   */
  protected getProgressPattern(): RegExp {
    return PROGRESS_PATTERN;
  }

  // extractSummary() inherited from AbstractHarnessAdapter
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global OpenCode adapter instance
 */
export const opencodeAdapter = new OpenCodeAdapter();
