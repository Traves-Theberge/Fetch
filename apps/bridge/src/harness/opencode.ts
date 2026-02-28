/**
 * @fileoverview Harness adapter for OpenCode CLI.
 *
 * @module harness/opencode
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
 * OpenCode CLI executable.
 */
const OPENCODE_COMMAND = 'opencode';

/**
 * Base args for non-interactive execution.
 */
const DEFAULT_ARGS = [
  'run',       // Non-interactive run subcommand
  '--quiet',   // Suppress spinner/progress TUI
];

/**
 * OpenCode prompt/question line pattern.
 */
const QUESTION_PATTERN = /^\s*\?\s+(.+)/m;

/**
 * File operation line pattern.
 */
const FILE_EDIT_PATTERN = /^(Edited|Created|Deleted|Modified|Wrote|Read)\s+(.+)$/m;

/**
 * Spinner/progress line pattern.
 */
const PROGRESS_PATTERN = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+(.+)$/m;

/**
 * Completion markers.
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
 * Adapter for OpenCode CLI behavior and output parsing.
 */
export class OpenCodeAdapter extends AbstractHarnessAdapter {
  /**
   * Agent type handled by this adapter.
   */
  readonly agent: AgentType = 'opencode';

  /**
   * Builds process config for one task execution.
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
   * Parses one output line into a harness event type.
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
   * Adapter-specific question matcher.
   */
  protected getAdapterQuestionPattern(): RegExp {
    return QUESTION_PATTERN;
  }

  // formatResponse() inherited from AbstractHarnessAdapter

  /**
   * Extracts created/modified/deleted files from full output.
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
   * Progress matcher used by base summary extractor.
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
 * Singleton OpenCode adapter.
 */
export const opencodeAdapter = new OpenCodeAdapter();
