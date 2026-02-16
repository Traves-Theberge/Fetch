/**
 * @fileoverview Intent classification and response-policy helpers for conversational UX.
 *
 * @module agent/response-policy
 */
import type { Session } from '../session/types.js';

/** Intent classes used to tune prompt mode and deterministic response paths. */
export type ResponseIntent =
  | 'greeting'
  | 'capability_summary'
  | 'tool_inventory'
  | 'status'
  | 'action_request'
  | 'general';

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
 * Classify a user message into a coarse conversational intent.
 */
export function classifyIntent(message: string): ResponseIntent {
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

  if (/\b(create|build|fix|run|test|deploy|commit|push|open|search|workflow|cron|task|file|folder|workspace|browser|app)\b/i.test(text)) {
    return 'action_request';
  }

  return 'general';
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
