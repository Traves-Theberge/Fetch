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
  HarnessConfig,
  HarnessOutputEventType,
} from './types.js';
import { AbstractHarnessAdapter } from './base.js';

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
  '--yolo', // Allow all tools and connections (non-interactive)
];

/**
 * Pattern for questions/prompts
 */
const QUESTION_PATTERN = /^(?:>|→)\s*(.+\?)\s*$/m;


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
export class CopilotAdapter extends AbstractHarnessAdapter {
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
        '-p',
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
      container: 'fetch-kennel',
    };
  }

  /**
   * Parse output line to detect special events
   *
   * @param line - Raw output line
   * @returns Event type or null
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parseOutputLine(_line: string): HarnessOutputEventType | null {
    // Treat everything as stdout for new CLI
    return 'stdout';
  }

  /**
   * Copilot-specific question pattern: `> or → prompt`
   */
  protected getAdapterQuestionPattern(): RegExp {
    return QUESTION_PATTERN;
  }

  /**
   * Copilot extends base question detection with selection prompts
   */
  detectQuestion(output: string): string | null {
    const base = super.detectQuestion(output);
    if (base) return base;

    // Copilot-specific: numbered selection prompts
    const lines = output.trim().split('\n');
    const tail = lines.slice(-3);
    for (const line of tail) {
      if (/\[1\]|\[2\]|choose|select/i.test(line)) {
        return line.trim();
      }
    }
    return null;
  }

  // formatResponse() inherited from AbstractHarnessAdapter

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
   * Copilot-specific: checks for suggestions, explanations, and commands
   * before falling back to the base summary extraction.
   */
  extractSummary(output: string): string {
    // Check for commands
    const commands = this.extractCommands(output);
    if (commands.length > 0) {
      return `Executed command: ${commands[0]}`;
    }

    // Fall back to base implementation
    return super.extractSummary(output);
  }

  /**
   * Extract file operations from Copilot output
   *
   * Gh-copilot doesn't perform file operations directly.
   *
   * @param _output - Full output buffer
   * @returns Object with created, modified, deleted files
   */
  extractFileOperations(_output: string): {
    created: string[];
    modified: string[];
    deleted: string[];
  } {
    return { created: [], modified: [], deleted: [] };
  }

}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global Copilot adapter instance
 */
export const copilotAdapter = new CopilotAdapter();

