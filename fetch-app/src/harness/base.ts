/**
 * @fileoverview Abstract Harness Adapter Base Class
 *
 * Provides default implementations for shared adapter behavior.
 * All concrete adapters (Claude, Gemini, Copilot) extend this class
 * and override only what differs.
 *
 * Shared logic extracted here:
 * - formatResponse(): Identical across all adapters
 * - detectQuestion(): Common question-detection patterns
 * - extractSummary(): Shared summary-extraction structure
 *
 * @module harness/base
 * @see {@link HarnessAdapter} - Adapter interface
 */

import type { AgentType } from '../task/types.js';
import type {
  HarnessAdapter,
  HarnessConfig,
  HarnessOutputEventType,
  FileOperations,
} from './types.js';

// =============================================================================
// Common question-detection patterns
// =============================================================================

/** Direct question (ends with ?) */
const QUESTION_SUFFIX = /\?\s*$/;

/** Yes/No prompt */
const YES_NO_PATTERN = /\[y\/n\]/i;

/** Parenthetical yes/no */
const PAREN_YES_NO = /\(yes\/no\)/i;

/** Continue/proceed/confirm prompt */
const CONTINUE_PATTERN = /continue\?|proceed\?|confirm/i;

// =============================================================================
// Abstract Base Class
// =============================================================================

/**
 * Abstract base class for harness adapters.
 *
 * Provides default implementations for common behavior.
 * Subclasses must implement:
 * - `agent` — readonly agent type
 * - `buildConfig()` — CLI-specific configuration
 * - `parseOutputLine()` — Output event detection
 * - `extractFileOperations()` — File operation parsing
 *
 * Subclasses may override:
 * - `detectQuestion()` — Add adapter-specific question patterns
 * - `extractSummary()` — Change summary extraction logic
 * - `formatResponse()` — Change stdin formatting
 * - `getAdapterQuestionPattern()` — Primary question regex
 * - `getProgressPattern()` — Progress regex for summary extraction
 */
export abstract class AbstractHarnessAdapter implements HarnessAdapter {
  abstract readonly agent: AgentType;

  abstract buildConfig(
    goal: string,
    workspacePath: string,
    timeoutMs: number
  ): HarnessConfig;

  abstract parseOutputLine(line: string): HarnessOutputEventType | null;

  abstract extractFileOperations(output: string): FileOperations;

  // ===========================================================================
  // Default: formatResponse (identical in all adapters)
  // ===========================================================================

  /**
   * Format user response for harness stdin.
   * Default: trim + newline. All current adapters use this.
   */
  formatResponse(response: string): string {
    return response.trim() + '\n';
  }

  // ===========================================================================
  // Default: detectQuestion (shared core + overridable pattern)
  // ===========================================================================

  /**
   * Primary question regex for this adapter.
   * Override in subclass if the CLI has a specific prompt format.
   * Return null to skip the primary-pattern check.
   */
  protected getAdapterQuestionPattern(): RegExp | null {
    return null;
  }

  /**
   * Detect if the harness is asking a question.
   *
   * 1. Check adapter-specific primary pattern
   * 2. Scan last 3 output lines for common question indicators
   *
   * Subclasses can override entirely or call `super.detectQuestion()`
   * and add extra checks.
   */
  detectQuestion(output: string): string | null {
    // 1. Adapter-specific primary pattern
    const primary = this.getAdapterQuestionPattern();
    if (primary) {
      const match = output.match(primary);
      if (match) return (match[1] ?? match[0]).trim();
    }

    // 2. Scan last 3 lines for common patterns
    const lines = output.trim().split('\n');
    const tail = lines.slice(-3);

    for (const line of tail) {
      const trimmed = line.trim();

      if (QUESTION_SUFFIX.test(trimmed)) return trimmed;
      if (YES_NO_PATTERN.test(trimmed)) return trimmed;
      if (PAREN_YES_NO.test(trimmed)) return trimmed;
      if (CONTINUE_PATTERN.test(trimmed)) return trimmed;
    }

    return null;
  }

  // ===========================================================================
  // Default: extractSummary (shared structure)
  // ===========================================================================

  /**
   * Progress indicator regex used to filter paragraphs in summary extraction.
   * Override in subclass.
   */
  protected getProgressPattern(): RegExp | null {
    return null;
  }

  /**
   * Extract a summary from harness output.
   *
   * Strategy:
   * 1. Look for explicit `## Summary` section
   * 2. Look for "Done/Complete/Finished" with trailing text
   * 3. Take last meaningful paragraph (>20 chars, not a progress line)
   * 4. Fallback: "Task completed."
   */
  extractSummary(output: string): string {
    // 1. Explicit summary section
    const summaryMatch = output.match(/##?\s*Summary\s*\n([\s\S]+?)(?=\n##|$)/i);
    if (summaryMatch) return summaryMatch[1].trim();

    // 2. Done/Complete/Finished message with trailing content
    const doneMatch = output.match(/(Done|Complete|Finished)[.:!]?\s*(.+)?$/im);
    if (doneMatch?.[2]) return doneMatch[2].trim();

    // 3. Last meaningful paragraph
    const progress = this.getProgressPattern();
    const paragraphs = output
      .split(/\n\n+/)
      .filter(p => p.trim().length > 20)
      .filter(p => !progress || !progress.test(p));

    if (paragraphs.length > 0) {
      return paragraphs[paragraphs.length - 1].trim().substring(0, 500);
    }

    return 'Task completed.';
  }
}
