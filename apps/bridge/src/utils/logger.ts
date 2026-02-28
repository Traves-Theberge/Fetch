/**
 * @fileoverview Terminal logger with level filtering and structured payload support.
 *
 * Writes colored, timestamped logs and supports `LOG_LEVEL` filtering.
 *
 * @module utils/logger
 */

// =============================================================================
// TYPES
// =============================================================================

/** Supported log levels. */
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success' | 'message';

// =============================================================================
// ANSI COLORS
// =============================================================================

/** ANSI color codes used by log output helpers. */
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  
  // Text colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/** Display configuration by log level. */
const levelConfig: Record<LogLevel, { icon: string; color: string; label: string }> = {
  debug:   { icon: '🔍', color: colors.gray,    label: 'DEBUG' },
  info:    { icon: '📘', color: colors.blue,    label: 'INFO ' },
  warn:    { icon: '⚠️ ', color: colors.yellow,  label: 'WARN ' },
  error:   { icon: '❌', color: colors.red,     label: 'ERROR' },
  success: { icon: '✅', color: colors.green,   label: 'OK   ' },
  message: { icon: '💬', color: colors.cyan,    label: 'MSG  ' },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Formats current time as `HH:MM:SS`. */
function formatTime(): string {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  const s = now.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatData(data: unknown): string {
  if (data === undefined || data === null) return '';
  
  if (typeof data === 'string') {
    return data;
  }
  
  if (data instanceof Error) {
    return data.message;
  }
  
  try {
    const str = JSON.stringify(data, null, 2);
    // Keep it compact if short
    if (str.length < 80) {
      return JSON.stringify(data);
    }
    return '\n' + str;
  } catch {
    return String(data);
  }
}

/** Numeric severity for filtering (higher = more severe) */
const SEVERITY: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  success: 1,  // same as info
  message: 1,  // same as info
};

/** Read LOG_LEVEL lazily so test overrides work */
function getMinSeverity(): number {
  return SEVERITY[process.env.LOG_LEVEL || 'debug'] ?? 0;
}

function log(level: LogLevel, message: string, data?: unknown): void {
  // Level gate — skip messages below the configured threshold
  if ((SEVERITY[level] ?? 0) < getMinSeverity()) return;

  const config = levelConfig[level];
  const time = formatTime();
  const dataStr = formatData(data);
  
  // Build the log line
  const timePart = `${colors.dim}${time}${colors.reset}`;
  const levelPart = `${config.color}${config.icon}${colors.reset}`;
  const messagePart = message;
  const dataPart = dataStr ? `${colors.dim}${dataStr}${colors.reset}` : '';
  
  const output = `${timePart} ${levelPart} ${messagePart}${dataPart ? ' ' + dataPart : ''}`;
  
  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

/** Prints a formatted section banner to stdout. */
function section(title: string): void {
  const line = '─'.repeat(48);
  console.log(`\n${colors.cyan}┌${line}┐${colors.reset}`);
  console.log(`${colors.cyan}│${colors.reset} ${colors.bold}${title.padEnd(46)}${colors.reset} ${colors.cyan}│${colors.reset}`);
  console.log(`${colors.cyan}└${line}┘${colors.reset}`);
}

/** Prints a horizontal divider line. */
function divider(): void {
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
}

export const logger = {
  debug: (message: string, data?: unknown) => log('debug', message, data),
  info: (message: string, data?: unknown) => log('info', message, data),
  warn: (message: string, data?: unknown) => log('warn', message, data),
  error: (message: string, data?: unknown) => log('error', message, data),
  success: (message: string, data?: unknown) => log('success', message, data),
  message: (message: string, data?: unknown) => log('message', message, data),
  
  // Utilities
  section,
  divider,
};
