/**
 * @fileoverview WhatsApp-Friendly Formatting Utilities
 * 
 * Provides formatting functions optimized for mobile WhatsApp display.
 * Handles code blocks, diffs, errors, and progress indicators with
 * appropriate truncation and emoji enhancement.
 * 
 * @module agent/whatsapp-format
 * @see {@link formatForWhatsApp} - General text formatting
 * @see {@link formatCode} - Code block formatting
 * @see {@link formatDiff} - Git diff formatting
 * @see {@link formatError} - Error message formatting
 * 
 * ## Design Principles
 * 
 * - **Readability**: Short lines (50 chars max) for mobile screens
 * - **Clarity**: Emoji indicators for quick visual scanning
 * - **Brevity**: Truncate long content with "... N more" indicators
 * - **WhatsApp Compatible**: Use WhatsApp markdown (* for bold, ` for code)
 * 
 * ## Formatting Limits
 * 
 * | Content Type | Max Lines | Max Line Length |
 * |--------------|-----------|-----------------|
 * | General text | Unlimited | 50 chars |
 * | Code blocks | 15 lines | Full width |
 * | Diffs | 20 lines | Full width |
 * | Errors | 1 line | 200 chars |
 * 
 * @example
 * ```typescript
 * import { formatCode, formatDiff, formatError } from './whatsapp-format.js';
 * 
 * // Format code with truncation
 * formatCode(longCode, 'typescript');
 * // → ```typescript\n...\n```\n_... 50 more lines_
 * 
 * // Format diff with emoji
 * formatDiff(gitDiff);
 * // → 🟢 added line\n🔴 removed line
 * 
 * // Format error cleanly
 * formatError(new Error('ENOENT: file not found'));
 * // → ❌ 📁 file not found
 * ```
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Maximum characters per line for comfortable mobile reading.
 * @constant {number}
 */
const MAX_LINE_LENGTH = 50;

/**
 * Maximum lines to show in code blocks before truncating.
 * @constant {number}
 */
const MAX_CODE_LINES = 15;

/**
 * Maximum lines to show in diff output before truncating.
 * @constant {number}
 */
const MAX_DIFF_LINES = 20;

// =============================================================================
// TEXT FORMATTING
// =============================================================================

/**
 * Formats text for WhatsApp display.
 * 
 * Converts markdown headers to emoji-prefixed bold text and
 * wraps long lines for mobile readability.
 * 
 * @param {string} text - Raw text to format
 * @returns {string} WhatsApp-formatted text
 * 
 * @example
 * ```typescript
 * formatForWhatsApp('# Title\n## Section\nLong content...');
 * // → 🔷 *Title*\n📋 *Section*\nLong content...
 * ```
 */
export function formatForWhatsApp(text: string): string {
  // Replace markdown headers with emoji
  let formatted = text
    .replace(/^### (.+)$/gm, '📌 *$1*')
    .replace(/^## (.+)$/gm, '📋 *$1*')
    .replace(/^# (.+)$/gm, '🔷 *$1*');
  
  // Wrap long lines
  formatted = wrapLongLines(formatted, MAX_LINE_LENGTH);
  
  return formatted;
}

// =============================================================================
// CODE FORMATTING
// =============================================================================

/**
 * Formats a code block for mobile display.
 * 
 * Wraps code in markdown fences and truncates if too long,
 * showing remaining line count.
 * 
 * @param {string} code - Source code to format
 * @param {string} [language] - Language for syntax highlighting hint
 * @param {number} [maxLines=MAX_CODE_LINES] - Maximum lines before truncation
 * @returns {string} Formatted code block
 * 
 * @example
 * ```typescript
 * formatCode('const x = 1;\nconst y = 2;', 'typescript');
 * // → ```typescript\nconst x = 1;\nconst y = 2;\n```
 * 
 * // Long code gets truncated
 * formatCode(fiftyLineCode, 'js', 10);
 * // → ```js\n..first 10 lines..\n```\n_... 40 more lines_
 * ```
 */
export function formatCode(
  code: string, 
  language?: string,
  maxLines: number = MAX_CODE_LINES
): string {
  const lines = code.split('\n');
  
  if (lines.length <= maxLines) {
    return '```' + (language || '') + '\n' + code + '\n```';
  }
  
  const truncated = lines.slice(0, maxLines).join('\n');
  const remaining = lines.length - maxLines;
  
  return '```' + (language || '') + '\n' + truncated + '\n```\n_... ' + remaining + ' more lines_';
}

// =============================================================================
// DIFF FORMATTING
// =============================================================================

/**
 * Formats a git diff for WhatsApp display.
 * 
 * Replaces +/- prefix with colored emoji circles:
 * - 🟢 for added lines
 * - 🔴 for removed lines
 * - 📄 for file headers
 * - 📍 for line number markers
 * 
 * @param {string} diff - Raw git diff output
 * @returns {string} Emoji-enhanced diff
 * 
 * @example
 * ```typescript
 * formatDiff('+added\n-removed');
 * // → 🟢 added\n🔴 removed
 * 
 * formatDiff('--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@');
 * // → 📄 a/file.ts\n📄 b/file.ts\n📍 Lines 1
 * ```
 */
export function formatDiff(diff: string): string {
  const lines = diff.split('\n');
  const formatted: string[] = [];
  let lineCount = 0;
  
  for (const line of lines) {
    if (lineCount >= MAX_DIFF_LINES) {
      formatted.push(`_... ${lines.length - lineCount} more changes_`);
      break;
    }
    
    if (line.startsWith('+++') || line.startsWith('---')) {
      // File headers
      formatted.push('📄 ' + line.slice(4));
    } else if (line.startsWith('+')) {
      // Added line
      formatted.push('🟢 ' + line.slice(1));
    } else if (line.startsWith('-')) {
      // Removed line
      formatted.push('🔴 ' + line.slice(1));
    } else if (line.startsWith('@@')) {
      // Hunk header - simplify
      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (match) {
        formatted.push(`📍 Lines ${match[2]}`);
      }
    } else if (line.trim()) {
      // Context line
      formatted.push('   ' + line);
    }
    
    lineCount++;
  }
  
  return formatted.join('\n');
}

/**
 * Formats a compact inline diff (no context lines).
 * 
 * Shows just old → new transformation for quick approval review.
 * 
 * @param {string} filePath - File being edited
 * @param {string} oldText - Text being replaced
 * @param {string} newText - Replacement text
 * @returns {string} Compact diff display
 * 
 * @example
 * ```typescript
 * formatCompactDiff('src/app.ts', 'recieve', 'receive');
 * // → 📝 *app.ts*
 * //   🔴 `recieve`
 * //   🟢 `receive`
 * ```
 */
export function formatCompactDiff(
  filePath: string,
  oldText: string,
  newText: string
): string {
  const parts = [`📝 *${getFileName(filePath)}*`, ''];
  
  // Simple diff display
  if (oldText && newText) {
    parts.push('🔴 `' + truncateLine(oldText, 40) + '`');
    parts.push('🟢 `' + truncateLine(newText, 40) + '`');
  } else if (newText) {
    parts.push('🟢 Adding: `' + truncateLine(newText, 40) + '`');
  } else if (oldText) {
    parts.push('🔴 Removing: `' + truncateLine(oldText, 40) + '`');
  }
  
  return parts.join('\n');
}

// =============================================================================
// ERROR FORMATTING
// =============================================================================

/**
 * Formats an error message for mobile display.
 * 
 * Cleans up common error prefixes, adds appropriate emoji,
 * and truncates long messages.
 * 
 * @param {string|Error} error - Error to format
 * @returns {string} Clean error message with emoji prefix
 * 
 * @example
 * ```typescript
 * formatError(new Error('ENOENT: no such file'));
 * // → ❌ 📁 no such file
 * 
 * formatError('EACCES: permission denied');
 * // → ❌ 🔒 permission denied
 * 
 * formatError('Command failed: npm test');
 * // → ❌ ❌ npm test
 * ```
 */
export function formatError(error: string | Error): string {
  const message = error instanceof Error ? error.message : error;
  
  // Clean up common error prefixes
  let clean = message
    .replace(/^Error: /, '')
    .replace(/^ENOENT: /, '📁 ')
    .replace(/^EACCES: /, '🔒 ')
    .replace(/^ETIMEDOUT: /, '⏱️ ')
    .replace(/^Command failed: /, '❌ ');
  
  // Truncate very long errors
  if (clean.length > 200) {
    clean = clean.substring(0, 200) + '...';
  }
  
  // Don't show stack traces
  clean = clean.split('\n')[0];
  
  return '❌ ' + clean;
}

// =============================================================================
// LIST FORMATTING
// =============================================================================

/**
 * Formats a file list with bullet points.
 * 
 * Shows file names (not full paths) with truncation indicator.
 * 
 * @param {string[]} files - Array of file paths
 * @param {number} [maxShow=10] - Maximum files to display
 * @returns {string} Bullet-pointed file list
 * 
 * @example
 * ```typescript
 * formatFileList(['src/app.ts', 'src/utils.ts', 'package.json']);
 * // → • app.ts\n• utils.ts\n• package.json
 * 
 * formatFileList(fiftyFiles, 5);
 * // → • file1.ts\n• ...\n_... and 45 more_
 * ```
 */
export function formatFileList(files: string[], maxShow: number = 10): string {
  if (files.length === 0) {
    return '_No files_';
  }
  
  const shown = files.slice(0, maxShow).map(f => '• ' + getFileName(f));
  
  if (files.length > maxShow) {
    shown.push(`_... and ${files.length - maxShow} more_`);
  }
  
  return shown.join('\n');
}

// =============================================================================
// PROGRESS FORMATTING
// =============================================================================

/**
 * Formats a progress bar for task tracking.
 * 
 * Uses block characters for a visual progress indicator.
 * 
 * @param {number} current - Current step number
 * @param {number} total - Total steps
 * @returns {string} Visual progress bar with fraction
 * 
 * @example
 * ```typescript
 * formatProgressBar(3, 10);
 * // → ▓▓▓░░░░░░░ 3/10
 * 
 * formatProgressBar(10, 10);
 * // → ▓▓▓▓▓▓▓▓▓▓ 10/10
 * ```
 */
export function formatProgressBar(current: number, total: number): string {
  const filled = Math.round((current / total) * 10);
  const empty = 10 - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty) + ` ${current}/${total}`;
}

// =============================================================================
// TOOL ACTION FORMATTING
// =============================================================================

/**
 * Formats a tool action for user display.
 * 
 * Creates a concise, emoji-prefixed description of what tool
 * is being executed and with what key argument.
 * 
 * @param {string} tool - Tool name
 * @param {Record<string, unknown>} args - Tool arguments
 * @returns {string} Formatted action description
 * 
 * @example
 * ```typescript
 * formatToolAction('read_file', { path: 'src/app.ts' });
 * // → 📖 Reading app.ts
 * 
 * formatToolAction('run_command', { command: 'npm test' });
 * // → ⚡ Running `npm test`
 * 
 * formatToolAction('git_commit', { message: 'Fix bug in login' });
 * // → 💾 Committing: "Fix bug in login"
 * ```
 */
export function formatToolAction(tool: string, args: Record<string, unknown>): string {
  const emoji = getToolEmoji(tool);
  
  switch (tool) {
    case 'read_file':
      return `${emoji} Reading ${getFileName(args.path as string)}`;
    case 'write_file':
      return `${emoji} Writing ${getFileName(args.path as string)}`;
    case 'edit_file':
      return `${emoji} Editing ${getFileName(args.path as string)}`;
    case 'list_directory':
      return `${emoji} Listing ${args.path || '.'}`;
    case 'search_files':
      return `${emoji} Searching for "${args.pattern}"`;
    case 'run_command':
      return `${emoji} Running \`${truncateLine(args.command as string, 30)}\``;
    case 'git_commit':
      return `${emoji} Committing: "${truncateLine(args.message as string, 30)}"`;
    default:
      return `${emoji} ${tool}`;
  }
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Wraps long lines at word boundaries.
 * 
 * Preserves code-like lines (starting with space/tab or containing backticks).
 * 
 * @param {string} text - Text to wrap
 * @param {number} maxLength - Maximum line length
 * @returns {string} Word-wrapped text
 * @private
 */
function wrapLongLines(text: string, maxLength: number): string {
  return text.split('\n').map(line => {
    if (line.length <= maxLength || line.startsWith('```')) {
      return line;
    }
    
    // Don't wrap code-like lines
    if (line.includes('`') || line.startsWith(' ') || line.startsWith('\t')) {
      return line;
    }
    
    // Word wrap
    const words = line.split(' ');
    const lines: string[] = [];
    let current = '';
    
    for (const word of words) {
      if ((current + ' ' + word).trim().length > maxLength) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (current) lines.push(current);
    
    return lines.join('\n');
  }).join('\n');
}

/**
 * Extracts filename from a path.
 * 
 * @param {string} path - Full file path
 * @returns {string} Just the filename
 * @private
 */
function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

/**
 * Truncates a line to max length with ellipsis.
 * 
 * Also normalizes newlines to spaces.
 * 
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 * @private
 */
function truncateLine(text: string, maxLength: number): string {
  const clean = text.replace(/\n/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return clean.substring(0, maxLength - 3) + '...';
}

/**
 * Returns the appropriate emoji for a tool.
 * 
 * @param {string} tool - Tool name
 * @returns {string} Emoji character
 * @private
 */
function getToolEmoji(tool: string): string {
  const emojis: Record<string, string> = {
    'read_file': '📖',
    'write_file': '📝',
    'edit_file': '✏️',
    'search_files': '🔍',
    'search_code': '🔎',
    'list_directory': '📂',
    'repo_map': '🗺️',
    'find_definition': '🎯',
    'find_references': '🔗',
    'run_command': '⚡',
    'run_tests': '🧪',
    'run_lint': '✨',
    'git_status': '📊',
    'git_diff': '📋',
    'git_commit': '💾',
    'git_log': '📜',
  };
  return emojis[tool] || '🔧';
}
