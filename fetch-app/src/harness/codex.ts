/**
 * @fileoverview OpenAI Codex CLI harness adapter
 *
 * Implements the HarnessAdapter interface for OpenAI Codex CLI.
 * Codex is a Rust-based open-source coding agent invoked with
 * `codex exec --json --ephemeral --full-auto "prompt"`.
 *
 * @module harness/codex
 * @see {@link HarnessAdapter} - Adapter interface
 * @see {@link HarnessExecutor} - Execution engine
 *
 * ## Codex CLI Usage
 *
 * ```bash
 * # Non-interactive headless mode (JSON Lines output)
 * codex exec --json --ephemeral --full-auto "Add dark mode to the settings page"
 *
 * # With model override
 * codex exec --json --ephemeral --full-auto --model o4-mini "..."
 * ```
 *
 * ## Output Format (JSON Lines on stdout)
 *
 * Each line is a JSON object with a `type` field:
 * - `thread.started` — Session created
 * - `turn.started` / `turn.completed` / `turn.failed` — Execution lifecycle
 * - `item.started` / `item.updated` / `item.completed` — Granular actions
 *   Item types: agent_message, reasoning, command, file_change, plan
 * - `error` — Stream-level error
 *
 * stderr receives progress/debug info; stdout receives only the final
 * agent message in default mode, or JSONL events with --json.
 *
 * ## Authentication
 *
 * Two auth methods (both supported):
 * 1. **ChatGPT OAuth** — `codex login` on host, tokens cached in `~/.codex/auth.json`
 *    (mounted read-only into kennel container). Uses ChatGPT Plus/Team quota.
 *    For headless hosts: `codex login --device-auth`
 * 2. **API Key** — Set `CODEX_API_KEY` or `OPENAI_API_KEY` env var.
 *    Uses standard OpenAI API billing.
 */

import type { AgentType } from '../task/types.js';
import { env } from '../config/env.js';
import {
  KENNEL_CONTAINER,
  type HarnessConfig,
  type HarnessOutputEventType,
} from './types.js';
import { AbstractHarnessAdapter } from './base.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Codex CLI executable name
 */
const CODEX_COMMAND = 'codex';

/**
 * Default Codex CLI arguments for headless execution
 */
const DEFAULT_ARGS = [
  'exec',           // Non-interactive execution subcommand
  '--json',         // JSON Lines output on stdout
  '--ephemeral',    // Don't persist session files
  '--full-auto',    // Auto-approve all actions (workspace-write + no prompts)
];

/**
 * Pattern for Codex JSONL turn completion
 */
const TURN_COMPLETED_PATTERN = /"type"\s*:\s*"turn\.completed"/;

/**
 * Pattern for Codex JSONL turn failure
 */
const TURN_FAILED_PATTERN = /"type"\s*:\s*"turn\.failed"/;

/**
 * Pattern for Codex JSONL item events (progress)
 */
const ITEM_PATTERN = /"type"\s*:\s*"item\.(started|completed|updated)"/;

/**
 * Pattern for file_change item type
 */
const FILE_CHANGE_PATTERN = /"type"\s*:\s*"file_change"/;

/**
 * Pattern for error events
 */
const ERROR_PATTERN = /"type"\s*:\s*"error"/;

/**
 * Fallback file operation patterns (non-JSON stderr output)
 */
const FILE_EDIT_PATTERN = /^(Edited|Created|Deleted|Modified|Wrote)\s+(.+)$/m;

// ============================================================================
// CodexAdapter Class
// ============================================================================

/**
 * OpenAI Codex CLI adapter
 *
 * Implements the HarnessAdapter interface for Codex CLI.
 * Uses JSON Lines (`--json`) output for structured event parsing.
 *
 * @example
 * ```typescript
 * const adapter = new CodexAdapter();
 *
 * const config = adapter.buildConfig(
 *   'Add dark mode',
 *   '/workspace/my-project',
 *   300000
 * );
 *
 * // config.command = 'codex'
 * // config.args = ['exec', '--json', '--ephemeral', '--full-auto', 'Add dark mode']
 * ```
 */
export class CodexAdapter extends AbstractHarnessAdapter {
  /**
   * Agent type this adapter handles
   */
  readonly agent: AgentType = 'codex';

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
    const config: HarnessConfig = {
      command: CODEX_COMMAND,
      args: [
        ...DEFAULT_ARGS,
        '--skip-git-repo-check', // Allow running in non-git dirs (e.g. /workspace root)
      ],
      env: {
        // Ensure non-interactive environment
        CI: 'true',
        TERM: 'dumb',
        // API key auth (priority: Codex -> OpenAI -> OpenRouter)
        ...(env.CODEX_API_KEY ? { CODEX_API_KEY: env.CODEX_API_KEY } : {}),
        ...(env.OPENAI_API_KEY ? { OPENAI_API_KEY: env.OPENAI_API_KEY } : {}),
        // Fallback to OpenRouter if no other key is present
        ...(!env.CODEX_API_KEY && !env.OPENAI_API_KEY && env.OPENROUTER_API_KEY ? {
          OPENAI_API_KEY: env.OPENROUTER_API_KEY,
          OPENAI_BASE_URL: 'https://openrouter.ai/api/v1'
        } : {}),
      },
      cwd: workspacePath,
      timeoutMs,
      container: KENNEL_CONTAINER,
    };

    // Inject model selection if configured
    if (env.CODEX_MODEL) {
      config.args.push('--model', env.CODEX_MODEL);
    }

    // Set working directory explicitly
    config.args.push('--cd', workspacePath);

    // Goal is passed as final positional arg
    config.args.push(goal);

    return config;
  }

  /**
   * Parse output line to detect special events
   *
   * Codex with --json outputs JSON Lines. Each line is parsed
   * to detect turn lifecycle events, item progress, and errors.
   *
   * @param line - Raw output line (JSONL or stderr text)
   * @returns Event type or null
   */
  parseOutputLine(line: string): HarnessOutputEventType | null {
    // Check for turn completion (success)
    if (TURN_COMPLETED_PATTERN.test(line)) {
      return 'complete';
    }

    // Check for turn failure
    if (TURN_FAILED_PATTERN.test(line)) {
      return 'error';
    }

    // Check for stream-level error
    if (ERROR_PATTERN.test(line)) {
      return 'error';
    }

    // Check for item events (progress)
    if (ITEM_PATTERN.test(line)) {
      return 'progress';
    }

    // Fallback: check for file edit patterns in stderr/non-JSON output
    if (FILE_EDIT_PATTERN.test(line)) {
      return 'progress';
    }

    // Regular output
    return null;
  }

  /**
   * Codex-specific question pattern
   * In --full-auto mode, Codex doesn't ask questions.
   * But plan items could be interpreted as progress.
   */
  protected getAdapterQuestionPattern(): RegExp | null {
    return null; // --full-auto mode auto-approves everything
  }

  // formatResponse() inherited from AbstractHarnessAdapter

  /**
   * Extract file operations from output
   *
   * Parses Codex JSONL output to find file_change events,
   * falling back to plain text patterns.
   *
   * @param output - Full output buffer
   * @returns Object with created, modified, deleted files
   */
  extractFileOperations(output: string): {
    created: string[];
    modified: string[];
    deleted: string[];
  } {
    const created: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    const lines = output.split('\n');

    for (const line of lines) {
      // Try to parse JSONL file_change events
      if (FILE_CHANGE_PATTERN.test(line)) {
        try {
          const event = JSON.parse(line);
          const item = event.item;
          if (item?.type === 'file_change') {
            const filePath = item.file ?? item.path ?? '';
            const action = item.action ?? item.change_type ?? '';

            switch (action) {
              case 'add':
              case 'create':
                if (filePath) created.push(filePath);
                break;
              case 'delete':
              case 'remove':
                if (filePath) deleted.push(filePath);
                break;
              case 'update':
              case 'modify':
              case 'edit':
              default:
                if (filePath) modified.push(filePath);
                break;
            }
          }
        } catch {
          // JSON parse failed — skip
        }
        continue;
      }

      // Fallback: plain text file operation patterns
      const match = line.match(FILE_EDIT_PATTERN);
      if (match) {
        const [, operation, filePath] = match;
        const cleanPath = filePath.trim();

        switch (operation.toLowerCase()) {
          case 'created':
          case 'wrote':
            created.push(cleanPath);
            break;
          case 'deleted':
            deleted.push(cleanPath);
            break;
          case 'edited':
          case 'modified':
            modified.push(cleanPath);
            break;
        }
      }
    }

    return { created, modified, deleted };
  }

  /**
   * Extract summary from Codex output
   *
   * Looks for agent_message items in JSONL output,
   * then falls back to base class extraction.
   */
  extractSummary(output: string): string {
    // Try to find the last agent_message in JSONL output
    const lines = output.split('\n');

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.includes('"agent_message"') && line.includes('"item.completed"')) {
        try {
          const event = JSON.parse(line);
          const content = event.item?.content ?? event.item?.text ?? event.item?.message;
          if (content && typeof content === 'string' && content.length > 10) {
            return content.substring(0, 500);
          }
        } catch {
          // JSON parse failed — continue
        }
      }
    }

    // Fallback to base class
    return super.extractSummary(output);
  }

  /**
   * Progress pattern for summary paragraph filtering
   */
  protected getProgressPattern(): RegExp {
    return ITEM_PATTERN;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global Codex adapter instance
 */
export const codexAdapter = new CodexAdapter();
