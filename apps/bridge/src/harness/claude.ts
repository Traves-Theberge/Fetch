/**
 * @fileoverview Harness adapter for Claude Code CLI.
 *
 * @module harness/claude
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
 * Claude CLI executable.
 */
const CLAUDE_COMMAND = 'claude';

/**
 * Base args for non-interactive execution.
 */
const DEFAULT_ARGS = [
  '--print',           // Non-interactive mode (no TUI)
  '--dangerously-skip-permissions', // Skip permission prompts
];

/**
 * Claude prompt/question line pattern.
 */
const QUESTION_PATTERN = /^\s*\?\s+(.+)/m;

/**
 * File operation line pattern.
 */
const FILE_EDIT_PATTERN = /^(Edited|Created|Deleted|Modified)\s+(.+)$/m;

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
// ClaudeAdapter Class
// ============================================================================

/**
 * Adapter for Claude CLI behavior and output parsing.
 */
export class ClaudeAdapter extends AbstractHarnessAdapter {
  /**
   * Agent type handled by this adapter.
   */
  readonly agent: AgentType = 'claude';

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
      command: CLAUDE_COMMAND,
      args: [
        ...DEFAULT_ARGS,
        '-p',
        goal,
      ],
      env: {
        // Ensure non-interactive environment
        CI: 'true',
        TERM: 'dumb',
        ...(env.ANTHROPIC_API_KEY ? { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY } : {}),
      },
      cwd: workspacePath,
      timeoutMs,
      container: KENNEL_CONTAINER,
    };

    // Inject CLI config file for harness-specific instructions
    config.args.push('--append-system-prompt', '/app/data/cli-configs/CLAUDE.md');

    // Inject model selection if configured
    if (env.CLAUDE_MODEL) {
      config.args.push('--model', env.CLAUDE_MODEL);
    }

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
            created.push(cleanPath);
            break;
          case 'deleted':
            deleted.push(cleanPath);
            break;
          case 'edited':
          case 'modified':
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
 * Singleton Claude adapter.
 */
export const claudeAdapter = new ClaudeAdapter();
