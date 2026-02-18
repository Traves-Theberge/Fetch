/**
 * @fileoverview Intent classification and response-policy helpers for conversational UX.
 *
 * @module agent/response-policy
 */
import type { Session } from '../session/types.js';
import { ToolInputSchemas } from '../validation/tools.js';

/** Intent classes used to tune prompt mode and deterministic response paths. */
export type ResponseIntent =
  | 'greeting'
  | 'capability_summary'
  | 'tool_inventory'
  | 'status'
  | 'action_request'
  | 'general';

export interface IntentGateDecision {
  intent: ResponseIntent;
  stage: 'deterministic' | 'heuristic';
}

export type ResponseDetail = 'brief' | 'standard' | 'deep';
export type ResponseTone = 'direct' | 'conversational';
export type EmojiLevel = 'low' | 'normal';

export interface ResponsePreferences {
  detail: ResponseDetail;
  tone: ResponseTone;
  emoji: EmojiLevel;
}

export const DEFAULT_RESPONSE_PREFERENCES: ResponsePreferences = {
  detail: 'standard',
  tone: 'conversational',
  emoji: 'normal',
};

/**
 * Stage 1 intent gate: deterministic patterns for high-confidence categories.
 */
function deterministicIntent(message: string): ResponseIntent | null {
  const text = message.trim().toLowerCase();
  if (!text) return 'general';

  if (/^(hi|hello|hey|yo|sup|thanks|thank you)[!.]*$/i.test(text)) return 'greeting';

  if (/^what can you do[?.!]*$/i.test(text) || /\b(capabilities|what are you)\b/i.test(text)) {
    return 'capability_summary';
  }

  if (
    /what tools do you have[?.!]*$/i.test(text) ||
    /show (me )?(all )?(tools|commands)/i.test(text) ||
    /(full|complete) (tool|command) list/i.test(text) ||
    /^list (tools|commands)[?.!]*$/i.test(text)
  ) {
    return 'tool_inventory';
  }

  if (/^(status|progress|update)\b/i.test(text) || /^how.*going[?.!]*$/i.test(text)) {
    return 'status';
  }

  return null;
}

/**
 * Stage 2 intent gate: broader heuristic classification for action requests.
 */
function heuristicIntent(message: string): ResponseIntent {
  const text = message.trim().toLowerCase();
  if (!text) return 'general';

  if (/\b(create|build|fix|make|change|update|modify|run|test|deploy|commit|push|open|search|workflow|cron|task|file|folder|workspace|browser|app|publish|sync|codex|claude|copilot|gemini|opencode)\b/i.test(text)) {
    return 'action_request';
  }

  return 'general';
}

/**
 * Two-stage intent gate used by core agent runtime.
 */
export function evaluateIntentGate(message: string): IntentGateDecision {
  const deterministic = deterministicIntent(message);
  if (deterministic) {
    return { intent: deterministic, stage: 'deterministic' };
  }
  return { intent: heuristicIntent(message), stage: 'heuristic' };
}

/**
 * Classify a user message into a coarse conversational intent.
 */
export function classifyIntent(message: string): ResponseIntent {
  return evaluateIntentGate(message).intent;
}

/**
 * Decide whether this intent should default to minimal prompt mode.
 */
export function shouldUseMinimalMode(intent: ResponseIntent): boolean {
  return intent !== 'action_request';
}

/**
 * Lightweight output constraints used by prompt shaping and tests.
 */
export function buildOutputConstraints(intent: ResponseIntent): string {
  switch (intent) {
    case 'greeting':
      return '2-3 lines, warm greeting, one actionable next step.';
    case 'capability_summary':
      return '4-8 lines, concise capability summary, end with one immediate action option.';
    case 'tool_inventory':
      return 'Grouped bullet list, scannable categories, avoid dense paragraphs.';
    case 'status':
      return '2-6 lines, factual status first, next action second.';
    case 'action_request':
      return 'Action-first execution response with progress/result.';
    default:
      return 'Concise, clear, and WhatsApp-friendly.';
  }
}

/**
 * Whether the user explicitly requested exhaustive commands/tools.
 */
export function wantsFullInventory(message: string): boolean {
  const text = message.trim().toLowerCase();
  return (
    /(full|complete) (tool|command) list/.test(text) ||
    /all (tools|commands)/.test(text) ||
    /^\/help$/.test(text)
  );
}

function existingToolSet(): Set<string> {
  return new Set(Object.keys(ToolInputSchemas));
}

function addByPrefix(out: Set<string>, available: Set<string>, prefix: string): void {
  for (const name of available) {
    if (name.startsWith(prefix)) out.add(name);
  }
}

/**
 * Select a narrowed tool subset for this turn.
 *
 * This keeps conversational turns lightweight while preserving full capability
 * on clear action requests.
 */
export function selectToolNamesForTurn(
  message: string,
  intent: ResponseIntent,
  session?: Session
): string[] {
  const text = message.trim().toLowerCase();
  const available = existingToolSet();
  const out = new Set<string>();

  const add = (name: string): void => {
    if (available.has(name)) out.add(name);
  };

  if (session?.activeTaskId) {
    add('task_status');
    add('task_cancel');
    add('task_respond');
  }

  if (intent === 'greeting' || intent === 'capability_summary' || intent === 'tool_inventory') {
    return [];
  }

  if (intent === 'status') {
    add('workspace_status');
    add('task_status');
    add('github_action_status');
    return Array.from(out);
  }

  // Generic, low-risk fallback set for ambiguous asks.
  if (intent === 'general') {
    add('workspace_status');
    add('ask_user');
    return Array.from(out);
  }

  // action_request
  add('ask_user');
  add('report_progress');

  if (/\b(workspace|project|repo|directory|folder|file|next|nextjs|react)\b/.test(text)) {
    addByPrefix(out, available, 'workspace_');
    add('file_delete');
    add('folder_delete');
  }

  if (/\b(task|delegate|implement|refactor|bug|fix|use codex|use claude|use copilot|use gemini)\b/.test(text)) {
    addByPrefix(out, available, 'task_');
  }

  if (/\b(github|git|commit|push|pull request|pr|issue|branch|sync|publish|ci|workflow status|actions?)\b/.test(text)) {
    addByPrefix(out, available, 'github_');
    add('workspace_sync');
    add('workspace_publish');
    add('workspace_status');
  }

  if (/\b(web|search|research|docs|documentation|lookup|look up)\b/.test(text)) {
    addByPrefix(out, available, 'web_');
  }

  if (/\b(browser|navigate|open page|screenshot|click|ui test|playwright)\b/.test(text)) {
    addByPrefix(out, available, 'browser_');
    add('browser_test');
  }

  if (/\b(workflow|cron|schedule|nightly|automation|app run|app test|run tests?)\b/.test(text)) {
    addByPrefix(out, available, 'workflow_');
    addByPrefix(out, available, 'cron_');
    add('app_run');
    add('app_test');
    add('browser_test');
  }

  // If no category matched, keep core execution tools available.
  if (out.size <= 2) {
    add('workspace_status');
    add('task_create');
    add('task_status');
  }

  return Array.from(out);
}

/**
 * Read persisted response preferences from session metadata.
 */
export function getResponsePreferences(session: Session): ResponsePreferences {
  const raw = (session.metadata?.responsePreferences ?? {}) as Partial<ResponsePreferences>;
  return {
    detail: raw.detail === 'brief' || raw.detail === 'deep' ? raw.detail : DEFAULT_RESPONSE_PREFERENCES.detail,
    tone: raw.tone === 'direct' ? 'direct' : DEFAULT_RESPONSE_PREFERENCES.tone,
    emoji: raw.emoji === 'low' ? 'low' : DEFAULT_RESPONSE_PREFERENCES.emoji,
  };
}

/**
 * Parse natural-language preference updates from a user message.
 */
export function parsePreferenceUpdate(message: string): Partial<ResponsePreferences> | null {
  const text = message.trim().toLowerCase();
  if (!text) return null;

  const updates: Partial<ResponsePreferences> = {};

  if (/(be|more|keep|make).*(brief|short|concise)/.test(text)) updates.detail = 'brief';
  if (/(be|more|keep|make).*(detailed|deep|verbose)/.test(text)) updates.detail = 'deep';
  if (/(normal|standard) (detail|verbosity|responses)/.test(text)) updates.detail = 'standard';

  if (/(be|more|keep).*(direct|straight to the point)/.test(text)) updates.tone = 'direct';
  if (/(be|more|keep).*(conversational|personal)/.test(text)) updates.tone = 'conversational';

  if (/(less|fewer|no).*(emoji|emojis)/.test(text)) updates.emoji = 'low';
  if (/(more|use).*(emoji|emojis)/.test(text)) updates.emoji = 'normal';

  return Object.keys(updates).length > 0 ? updates : null;
}
