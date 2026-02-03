/**
 * @fileoverview Harness output stream parser
 *
 * Parses streaming output from harness processes to extract
 * meaningful events like progress updates, questions, and completion.
 *
 * @module harness/output-parser
 * @see {@link HarnessExecutor} - Uses this for output processing
 * @see {@link ClaudeAdapter} - Agent-specific parsing
 *
 * ## Overview
 *
 * The OutputParser:
 * - Buffers streaming output
 * - Detects line boundaries
 * - Identifies special patterns (questions, progress, errors)
 * - Extracts file operations
 * - Generates structured events
 *
 * ## Usage
 *
 * ```typescript
 * const parser = new OutputParser();
 *
 * parser.on('line', (line) => console.log(line));
 * parser.on('question', (q) => console.log('Question:', q));
 * parser.on('progress', (msg) => console.log('Progress:', msg));
 *
 * // Feed data as it arrives
 * parser.write(chunk1);
 * parser.write(chunk2);
 *
 * // Flush remaining buffer
 * parser.flush();
 * ```
 */

import { EventEmitter } from 'events';
import stripAnsi from 'strip-ansi';
import type { AgentType } from '../task/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Parser event types
 */
export type ParserEventType =
  | 'line'        // Complete line received
  | 'question'    // Question detected
  | 'progress'    // Progress update
  | 'file_op'     // File operation detected
  | 'error'       // Error pattern detected
  | 'complete';   // Completion detected

/**
 * File operation type
 */
export type FileOperation = 'create' | 'modify' | 'delete';

/**
 * File operation event
 */
export interface FileOperationEvent {
  operation: FileOperation;
  path: string;
}

/**
 * Progress event
 */
export interface ProgressEvent {
  message: string;
  percent?: number;
}

/**
 * Parser configuration
 */
export interface ParserConfig {
  /** Strip ANSI escape codes */
  stripAnsi: boolean;
  /** Maximum line length before forcing a break */
  maxLineLength: number;
  /** Agent type for specific parsing rules */
  agent?: AgentType;
}

/**
 * Default parser configuration
 */
const DEFAULT_CONFIG: ParserConfig = {
  stripAnsi: true,
  maxLineLength: 10000,
};

// ============================================================================
// Common Patterns
// ============================================================================

/**
 * Patterns that indicate a question
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
 * Patterns that indicate progress
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
 * Patterns that indicate file operations
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
 * Patterns that indicate errors
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
 * Patterns that indicate completion
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
 * Streaming output parser
 *
 * Parses harness output streams to extract structured events.
 *
 * @example
 * ```typescript
 * const parser = new OutputParser({ agent: 'claude' });
 *
 * parser.on('question', ({ question }) => {
 *   console.log('Question detected:', question);
 * });
 *
 * parser.on('file_op', ({ operation, path }) => {
 *   console.log(`${operation}: ${path}`);
 * });
 *
 * process.stdout.on('data', (chunk) => parser.write(chunk));
 * process.on('exit', () => parser.flush());
 * ```
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
   * Create a new output parser
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
   * Write data to the parser
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
   * Flush any remaining buffer content
   *
   * Call this when the stream ends to process any remaining data.
   */
  flush(): void {
    if (this.buffer.trim()) {
      this.processLine(this.buffer.trim());
    }
    this.buffer = '';
  }

  /**
   * Reset the parser state
   */
  reset(): void {
    this.buffer = '';
    this.lines = [];
    this.fileOps = [];
    this.completed = false;
  }

  /**
   * Get all collected lines
   *
   * @returns Array of complete lines
   */
  getLines(): string[] {
    return [...this.lines];
  }

  /**
   * Get full output as string
   *
   * @returns All output joined with newlines
   */
  getOutput(): string {
    return this.lines.join('\n');
  }

  /**
   * Get detected file operations
   *
   * @returns Array of file operations
   */
  getFileOperations(): FileOperationEvent[] {
    return [...this.fileOps];
  }

  /**
   * Check if completion was detected
   *
   * @returns True if completion pattern was found
   */
  isCompleted(): boolean {
    return this.completed;
  }

  /**
   * Find question in recent output
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
   * Process buffer for complete lines
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
   * Process a single complete line
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
   * Check for question patterns
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
   * Check for progress patterns
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
   * Check for file operation patterns
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
   * Check for error patterns
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
   * Check for completion patterns
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
 * Extract summary from parsed output
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
 * Create parser for a specific agent
 *
 * @param agent - Agent type
 * @returns Configured parser
 */
export function createParser(agent: AgentType): OutputParser {
  return new OutputParser({ agent, stripAnsi: true });
}
