/**
 * @fileoverview Claude Code CLI harness adapter
 *
 * Implements the HarnessAdapter interface for Claude Code CLI.
 * Claude Code is invoked with `claude --print -p "prompt"` for non-interactive use.
 *
 * @module harness/claude
 * @see {@link HarnessAdapter} - Adapter interface
 * @see {@link HarnessExecutor} - Execution engine
 *
 * ## Claude CLI Usage
 *
 * ```bash
 * # Non-interactive mode (--print avoids TUI, -p for prompt)
 * claude --print -p "Add dark mode to the settings page"
 *
 * # With allowed tools
 * claude --print --allowedTools "Edit,Write,Read" -p "..."
 *
 * # Resume conversation
 * claude --print --resume -p "..."
 * ```
 *
 * ## Output Patterns
 *
 * Claude CLI outputs include:
 * - Progress indicators: `⠋ Working...`
 * - File operations: `Edited src/file.ts`
 * - Questions: `? Do you want to...`
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
 * Claude CLI executable name
 */
const CLAUDE_COMMAND = 'claude';

/**
 * Default Claude CLI arguments
 */
const DEFAULT_ARGS = [
  '--print',           // Non-interactive mode (no TUI)
  '--dangerously-skip-permissions', // Skip permission prompts
];

/**
 * Pattern for Claude questions
 */
const QUESTION_PATTERN = /^\s*\?\s+(.+)/m;

/**
 * Pattern for file edit operations
 */
const FILE_EDIT_PATTERN = /^(Edited|Created|Deleted|Modified)\s+(.+)$/m;

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
// ClaudeAdapter Class
// ============================================================================

/**
 * Claude Code CLI adapter
 *
 * Implements the HarnessAdapter interface for Claude Code.
 *
 * @example
 * ```typescript
 * const adapter = new ClaudeAdapter();
 *
 * const config = adapter.buildConfig(
 *   'Add dark mode',
 *   '/workspace/my-project',
 *   300000
 * );
 *
 * // config.command = 'claude'
 * // config.args = ['--print', '-p', 'Add dark mode']
 * ```
 */
export class ClaudeAdapter implements HarnessAdapter {
  /**
   * Agent type this adapter handles
   */
  readonly agent: AgentType = 'claude';

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
   * Detect if Claude is asking a question
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
    }

    return null;
  }

  /**
   * Format user response for Claude stdin
   *
   * @param response - User's response
   * @returns Formatted response with newline
   */
  formatResponse(response: string): string {
    // Claude expects responses followed by newline
    return response.trim() + '\n';
  }

  /**
   * Extract file operations from output
   *
   * Parses Claude output to find which files were modified.
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
   * Extract summary from Claude output
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

    // Look for "Done" message with context
    const doneMatch = output.match(/Done[.:!]?\s*(.+)?$/im);
    if (doneMatch && doneMatch[1]) {
      return doneMatch[1].trim();
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
 * Global Claude adapter instance
 */
export const claudeAdapter = new ClaudeAdapter();

/**
 * Get the Claude adapter singleton
 */
export function getClaudeAdapter(): ClaudeAdapter {
  return claudeAdapter;
}
