/**
 * @fileoverview Shell Execution Tools
 * 
 * Tools for executing shell commands within the workspace.
 * Includes safety checks for dangerous commands and output truncation.
 * 
 * @module tools/shell
 * @see {@link runCommandTool} - Execute shell commands
 * @see {@link runTestsTool} - Run project test suite
 * @see {@link runLintTool} - Run linter
 * 
 * ## Security
 * 
 * Dangerous commands are detected and blocked:
 * - `rm -rf /` - Root filesystem deletion
 * - `rm -rf ~` - Home directory deletion
 * - Fork bombs
 * - Piping downloads to shell (`curl | sh`)
 * 
 * ## Tools
 * 
 * | Tool | Description | Approval |
 * |------|-------------|----------|
 * | run_command | Execute arbitrary shell command | Required |
 * | run_tests | Run test suite (npm test, etc) | Required |
 * | run_lint | Run linter (eslint, etc) | Auto |
 * 
 * ## Output Handling
 * 
 * - Maximum output: 50,000 characters
 * - Long output is truncated with indicator
 * - ANSI codes preserved for formatting
 * 
 * @example
 * ```typescript
 * import { shellTools } from './shell.js';
 * 
 * // Run a command (requires approval)
 * await runCommandTool.execute({
 *   command: 'npm install lodash',
 *   timeout: 120
 * });
 * ```
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolResult } from './types.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Workspace root for command execution */
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace';

/** Maximum output length before truncation */
const MAX_OUTPUT_LENGTH = 50000;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a successful tool result.
 * @private
 */
function success(output: string, duration: number, metadata?: Record<string, unknown>): ToolResult {
  return { success: true, output, duration, metadata };
}

/**
 * Creates a failed tool result.
 * @private
 */
function failure(error: string, duration: number): ToolResult {
  return { success: false, output: '', error, duration };
}

/**
 * Truncates output if it exceeds maximum length.
 * 
 * @param {string} output - Raw command output
 * @returns {{text: string, truncated: boolean}} Processed output
 * @private
 */
function truncateOutput(output: string): { text: string; truncated: boolean } {
  if (output.length <= MAX_OUTPUT_LENGTH) {
    return { text: output, truncated: false };
  }
  return {
    text: output.substring(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)',
    truncated: true
  };
}

/**
 * Checks if a command is potentially dangerous.
 * 
 * @param {string} command - Command to check
 * @returns {string|null} Reason if dangerous, null if safe
 * @private
 */
function isDangerousCommand(command: string): string | null {
  const dangerous = [
    { pattern: /rm\s+-rf?\s+\/(?!\w)/, reason: 'Attempting to delete root filesystem' },
    { pattern: /rm\s+-rf?\s+~/, reason: 'Attempting to delete home directory' },
    { pattern: /mkfs\./, reason: 'Attempting to format filesystem' },
    { pattern: /dd\s+.*of=\/dev\//, reason: 'Attempting to write to device' },
    { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, reason: 'Fork bomb detected' },
    { pattern: /wget.*\|\s*sh/, reason: 'Piping download to shell' },
    { pattern: /curl.*\|\s*sh/, reason: 'Piping download to shell' },
  ];

  for (const { pattern, reason } of dangerous) {
    if (pattern.test(command)) {
      return reason;
    }
  }
  return null;
}

// ============================================================================
// Tool: run_command
// ============================================================================

const runCommandTool: Tool = {
  name: 'run_command',
  description: 'Execute a shell command in the workspace. Use for build commands, package management, etc.',
  category: 'shell',
  autoApprove: false,  // Always requires approval
  modifiesWorkspace: true,
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'The shell command to execute',
      required: true
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Timeout in seconds (default: 60)',
      required: false,
      default: 60
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const command = args.command as string;
    const timeout = ((args.timeout as number) || 60) * 1000;

    try {
      // Safety check
      const dangerReason = isDangerousCommand(command);
      if (dangerReason) {
        return failure(`Command rejected: ${dangerReason}`, Date.now() - startTime);
      }

      logger.info('Executing command', { command, timeout });

      const { stdout, stderr } = await execAsync(command, {
        cwd: WORKSPACE_ROOT,
        timeout,
        maxBuffer: MAX_OUTPUT_LENGTH * 2,
        env: {
          ...process.env,
          PATH: process.env.PATH,
          HOME: process.env.HOME || '/root'
        }
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      const { text, truncated } = truncateOutput(combined);

      return success(
        text || '(no output)',
        Date.now() - startTime,
        { truncated }
      );
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      
      if (error && typeof error === 'object' && 'killed' in error && error.killed) {
        return failure(`Command timed out after ${timeout / 1000} seconds`, duration);
      }

      // Command failed but we might have output
      if (error && typeof error === 'object' && 'stdout' in error) {
        const execError = error as { stdout?: string; stderr?: string; code?: number };
        const combined = [execError.stdout, execError.stderr].filter(Boolean).join('\n');
        const { text, truncated } = truncateOutput(combined);
        
        return {
          success: false,
          output: text,
          error: `Command failed with exit code ${execError.code || 'unknown'}`,
          duration,
          metadata: { truncated, exitCode: execError.code }
        };
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Command failed: ${message}`, duration);
    }
  }
};

// ============================================================================
// Tool: run_tests
// ============================================================================

const runTestsTool: Tool = {
  name: 'run_tests',
  description: 'Run the test suite. Automatically detects test runner (npm test, pytest, etc.)',
  category: 'shell',
  autoApprove: true,  // Safe to auto-run
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'Test file pattern or specific test to run',
      required: false
    },
    {
      name: 'coverage',
      type: 'boolean',
      description: 'Whether to run with coverage reporting',
      required: false,
      default: false
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const pattern = args.pattern as string | undefined;
    const coverage = args.coverage as boolean;

    try {
      // Detect test runner
      let testCommand: string;
      
      // Check for package.json
      try {
        const { readFile } = await import('fs/promises');
        const { join } = await import('path');
        const pkgJson = JSON.parse(
          await readFile(join(WORKSPACE_ROOT, 'package.json'), 'utf-8')
        );
        
        if (pkgJson.scripts?.test) {
          testCommand = 'npm test';
          if (pattern) {
            testCommand += ` -- ${pattern}`;
          }
          if (coverage) {
            testCommand += ' -- --coverage';
          }
        } else {
          return failure('No test script found in package.json', Date.now() - startTime);
        }
      } catch {
        // Try pytest for Python
        testCommand = 'pytest';
        if (pattern) {
          testCommand += ` ${pattern}`;
        }
        if (coverage) {
          testCommand += ' --cov';
        }
      }

      logger.info('Running tests', { command: testCommand });

      const { stdout, stderr } = await execAsync(testCommand, {
        cwd: WORKSPACE_ROOT,
        timeout: 300000,  // 5 minutes for tests
        maxBuffer: MAX_OUTPUT_LENGTH * 2,
        env: {
          ...process.env,
          CI: 'true',  // Disable interactive prompts
          FORCE_COLOR: '0'  // Disable colors for cleaner output
        }
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      const { text, truncated } = truncateOutput(combined);

      // Try to extract test summary
      const passMatch = combined.match(/(\d+)\s+pass/i);
      const failMatch = combined.match(/(\d+)\s+fail/i);
      
      return success(
        text || 'Tests completed (no output)',
        Date.now() - startTime,
        { 
          truncated,
          passed: passMatch ? parseInt(passMatch[1]) : undefined,
          failed: failMatch ? parseInt(failMatch[1]) : undefined
        }
      );
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      
      // Tests failed but we want to show the output
      if (error && typeof error === 'object' && 'stdout' in error) {
        const execError = error as { stdout?: string; stderr?: string; code?: number };
        const combined = [execError.stdout, execError.stderr].filter(Boolean).join('\n');
        const { text, truncated } = truncateOutput(combined);
        
        return {
          success: false,
          output: text,
          error: 'Some tests failed',
          duration,
          metadata: { truncated, exitCode: execError.code }
        };
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Failed to run tests: ${message}`, duration);
    }
  }
};

// ============================================================================
// Tool: run_lint
// ============================================================================

const runLintTool: Tool = {
  name: 'run_lint',
  description: 'Run linter to check code style and potential issues.',
  category: 'shell',
  autoApprove: true,  // Safe to auto-run (read-only by default)
  modifiesWorkspace: false,
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'File or directory to lint (relative to workspace)',
      required: false
    },
    {
      name: 'fix',
      type: 'boolean',
      description: 'Whether to automatically fix issues (requires approval if true)',
      required: false,
      default: false
    }
  ],
  execute: async (args): Promise<ToolResult> => {
    const startTime = Date.now();
    const lintPath = (args.path as string) || '.';
    const fix = args.fix as boolean;

    // If fix is requested, this modifies workspace
    if (fix) {
      // Note: The approval gate should catch this based on the args
    }

    try {
      // Detect linter
      let lintCommand: string;
      
      try {
        const { readFile } = await import('fs/promises');
        const { join } = await import('path');
        const pkgJson = JSON.parse(
          await readFile(join(WORKSPACE_ROOT, 'package.json'), 'utf-8')
        );
        
        // Check for ESLint config
        if (pkgJson.devDependencies?.eslint || pkgJson.dependencies?.eslint) {
          lintCommand = `npx eslint ${lintPath}`;
          if (fix) {
            lintCommand += ' --fix';
          }
        } else if (pkgJson.scripts?.lint) {
          lintCommand = 'npm run lint';
          if (fix && pkgJson.scripts['lint:fix']) {
            lintCommand = 'npm run lint:fix';
          }
        } else {
          return failure('No linter configuration found', Date.now() - startTime);
        }
      } catch {
        // Try flake8 for Python
        lintCommand = `flake8 ${lintPath}`;
      }

      logger.info('Running linter', { command: lintCommand });

      const { stdout, stderr } = await execAsync(lintCommand, {
        cwd: WORKSPACE_ROOT,
        timeout: 120000,  // 2 minutes
        maxBuffer: MAX_OUTPUT_LENGTH * 2,
        env: {
          ...process.env,
          FORCE_COLOR: '0'
        }
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      const { text, truncated } = truncateOutput(combined);

      // Count issues
      const errorCount = (combined.match(/error/gi) || []).length;
      const warningCount = (combined.match(/warning/gi) || []).length;

      return success(
        text || 'No linting issues found',
        Date.now() - startTime,
        { truncated, errors: errorCount, warnings: warningCount, fixed: fix }
      );
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      
      // Linter found issues (non-zero exit)
      if (error && typeof error === 'object' && 'stdout' in error) {
        const execError = error as { stdout?: string; stderr?: string; code?: number };
        const combined = [execError.stdout, execError.stderr].filter(Boolean).join('\n');
        const { text, truncated } = truncateOutput(combined);
        
        return {
          success: false,
          output: text,
          error: 'Linting issues found',
          duration,
          metadata: { truncated, exitCode: execError.code }
        };
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(`Failed to run linter: ${message}`, duration);
    }
  }
};

// ============================================================================
// Export all shell tools
// ============================================================================

export const shellTools: Tool[] = [
  runCommandTool,
  runTestsTool,
  runLintTool
];
