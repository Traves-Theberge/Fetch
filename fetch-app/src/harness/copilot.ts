/**
 * @fileoverview GitHub Copilot CLI harness adapter
 *
 * Implements the HarnessAdapter interface for GitHub Copilot CLI.
 * Copilot CLI is invoked via `gh copilot suggest` or `gh copilot explain`.
 *
 * @module harness/copilot
 * @see {@link HarnessAdapter} - Adapter interface
 * @see {@link HarnessExecutor} - Execution engine
 *
 * ## Copilot CLI Usage
 *
 * ```bash
 * # Suggest code changes
 * gh copilot suggest "Add dark mode to the settings page"
 *
 * # Explain code
 * gh copilot explain "What does this function do?"
 *
 * # Get shell command suggestions
 * gh copilot suggest -t shell "find large files"
 * ```
 *
 * ## Output Patterns
 *
 * Copilot CLI outputs include:
 * - Suggestions: `Suggestion: ...`
 * - Explanations: `Explanation: ...`
 * - Commands: `$ command`
 * - Completion: End of output
 *
 * ## Limitations
 *
 * Note: GitHub Copilot CLI is primarily a suggestion/explanation tool,
 * not a direct code modification tool like Claude Code. It may require
 * additional processing to apply suggestions.
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
 * Copilot CLI command (via GitHub CLI extension)
 */
const COPILOT_COMMAND = 'gh';

/**
 * Default Copilot CLI arguments
 */
const DEFAULT_ARGS = [
  'copilot',
  'suggest',
  '-t', 'code',  // Target type: code suggestions
];

/**
 * Pattern for suggestions
 */
const SUGGESTION_PATTERN = /^Suggestion:\s*(.+)$/m;

/**
 * Pattern for explanations
 */
const EXPLANATION_PATTERN = /^Explanation:\s*(.+)$/m;

/**
 * Pattern for code blocks
 */
const CODE_BLOCK_PATTERN = /```[\w]*\n([\s\S]+?)```/g;

/**
 * Pattern for questions/prompts
 */
const QUESTION_PATTERN = /^(?:>|→)\s*(.+\?)\s*$/m;

/**
 * Patterns for completion
 */
const COMPLETION_PATTERNS = [
  /^Done\.?$/im,
  /^Suggestion complete/im,
  /^Here's my suggestion/im,
];

/**
 * Pattern for errors
 */
const ERROR_PATTERN = /^(?:Error|Failed):\s+(.+)$/im;

// ============================================================================
// CopilotAdapter Class
// ============================================================================

/**
 * GitHub Copilot CLI adapter
 *
 * Implements the HarnessAdapter interface for GitHub Copilot CLI.
 * Note that Copilot CLI works differently than Claude Code - it provides
 * suggestions rather than direct file modifications.
 *
 * @example
 * ```typescript
 * const adapter = new CopilotAdapter();
 *
 * const config = adapter.buildConfig(
 *   'Add dark mode',
 *   '/workspace/my-project',
 *   300000
 * );
 *
 * // config.command = 'gh'
 * // config.args = ['copilot', 'suggest', '-t', 'code', 'Add dark mode']
 * ```
 */
export class CopilotAdapter implements HarnessAdapter {
  /**
   * Agent type this adapter handles
   */
  readonly agent: AgentType = 'copilot';

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
      command: COPILOT_COMMAND,
      args: [
        ...DEFAULT_ARGS,
        goal,
      ],
      env: {
        // Ensure non-interactive environment
        CI: 'true',
        TERM: 'dumb',
        // GitHub CLI should be authenticated already
        GH_NO_UPDATE_NOTIFIER: '1',
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

    // Check for suggestions (progress indicator)
    if (SUGGESTION_PATTERN.test(line)) {
      return 'progress';
    }

    // Check for explanations (progress indicator)
    if (EXPLANATION_PATTERN.test(line)) {
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
   * Detect if Copilot is asking a question
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

      // Selection prompt
      if (/\[1\]|\[2\]|choose|select/i.test(line)) {
        return line.trim();
      }

      // Confirmation prompt
      if (/confirm|continue|proceed/i.test(line)) {
        return line.trim();
      }
    }

    return null;
  }

  /**
   * Format user response for Copilot stdin
   *
   * @param response - User's response
   * @returns Formatted response with newline
   */
  formatResponse(response: string): string {
    // Copilot expects responses followed by newline
    return response.trim() + '\n';
  }

  /**
   * Extract suggestions from Copilot output
   *
   * Parses Copilot output to find code suggestions.
   *
   * @param output - Full output buffer
   * @returns Array of suggestions
   */
  extractSuggestions(output: string): string[] {
    const suggestions: string[] = [];

    // Extract from suggestion patterns
    const suggestionMatches = output.matchAll(/Suggestion:\s*(.+)/gim);
    for (const match of suggestionMatches) {
      suggestions.push(match[1].trim());
    }

    // Extract code blocks
    const codeMatches = output.matchAll(CODE_BLOCK_PATTERN);
    for (const match of codeMatches) {
      suggestions.push(match[1].trim());
    }

    return suggestions;
  }

  /**
   * Extract shell commands from Copilot output
   *
   * @param output - Full output buffer
   * @returns Array of suggested commands
   */
  extractCommands(output: string): string[] {
    const commands: string[] = [];

    const matches = output.matchAll(/^\$\s+(.+)$/gm);
    for (const match of matches) {
      commands.push(match[1].trim());
    }

    return commands;
  }

  /**
   * Extract summary from Copilot output
   *
   * Attempts to find a completion summary in the output.
   *
   * @param output - Full output buffer
   * @returns Summary text or default message
   */
  extractSummary(output: string): string {
    // Look for explicit suggestion/explanation
    const suggestionMatch = output.match(SUGGESTION_PATTERN);
    if (suggestionMatch) {
      return suggestionMatch[1].trim();
    }

    const explanationMatch = output.match(EXPLANATION_PATTERN);
    if (explanationMatch) {
      return explanationMatch[1].trim();
    }

    // Look for code blocks and summarize
    const codeBlocks = this.extractSuggestions(output);
    if (codeBlocks.length > 0) {
      return `Generated ${codeBlocks.length} code suggestion(s).`;
    }

    // Look for commands
    const commands = this.extractCommands(output);
    if (commands.length > 0) {
      return `Suggested command: ${commands[0]}`;
    }

    // Extract last meaningful paragraph
    const paragraphs = output
      .split(/\n\n+/)
      .filter((p) => p.trim().length > 20);

    if (paragraphs.length > 0) {
      return paragraphs[paragraphs.length - 1].trim().substring(0, 500);
    }

    return 'Suggestion generated.';
  }

  /**
   * Build config for explanation mode
   *
   * @param code - Code to explain
   * @param workspacePath - Working directory
   * @param timeoutMs - Execution timeout
   * @returns Harness configuration
   */
  buildExplainConfig(
    code: string,
    workspacePath: string,
    timeoutMs: number
  ): HarnessConfig {
    return {
      command: COPILOT_COMMAND,
      args: [
        'copilot',
        'explain',
        code,
      ],
      env: {
        CI: 'true',
        TERM: 'dumb',
        GH_NO_UPDATE_NOTIFIER: '1',
      },
      cwd: workspacePath,
      timeoutMs,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global Copilot adapter instance
 */
export const copilotAdapter = new CopilotAdapter();

/**
 * Get the Copilot adapter singleton
 */
export function getCopilotAdapter(): CopilotAdapter {
  return copilotAdapter;
}
