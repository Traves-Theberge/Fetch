/**
 * @fileoverview Harness adapter for OpenAI Codex CLI.
 *
 * Uses JSONL output mode for structured event parsing.
 *
 * @module harness/codex
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
 * Codex CLI executable.
 */
const CODEX_COMMAND = 'codex';

/**
 * Base args for headless non-interactive execution.
 */
const DEFAULT_ARGS = [
  'exec',           // Non-interactive execution subcommand
  '--json',         // JSON Lines output on stdout
  '--ephemeral',    // Don't persist session files
  '--full-auto',    // Auto-approve all actions (workspace-write + no prompts)
];

/**
 * JSONL marker: turn completed.
 */
const TURN_COMPLETED_PATTERN = /"type"\s*:\s*"turn\.completed"/;

/**
 * JSONL marker: turn failed.
 */
const TURN_FAILED_PATTERN = /"type"\s*:\s*"turn\.failed"/;

/**
 * JSONL marker: item lifecycle events.
 */
const ITEM_PATTERN = /"type"\s*:\s*"item\.(started|completed|updated)"/;

/**
 * JSONL marker: file change item.
 */
const FILE_CHANGE_PATTERN = /"type"\s*:\s*"file_change"/;

/**
 * JSONL marker: stream error event.
 */
const ERROR_PATTERN = /"type"\s*:\s*"error"/;

/**
 * Fallback file operation pattern for plain text output.
 */
const FILE_EDIT_PATTERN = /^(Edited|Created|Deleted|Modified|Wrote)\s+(.+)$/m;

// ============================================================================
// CodexAdapter Class
// ============================================================================

/**
 * Adapter for Codex CLI behavior and JSONL output parsing.
 */
export class CodexAdapter extends AbstractHarnessAdapter {
  /**
   * Agent type handled by this adapter.
   */
  readonly agent: AgentType = 'codex';

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
      command: CODEX_COMMAND,
      args: [
        ...DEFAULT_ARGS,
        '--skip-git-repo-check', // Allow running in non-git dirs (e.g. /workspace root)
      ],
      env: {
        // Ensure non-interactive environment
        CI: 'true',
        TERM: 'dumb',
        // API key auth (priority: Codex -> OpenAI)
        // If no keys are present, Codex CLI will use its local session (subscription)
        ...(env.CODEX_API_KEY ? { CODEX_API_KEY: env.CODEX_API_KEY } : {}),
        ...(env.OPENAI_API_KEY ? { OPENAI_API_KEY: env.OPENAI_API_KEY } : {}),
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
   * Parses one output line into a harness event type.
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
   * Codex runs in full-auto mode and does not emit interactive prompts.
   */
  protected getAdapterQuestionPattern(): RegExp | null {
    return null; // --full-auto mode auto-approves everything
  }

  // formatResponse() inherited from AbstractHarnessAdapter

  /**
   * Extracts file operations from JSONL, with plain-text fallback.
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
   * Extracts a summary from JSONL agent messages with base fallback.
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
   * Progress matcher used by base summary extractor.
   */
  protected getProgressPattern(): RegExp {
    return ITEM_PATTERN;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton Codex adapter.
 */
export const codexAdapter = new CodexAdapter();
