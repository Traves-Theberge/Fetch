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
  HarnessAdapter,
  HarnessConfig,
  HarnessOutputEventType,
} from './types.js';

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
export class GeminiAdapter implements HarnessAdapter {
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
   * Detect if Gemini is asking a question
   *
   * @param output - Recent output buffer
   * @returns Question text if detected, null otherwise
   */
  detectQuestion(output: string): string | null {
    const match = output.match(QUESTION_PATTERN);
    if (match) {
      return match[1].trim();
    }

    // Check for common question patterns in last lines
    const lines = output.trim().split('\n');
    const lastLines = lines.slice(-3);

    for (const line of lastLines) {
      // Direct question
      if (line.trim().endsWith('?')) {
        return line.trim();
      }

      // Yes/No prompt
      if (/\[y\/n\]/i.test(line) || /\(yes\/no\)/i.test(line)) {
        return line.trim();
      }

      // Continue prompt
      if (/continue\?|proceed\?|confirm/i.test(line)) {
        return line.trim();
      }

      // Selection prompt
      if (/choose|select|pick|which/i.test(line) && line.includes('?')) {
        return line.trim();
      }
    }

    return null;
  }

  /**
   * Format user response for Gemini stdin
   *
   * @param response - User's response
   * @returns Formatted response with newline
   */
  formatResponse(response: string): string {
    // Gemini expects responses followed by newline
    return response.trim() + '\n';
  }

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
   * Extract summary from Gemini output
   *
   * Attempts to find a completion summary in the output.
   *
   * @param output - Full output buffer
   * @returns Summary text or default message
   */
  extractSummary(output: string): string {
    // Look for explicit summary section
    const summaryMatch = output.match(/##?\s*Summary\s*\n([\s\S]+?)(?=\n##|$)/i);
    if (summaryMatch) {
      return summaryMatch[1].trim();
    }

    // Look for "Done" or "Complete" message with context
    const doneMatch = output.match(/(Done|Complete|Finished)[.:!]?\s*(.+)?$/im);
    if (doneMatch && doneMatch[2]) {
      return doneMatch[2].trim();
    }

    // Extract last meaningful paragraph
    const paragraphs = output
      .split(/\n\n+/)
      .filter((p) => p.trim().length > 20)
      .filter((p) => !PROGRESS_PATTERN.test(p));

    if (paragraphs.length > 0) {
      return paragraphs[paragraphs.length - 1].trim().substring(0, 500);
    }

    return 'Task completed.';
  }
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
