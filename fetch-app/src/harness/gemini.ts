/**
 * @fileoverview Harness adapter for Gemini CLI.
 *
 * @module harness/gemini
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
 * Gemini CLI executable.
 */
const GEMINI_COMMAND = 'gemini';

/**
 * Base args for non-interactive execution.
 */
const DEFAULT_ARGS = [
  '--sandbox=none',    // Full file system access
];

/**
 * Gemini prompt/question line pattern.
 */
const QUESTION_PATTERN = /^>\s*(.+\?)\s*$/m;

/**
 * File operation line pattern.
 */
const FILE_OP_PATTERN = /^\[(Created|Modified|Deleted|Updated)\]\s+(.+)$/m;

/**
 * Progress line pattern.
 */
const PROGRESS_PATTERN = /^(Analyzing|Working|Generating|Reading|Writing)\.\.\./m;

/**
 * Completion markers.
 */
const COMPLETION_PATTERNS = [
  /^Done\.?$/im,
  /^Complete\.?$/im,
  /^Finished\.?$/im,
  /^Task completed/im,
  /^Changes applied/im,
];

/**
 * Error line marker.
 */
const ERROR_PATTERN = /^Error:\s+(.+)$/m;

// ============================================================================
// GeminiAdapter Class
// ============================================================================

/**
 * Adapter for Gemini CLI behavior and output parsing.
 */
export class GeminiAdapter extends AbstractHarnessAdapter {
  /**
   * Agent type handled by this adapter.
   */
  readonly agent: AgentType = 'gemini';

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
      command: GEMINI_COMMAND,
      args: [
        ...DEFAULT_ARGS,
        '-p',
        goal,
      ],
      env: {
        // Ensure non-interactive environment
        CI: 'true',
        TERM: 'dumb',
        ...(env.GEMINI_API_KEY ? { GEMINI_API_KEY: env.GEMINI_API_KEY } : {}),
        // Inject CLI config file for harness-specific instructions
        GEMINI_SYSTEM_MD: '/app/data/cli-configs/GEMINI.md',
      },
      cwd: workspacePath,
      timeoutMs,
      container: KENNEL_CONTAINER,
    };

    // Inject model selection if configured
    if (env.GEMINI_MODEL) {
      config.args.push('--model', env.GEMINI_MODEL);
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
    if (FILE_OP_PATTERN.test(line)) {
      return 'progress';
    }

    // Check for progress indicators
    if (PROGRESS_PATTERN.test(line)) {
      return 'progress';
    }

    // Check for completion
    if (COMPLETION_PATTERNS.some((p) => p.test(line))) {
      return 'complete';
    }

    // Check for errors
    if (ERROR_PATTERN.test(line)) {
      return 'error';
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

  /**
   * Adds Gemini-specific selection prompts on top of base detection.
   */
  detectQuestion(output: string): string | null {
    const base = super.detectQuestion(output);
    if (base) return base;

    // Gemini-specific: selection prompts
    const lines = output.trim().split('\n');
    const tail = lines.slice(-3);
    for (const line of tail) {
      if (/choose|select|pick|which/i.test(line) && line.includes('?')) {
        return line.trim();
      }
    }
    return null;
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
      const match = line.match(FILE_OP_PATTERN);
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
          case 'modified':
          case 'updated':
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
 * Singleton Gemini adapter.
 */
export const geminiAdapter = new GeminiAdapter();
