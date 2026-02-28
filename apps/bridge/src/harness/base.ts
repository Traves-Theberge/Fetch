/**
 * @fileoverview Base adapter implementation shared by all harness CLIs.
 *
 * Provides defaults for:
 * - stdin response formatting
 * - generic question detection
 * - summary extraction from raw output
 *
 * Concrete adapters override command/config and any parser specifics.
 *
 * @module harness/base
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

/** Direct question (line ends with `?`). */
const QUESTION_SUFFIX = /\?\s*$/;

/** Bracket yes/no prompt. */
const YES_NO_PATTERN = /\[y\/n\]/i;

/** Parenthetical yes/no prompt. */
const PAREN_YES_NO = /\(yes\/no\)/i;

/** Continue/proceed/confirm prompt variants. */
const CONTINUE_PATTERN = /continue\?|proceed\?|confirm/i;

// =============================================================================
// Abstract Base Class
// =============================================================================

/**
 * Base class for harness adapters.
 *
 * Required in subclasses:
 * - agent identifier
 * - process config builder
 * - line-level event parser
 * - file operation extractor
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
   * Formats user input for stdin writes.
   * Default behavior trims and appends a trailing newline.
   */
  formatResponse(response: string): string {
    return response.trim() + '\n';
  }

  // ===========================================================================
  // Default: detectQuestion (shared core + overridable pattern)
  // ===========================================================================

  /**
   * Adapter-specific question regex.
   * Return `null` to skip adapter-specific matching.
   */
  protected getAdapterQuestionPattern(): RegExp | null {
    return null;
  }

  /**
   * Detects whether recent harness output is asking for user input.
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
   * Optional progress regex used to exclude noisy paragraphs in summaries.
   */
  protected getProgressPattern(): RegExp | null {
    return null;
  }

  /**
   * Extracts a short summary from harness output using fallback heuristics.
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
