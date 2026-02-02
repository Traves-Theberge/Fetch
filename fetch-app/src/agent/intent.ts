/**
 * @fileoverview Intent Classification System
 * 
 * Automatically detects user intent from WhatsApp messages and routes
 * to the appropriate processing mode. This is the core routing logic
 * for Fetch's 4-mode architecture.
 * 
 * @module agent/intent
 * @see {@link ClassifiedIntent} - Return type for intent classification
 * @see {@link IntentType} - Possible intent categories
 * 
 * ## Modes
 * 
 * | Mode | Purpose | Tools | Approval |
 * |------|---------|-------|----------|
 * | conversation | Greetings, thanks, general chat | None | N/A |
 * | inquiry | Questions about code | Read-only | Auto |
 * | action | Single edits/changes | Full | One cycle |
 * | task | Complex multi-step work | Full | Per step |
 * 
 * ## Pattern Matching Strategy
 * 
 * Intent is detected using regex patterns in priority order:
 * 1. Greeting/farewell patterns → conversation
 * 2. Task patterns (build, create, refactor) → task
 * 3. Inquiry patterns (what's in, show me) → inquiry
 * 4. Action patterns (fix, add, change) → action
 * 5. Default → task (let agent figure it out)
 * 
 * @example
 * ```typescript
 * import { classifyIntent } from './intent.js';
 * 
 * const intent = classifyIntent("What's in auth.ts?", session);
 * // { type: 'inquiry', confidence: 0.8, reason: 'code_question' }
 * ```
 */

import { Session } from '../session/types.js';
import { logger } from '../utils/logger.js';

/**
 * Intent type enum representing the four processing modes.
 * 
 * @typedef {'conversation' | 'inquiry' | 'action' | 'task'} IntentType
 */
export type IntentType = 'conversation' | 'inquiry' | 'action' | 'task';

/**
 * Result of intent classification with confidence scoring.
 * 
 * @interface ClassifiedIntent
 * @property {IntentType} type - The detected intent type
 * @property {number} confidence - Confidence score (0.0 - 1.0)
 * @property {string} reason - Human-readable reason for classification
 */
export interface ClassifiedIntent {
  type: IntentType;
  confidence: number;
  reason: string;
}

// =============================================================================
// PATTERN DEFINITIONS
// =============================================================================

/**
 * Greeting patterns - triggers conversation mode
 * @constant {RegExp[]}
 */
const GREETING_PATTERNS = [
  /^(hi|hey|hello|howdy|yo|sup|hiya|good\s*(morning|afternoon|evening)|g'day)/i,
  /^what'?s?\s*up\??$/i,
  /^how\s*(are\s*you|is\s*it\s*going)\??$/i,
];

/**
 * Thanks/appreciation patterns - triggers conversation mode
 * @constant {RegExp[]}
 */
const THANKS_PATTERNS = [
  /^(thanks|thank\s*you|ty|thx|cheers|appreciate\s*it|much\s*appreciated)/i,
  /great\s*(job|work)|well\s*done|nice|awesome|perfect|love\s*it/i,
];

/**
 * Farewell patterns - triggers conversation mode
 * @constant {RegExp[]}
 */
const FAREWELL_PATTERNS = [
  /^(bye|goodbye|see\s*ya|later|ciao|take\s*care|gn|good\s*night)/i,
];

/**
 * General question patterns (non-code) - triggers conversation mode
 * @constant {RegExp[]}
 */
const GENERAL_QUESTION_PATTERNS = [
  /^(what|who|how|why|when|where)\s+(is|are|do|does|can|could|would|should)\s+(a|an|the)?\s*[^\/\\]+\??$/i,
  /^(can|could|would)\s+you\s+(tell|explain|describe)/i,
  /^what\s+(do|does)\s+.+\s+mean\??$/i,
];

/**
 * Inquiry patterns - questions about code (read-only operations)
 * @constant {RegExp[]}
 */
const INQUIRY_PATTERNS = [
  /^(show|display|print|list)\s+(me\s+)?(the\s+)?/i,
  /^what('s|\s+is)\s+(in|inside)\s+/i,
  /^(read|get|fetch|open)\s+(the\s+)?/i,
  /^how\s+does\s+.+\s+(work|function)/i,
  /^(where|which)\s+(is|are|file|folder|directory)/i,
  /^(find|search|look\s+for|locate)\s+/i,
  /^(explain|describe)\s+(the\s+|this\s+|how\s+)?/i,
  /\?\s*$/,  // Ends with question mark (likely inquiry)
];

/**
 * Action patterns - single, targeted changes
 * @constant {RegExp[]}
 */
const ACTION_PATTERNS = [
  /^(add|insert)\s+(a\s+)?(single|one|new)?\s*/i,
  /^(fix|correct|repair)\s+(the\s+|this\s+|that\s+)?/i,
  /^(change|modify|update|edit)\s+(the\s+|this\s+)?/i,
  /^(rename|move)\s+/i,
  /^(delete|remove)\s+(the\s+|this\s+|that\s+)?/i,
  /^(replace)\s+.+\s+(with|to)\s+/i,
  /^(uncomment|comment\s+out)\s+/i,
  /^(make|set)\s+.+\s+(to|=)\s+/i,
];

/**
 * Task patterns - complex, multi-step work
 * @constant {RegExp[]}
 */
const TASK_PATTERNS = [
  /^(build|create|implement|develop|make)\s+(a\s+|an\s+|the\s+)?(full|complete|new|entire)?\s*(app|application|feature|system|page|component|module|api|endpoint|service)/i,
  /^(set\s*up|setup|configure|initialize|init)\s+/i,
  /^(refactor|rewrite|restructure|reorganize|overhaul)\s+/i,
  /^(migrate|convert|transform|upgrade)\s+/i,
  /^(integrate|connect|link)\s+.+\s+(with|to)\s+/i,
  /\b(multiple|several|all|every|each)\s+(files?|components?|functions?)/i,
  /\b(throughout|across)\s+(the\s+)?(codebase|project|app)/i,
];

/** 
 * Short messages below this threshold are likely conversation
 * @constant {number}
 */
const SHORT_MESSAGE_THRESHOLD = 15;

// =============================================================================
// MAIN CLASSIFICATION FUNCTION
// =============================================================================

/**
 * Classifies user intent from a WhatsApp message.
 * 
 * Uses pattern matching to detect the user's intent and route to the
 * appropriate processing mode. Patterns are checked in priority order:
 * 1. Greetings/farewells → conversation
 * 2. Task indicators → task
 * 3. Question indicators → inquiry
 * 4. Action verbs → action
 * 5. Default → task
 * 
 * @param {string} message - The user's message text
 * @param {Session} _session - Current session (unused but available for context)
 * @returns {ClassifiedIntent} Classification result with type, confidence, and reason
 * 
 * @example
 * ```typescript
 * // Greeting detection
 * classifyIntent("Hey there!", session)
 * // → { type: 'conversation', confidence: 0.95, reason: 'greeting' }
 * 
 * // Code question
 * classifyIntent("What's in the auth module?", session)
 * // → { type: 'inquiry', confidence: 0.8, reason: 'code_question' }
 * 
 * // Single edit
 * classifyIntent("Fix the typo on line 42", session)
 * // → { type: 'action', confidence: 0.8, reason: 'single_change' }
 * 
 * // Complex work
 * classifyIntent("Build a user authentication system", session)
 * // → { type: 'task', confidence: 0.85, reason: 'complex_work' }
 * ```
 */
export function classifyIntent(
  message: string,
  _session: Session
): ClassifiedIntent {
  const trimmed = message.trim();
  
  // =========================================================================
  // CONVERSATION: Greetings, thanks, farewells
  // =========================================================================
  
  // Check for greetings
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.debug('Intent: greeting detected', { message: trimmed });
      return {
        type: 'conversation',
        confidence: 0.95,
        reason: 'greeting'
      };
    }
  }
  
  // Check for thanks
  for (const pattern of THANKS_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.debug('Intent: thanks detected', { message: trimmed });
      return {
        type: 'conversation',
        confidence: 0.9,
        reason: 'thanks'
      };
    }
  }
  
  // Check for farewells
  for (const pattern of FAREWELL_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.debug('Intent: farewell detected', { message: trimmed });
      return {
        type: 'conversation',
        confidence: 0.95,
        reason: 'farewell'
      };
    }
  }
  
  // Very short messages without code indicators = conversation
  if (trimmed.length < SHORT_MESSAGE_THRESHOLD && !hasCodeIndicators(trimmed)) {
    for (const pattern of GENERAL_QUESTION_PATTERNS) {
      if (pattern.test(trimmed)) {
        logger.debug('Intent: general question detected', { message: trimmed });
        return {
          type: 'conversation',
          confidence: 0.8,
          reason: 'general_question'
        };
      }
    }
  }

  // =========================================================================
  // TASK: Complex multi-step work (check first - highest priority)
  // =========================================================================
  
  for (const pattern of TASK_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.debug('Intent: task detected', { message: trimmed });
      return {
        type: 'task',
        confidence: 0.85,
        reason: 'complex_work'
      };
    }
  }

  // =========================================================================
  // INQUIRY: Questions about code (read-only)
  // =========================================================================
  
  for (const pattern of INQUIRY_PATTERNS) {
    if (pattern.test(trimmed)) {
      // But if it also has action words, it's probably an action
      if (hasActionWords(trimmed)) {
        continue;
      }
      logger.debug('Intent: inquiry detected', { message: trimmed });
      return {
        type: 'inquiry',
        confidence: 0.8,
        reason: 'code_question'
      };
    }
  }

  // =========================================================================
  // ACTION: Single changes
  // =========================================================================
  
  for (const pattern of ACTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      // Check if it's actually complex (multiple targets)
      if (isComplexAction(trimmed)) {
        logger.debug('Intent: complex action -> task', { message: trimmed });
        return {
          type: 'task',
          confidence: 0.75,
          reason: 'complex_action'
        };
      }
      logger.debug('Intent: action detected', { message: trimmed });
      return {
        type: 'action',
        confidence: 0.8,
        reason: 'single_change'
      };
    }
  }

  // =========================================================================
  // DEFAULT: Treat as task (let the agent figure it out)
  // =========================================================================
  
  logger.debug('Intent: defaulting to task', { message: trimmed });
  return {
    type: 'task',
    confidence: 0.5,
    reason: 'default'
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Checks if a message contains code-related indicators.
 * 
 * Used to determine if a short message is actually about code
 * rather than casual conversation.
 * 
 * @param {string} message - The message to check
 * @returns {boolean} True if code indicators are present
 * 
 * @example
 * ```typescript
 * hasCodeIndicators("fix bug")      // false
 * hasCodeIndicators("fix auth.ts")  // true (has file extension)
 * hasCodeIndicators("add function") // true (has keyword)
 * ```
 */
function hasCodeIndicators(message: string): boolean {
  const codeIndicators = [
    /`[^`]+`/,              // backticks
    /\b(function|class|const|let|var|import|export|def|fn|struct)\b/i,
    /\.(ts|js|py|rs|go|java|jsx|tsx|html|css|json|yaml|yml|md)$/i,
    /[<>{}[\]()]/,          // brackets
    /\bfile\b/i,            // file operations
    /\b(add|create|edit|fix|update|delete|remove|change|refactor|implement)\b/i,
  ];
  
  return codeIndicators.some(pattern => pattern.test(message));
}

/**
 * Checks if a message contains action verbs.
 * 
 * Used to distinguish inquiry questions from action requests.
 * For example, "how does the login work?" vs "fix the login".
 * 
 * @param {string} message - The message to check
 * @returns {boolean} True if action verbs are present
 */
function hasActionWords(message: string): boolean {
  const actionWords = /\b(add|create|edit|fix|update|delete|remove|change|modify|rename|replace|insert)\b/i;
  return actionWords.test(message);
}

/**
 * Checks if an action affects multiple files or targets.
 * 
 * Used to upgrade a simple action to a task when it would
 * require multiple changes across the codebase.
 * 
 * @param {string} message - The message to check
 * @returns {boolean} True if the action appears complex
 * 
 * @example
 * ```typescript
 * isComplexAction("fix the typo")           // false
 * isComplexAction("fix all typos")          // true
 * isComplexAction("rename x and y and z")   // true
 * ```
 */
function isComplexAction(message: string): boolean {
  const complexIndicators = [
    /\b(all|every|each|multiple|several)\b/i,
    /\b(files?|components?|functions?|methods?)\s+(in|across|throughout)/i,
    /\band\b.*\band\b/i,  // Multiple "and"s = multiple things
    /,\s*\w+\s*,/,        // Comma-separated list
  ];
  
  return complexIndicators.some(pattern => pattern.test(message));
}

/**
 * Determines if conversation mode should be bypassed.
 * 
 * Even if a message is classified as conversation, we may want
 * to bypass it if there's an active task context that the user
 * might be responding to.
 * 
 * @param {ClassifiedIntent} _intent - The classified intent (unused)
 * @param {Session} session - Current session state
 * @returns {boolean} True if conversation should be bypassed
 * 
 * @example
 * ```typescript
 * // During active task execution
 * session.currentTask = { status: 'executing', ... };
 * shouldBypassConversation(intent, session) // true
 * 
 * // With pending approval
 * session.currentTask = { pendingApproval: {...}, ... };
 * shouldBypassConversation(intent, session) // true
 * ```
 */
export function shouldBypassConversation(
  _intent: ClassifiedIntent,
  session: Session
): boolean {
  // If active task, don't treat as simple conversation
  if (session.currentTask?.status === 'executing' || session.currentTask?.status === 'planning') {
    return true;
  }
  
  // If pending approval, user might be responding
  if (session.currentTask?.pendingApproval) {
    return true;
  }
  
  return false;
}
