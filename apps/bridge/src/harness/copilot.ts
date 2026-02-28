/**
 * @fileoverview Harness adapter for GitHub Copilot CLI.
 *
 * @module harness/copilot
 */

import type { AgentType } from '../task/types.js';
import {
  KENNEL_CONTAINER,
  type HarnessConfig,
  type HarnessOutputEventType,
} from './types.js';
import { AbstractHarnessAdapter } from './base.js';
import { env } from '../config/env.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Copilot CLI command via `gh`.
 */
const COPILOT_COMMAND = 'gh';

/**
 * Base args for Copilot execution.
 */
const DEFAULT_ARGS = [
  'copilot',
];

/**
 * Question/prompt line pattern.
 */
const QUESTION_PATTERN = /^(?:>|→)\s*(.+\?)\s*$/m;


// ============================================================================
// CopilotAdapter Class
// ============================================================================

/**
 * Adapter for Copilot CLI behavior and output parsing.
 */
export class CopilotAdapter extends AbstractHarnessAdapter {
  /**
   * Agent type handled by this adapter.
   */
  readonly agent: AgentType = 'copilot';

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
      command: COPILOT_COMMAND,
      args: [
        ...DEFAULT_ARGS,
        '--',
        '-p',
        goal,
        '--yolo', // Automatically approve all tools, paths, and URLs
      ],
      env: {
        // Ensure non-interactive environment
        CI: 'true',
        TERM: 'dumb',
        ...(env.GH_TOKEN ? { GH_TOKEN: env.GH_TOKEN } : {}),
        // Inject CLI config directory for harness-specific instructions
        COPILOT_CUSTOM_INSTRUCTIONS_DIRS: '/app/data/cli-configs',
      },
      cwd: workspacePath,
      timeoutMs,
      container: KENNEL_CONTAINER,
    };

    // Inject model selection if configured
    const copilotModel = env.COPILOT_MODEL;
    if (copilotModel) {
      // Flags after -- are passed to the underlying binary
      config.args.push('--model', copilotModel);
    }

    return config;
  }

  /**
   * Parses one output line into a harness event type.
   *
   * @param line - Raw output line
   * @returns Event type or null
   */
  parseOutputLine(_line: string): HarnessOutputEventType | null {
    // Treat everything as stdout for new CLI
    return 'stdout';
  }

  /**
   * Adapter-specific question matcher.
   */
  protected getAdapterQuestionPattern(): RegExp {
    return QUESTION_PATTERN;
  }

  /**
   * Adds Copilot-specific selection prompt detection.
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
   * Extracts suggestion lines from Copilot output.
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
   * Extracts shell command suggestions from Copilot output.
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
   * Returns a summary string, preferring parsed command output.
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
   * Returns empty file operation sets for Copilot output.
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
 * Singleton Copilot adapter.
 */
export const copilotAdapter = new CopilotAdapter();
