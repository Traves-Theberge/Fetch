/**
 * @fileoverview Gemini CLI harness adapter
 *
 * Implements the HarnessAdapter interface for Gemini CLI.
 * Gemini CLI is invoked with `gemini -p "prompt"` for non-interactive use.
 *
 * @module harness/gemini
 * @see {@link HarnessAdapter} - Adapter interface
 * @see {@link HarnessExecutor} - Execution engine
 *
 * ## Gemini CLI Usage
 *
 * ```bash
 * # Non-interactive mode
 * gemini -p "Add dark mode to the settings page"
 *
 * # With model selection
 * gemini --model gemini-2.0-flash -p "..."
 *
 * # With sandbox disabled for full file access
 * gemini --sandbox=none -p "..."
 * ```
 *
 * ## Output Patterns
 *
 * Gemini CLI outputs include:
 * - Progress indicators: `Analyzing...`, `Working...`
 * - File operations: `[Created] src/file.ts`
 * - Questions: `> Should I continue?`
 * - Completion: Summary of changes
 */

import type { AgentType } from '../task/types.js';
import type {
  HarnessConfig,
  HarnessOutputEventType,
} from './types.js';
import { AbstractHarnessAdapter } from './base.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Gemini CLI executable name
 */
const GEMINI_COMMAND = 'gemini';

/**
 * Default Gemini CLI arguments
 */
const DEFAULT_ARGS = [
  '--sandbox=none',    // Full file system access
];

/**
 * Pattern for Gemini questions
 */
const QUESTION_PATTERN = /^>\s*(.+\?)\s*$/m;

/**
 * Pattern for file operations
 */
const FILE_OP_PATTERN = /^\[(Created|Modified|Deleted|Updated)\]\s+(.+)$/m;

/**
 * Pattern for progress indicators
 */
const PROGRESS_PATTERN = /^(Analyzing|Working|Generating|Reading|Writing)\.\.\./m;

/**
 * Patterns for completion
 */
const COMPLETION_PATTERNS = [
  /^Done\.?$/im,
  /^Complete\.?$/im,
  /^Finished\.?$/im,
  /^Task completed/im,
  /^Changes applied/im,
];

/**
 * Pattern for errors
 */
const ERROR_PATTERN = /^Error:\s+(.+)$/m;

// ============================================================================
// GeminiAdapter Class
// ============================================================================

/**
 * Gemini CLI adapter
 *
 * Implements the HarnessAdapter interface for Gemini CLI.
 *
 * @example
 * ```typescript
 * const adapter = new GeminiAdapter();
 *
 * const config = adapter.buildConfig(
 *   'Add dark mode',
 *   '/workspace/my-project',
 *   300000
 * );
 *
 * // config.command = 'gemini'
 * // config.args = ['--sandbox=none', '-p', 'Add dark mode']
 * ```
 */
export class GeminiAdapter extends AbstractHarnessAdapter {
  /**
   * Agent type this adapter handles
   */
  readonly agent: AgentType = 'gemini';

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
    return {
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
      },
      cwd: workspacePath,
      timeoutMs,
    };
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
   * Gemini-specific question pattern: `> Should I continue?`
   */
  protected getAdapterQuestionPattern(): RegExp {
    return QUESTION_PATTERN;
  }

  /**
   * Gemini extends base question detection with choose/select/pick patterns
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
   * Extract file operations from output
   *
   * Parses Gemini output to find which files were modified.
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
 * Global Gemini adapter instance
 */
export const geminiAdapter = new GeminiAdapter();

/**
 * Get the Gemini adapter singleton
 */
export function getGeminiAdapter(): GeminiAdapter {
  return geminiAdapter;
}
