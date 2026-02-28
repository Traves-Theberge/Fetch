/**
 * @fileoverview Streaming parser for harness stdout/stderr text.
 *
 * Emits structured events for questions, progress, file ops, errors, and completion.
 *
 * @module harness/output-parser
 */

import { EventEmitter } from 'events';
import stripAnsi from 'strip-ansi';

// ============================================================================
// Types
// ============================================================================

/**
 * Event types emitted by `OutputParser`.
 */
export type ParserEventType =
  | 'line'        // Complete line received
  | 'question'    // Question detected
  | 'progress'    // Progress update
  | 'file_op'     // File operation detected
  | 'error'       // Error pattern detected
  | 'complete';   // Completion detected

/**
 * File operation categories parsed from output text.
 */
export type FileOperation = 'create' | 'modify' | 'delete';

/**
 * Parsed file operation event payload.
 */
export interface FileOperationEvent {
  operation: FileOperation;
  path: string;
}

/**
 * Parsed progress event payload.
 */
export interface ProgressEvent {
  message: string;
  percent?: number;
}

/**
 * Parser runtime configuration.
 */
export interface ParserConfig {
  /** Strip ANSI escape codes */
  stripAnsi: boolean;
  /** Maximum line length before forcing a break */
  maxLineLength: number;
}

/**
 * Default parser settings.
 */
const DEFAULT_CONFIG: ParserConfig = {
  stripAnsi: true,
  maxLineLength: 10000,
};

// ============================================================================
// Common Patterns
// ============================================================================

/**
 * Patterns used to identify user-input prompts.
 */
const QUESTION_PATTERNS = [
  /^\s*\?\s+(.+)/,              // ? prefix
  /^(.+\?)\s*$/,                // Ends with ?
  /\[y\/n\]/i,                  // [Y/n]
  /\(yes\/no\)/i,               // (yes/no)
  /press enter to continue/i,   // Press enter
  /continue\?\s*$/i,            // Continue?
  /proceed\?\s*$/i,             // Proceed?
  /confirm\?\s*$/i,             // Confirm?
];

/**
 * Patterns used to identify progress output.
 */
const PROGRESS_PATTERNS = [
  /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*(.+)$/,     // Spinner
  /^\[[\s=>#-]+\]\s*(\d+)%/,    // Progress bar [=====>   ] 50%
  /^(\d+)%\s+complete/i,        // 50% complete
  /^Working on\s+(.+)/i,        // Working on...
  /^Processing\s+(.+)/i,        // Processing...
  /^Analyzing\s+(.+)/i,         // Analyzing...
];

/**
 * Patterns used to identify file operation lines.
 */
const FILE_OP_PATTERNS: Array<{ pattern: RegExp; operation: FileOperation }> = [
  { pattern: /^Created?\s+(.+)$/i, operation: 'create' },
  { pattern: /^Wrote\s+(.+)$/i, operation: 'create' },
  { pattern: /^Edited?\s+(.+)$/i, operation: 'modify' },
  { pattern: /^Modified?\s+(.+)$/i, operation: 'modify' },
  { pattern: /^Updated?\s+(.+)$/i, operation: 'modify' },
  { pattern: /^Deleted?\s+(.+)$/i, operation: 'delete' },
  { pattern: /^Removed?\s+(.+)$/i, operation: 'delete' },
];

/**
 * Patterns used to identify error lines.
 */
const ERROR_PATTERNS = [
  /^error:/i,
  /^Error:/,
  /^ERROR:/,
  /^fatal:/i,
  /^FATAL:/,
  /failed to/i,
  /permission denied/i,
  /not found/i,
  /does not exist/i,
];

/**
 * Patterns used to identify completion lines.
 */
const COMPLETION_PATTERNS = [
  /^Done\.?$/i,
  /^Completed\.?$/i,
  /^Finished\.?$/i,
  /^Task completed/i,
  /^All done/i,
  /^Successfully/i,
];

// ============================================================================
// OutputParser Class
// ============================================================================

/**
 * Parses line-oriented harness output and emits structured events.
 */
export class OutputParser extends EventEmitter {
  /** Parser configuration */
  private config: ParserConfig;

  /** Line buffer */
  private buffer: string = '';

  /** All complete lines received */
  private lines: string[] = [];

  /** Detected file operations */
  private fileOps: FileOperationEvent[] = [];

  /** Whether completion was detected */
  private completed: boolean = false;

  /**
   * Creates a parser with optional config overrides.
   *
   * @param config - Parser configuration
   */
  constructor(config: Partial<ParserConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Appends stream data and processes complete lines.
   *
   * @param data - Data to parse (string or Buffer)
   */
  write(data: string | Buffer): void {
    let text = typeof data === 'string' ? data : data.toString('utf-8');

    // Strip ANSI codes if configured
    if (this.config.stripAnsi) {
      text = stripAnsi(text);
    }

    // Add to buffer
    this.buffer += text;

    // Process complete lines
    this.processBuffer();
  }

  /**
   * Processes any buffered trailing content.
   */
  flush(): void {
    if (this.buffer.trim()) {
      this.processLine(this.buffer.trim());
    }
    this.buffer = '';
  }

  /**
   * Clears all parser state.
   */
  reset(): void {
    this.buffer = '';
    this.lines = [];
    this.fileOps = [];
    this.completed = false;
  }

  /**
   * Returns all parsed lines.
   *
   * @returns Array of complete lines
   */
  getLines(): string[] {
    return [...this.lines];
  }

  /**
   * Returns collected output as one string.
   *
   * @returns All output joined with newlines
   */
  getOutput(): string {
    return this.lines.join('\n');
  }

  /**
   * Returns parsed file operation events.
   *
   * @returns Array of file operations
   */
  getFileOperations(): FileOperationEvent[] {
    return [...this.fileOps];
  }

  /**
   * Returns true when completion text has been seen.
   *
   * @returns True if completion pattern was found
   */
  isCompleted(): boolean {
    return this.completed;
  }

  /**
   * Returns the most recent detected question, if any.
   *
   * @returns Question text if found, null otherwise
   */
  findQuestion(): string | null {
    // Check last few lines for question patterns
    const recentLines = this.lines.slice(-5);

    for (const line of recentLines.reverse()) {
      for (const pattern of QUESTION_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          return match[1]?.trim() || line.trim();
        }
      }
    }

    return null;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Splits buffered text into complete lines and processes each.
   */
  private processBuffer(): void {
    // Split on newlines
    const parts = this.buffer.split(/\r?\n/);

    // Process all complete lines (all but the last part)
    for (let i = 0; i < parts.length - 1; i++) {
      const line = parts[i];
      if (line || line === '') {
        this.processLine(line);
      }
    }

    // Keep the incomplete last part in buffer
    this.buffer = parts[parts.length - 1];

    // Force line break if buffer too long
    if (this.buffer.length > this.config.maxLineLength) {
      this.processLine(this.buffer);
      this.buffer = '';
    }
  }

  /**
   * Stores and classifies one complete output line.
   */
  private processLine(line: string): void {
    // Store line
    this.lines.push(line);

    // Emit line event
    this.emit('line', line);

    // Check for patterns
    this.checkQuestion(line);
    this.checkProgress(line);
    this.checkFileOp(line);
    this.checkError(line);
    this.checkCompletion(line);
  }

  /**
   * Emits `question` when line matches a question pattern.
   */
  private checkQuestion(line: string): void {
    for (const pattern of QUESTION_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const question = match[1]?.trim() || line.trim();
        this.emit('question', { question });
        return;
      }
    }
  }

  /**
   * Emits `progress` when line matches a progress pattern.
   */
  private checkProgress(line: string): void {
    for (const pattern of PROGRESS_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const event: ProgressEvent = {
          message: match[1]?.trim() || line.trim(),
        };

        // Try to extract percentage
        const percentMatch = line.match(/(\d+)%/);
        if (percentMatch) {
          event.percent = parseInt(percentMatch[1], 10);
        }

        this.emit('progress', event);
        return;
      }
    }
  }

  /**
   * Emits `file_op` when line matches a file operation pattern.
   */
  private checkFileOp(line: string): void {
    for (const { pattern, operation } of FILE_OP_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const event: FileOperationEvent = {
          operation,
          path: match[1].trim(),
        };

        this.fileOps.push(event);
        this.emit('file_op', event);
        return;
      }
    }
  }

  /**
   * Emits `error` when line matches an error pattern.
   */
  private checkError(line: string): void {
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(line)) {
        this.emit('error', { message: line.trim() });
        return;
      }
    }
  }

  /**
   * Marks parser completed and emits `complete` when matched.
   */
  private checkCompletion(line: string): void {
    for (const pattern of COMPLETION_PATTERNS) {
      if (pattern.test(line)) {
        this.completed = true;
        this.emit('complete', { message: line.trim() });
        return;
      }
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extracts a summary string from parser output lines.
 *
 * @param parser - Parser with collected output
 * @returns Summary string
 */
export function extractSummary(parser: OutputParser): string {
  const lines = parser.getLines();

  // Look for explicit summary
  const summaryIndex = lines.findIndex((l) => /^##?\s*summary/i.test(l));
  if (summaryIndex >= 0) {
    const summaryLines: string[] = [];
    for (let i = summaryIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith('#')) break;
      if (lines[i].trim()) summaryLines.push(lines[i]);
    }
    if (summaryLines.length > 0) {
      return summaryLines.join('\n').trim().substring(0, 500);
    }
  }

  // Use last meaningful paragraph
  const output = parser.getOutput();
  const paragraphs = output
    .split(/\n\n+/)
    .filter((p) => p.trim().length > 20);

  if (paragraphs.length > 0) {
    return paragraphs[paragraphs.length - 1].trim().substring(0, 500);
  }

  return 'Task completed.';
}

/**
 * Creates an output parser with default recommended config.
 *
 * @returns Configured parser with ANSI stripping enabled
 */
export function createParser(): OutputParser {
  return new OutputParser({ stripAnsi: true });
}
