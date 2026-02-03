/**
 * @fileoverview Intent Classification
 *
 * Simplified intent classification for the orchestrator architecture.
 * Classifies into 3 intents instead of 4 modes:
 *
 * - conversation: Chat that doesn't need tools
 * - workspace: Project/workspace management
 * - task: Coding work that needs a harness
 *
 * @module agent/intent
 * @see {@link buildIntentPrompt} - LLM-based classification prompt
 */

import { Session } from '../session/types.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Intent types (3 categories)
 */
export type IntentType = 'conversation' | 'workspace' | 'task';

/**
 * Classification result
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
 * Conversation patterns (greetings, thanks, general chat)
 */
const CONVERSATION_PATTERNS = [
  // Greetings
  /^(hi|hey|hello|howdy|yo|sup|hiya|good\s*(morning|afternoon|evening))/i,
  /^what'?s?\s*up\??$/i,
  /^how\s*(are\s*you|is\s*it\s*going)\??$/i,

  // Thanks
  /^(thanks|thank\s*you|ty|thx|cheers|appreciate)/i,
  /^(great|awesome|perfect|nice|love\s*it)/i,

  // Farewells
  /^(bye|goodbye|see\s*ya|later|ciao|take\s*care)/i,

  // General questions (non-code)
  /^what\s+can\s+you\s+do/i,
  /^help$/i,
];

/**
 * Workspace patterns (project selection, status)
 */
const WORKSPACE_PATTERNS = [
  // List projects
  /^(what|which|list|show)\s*(projects?|workspaces?)/i,
  /^(projects?|workspaces?)\s*\??$/i,

  // Select project
  /^(switch|use|select|work\s+on|open)\s+(to\s+)?(the\s+)?/i,
  /^(work\s+on|go\s+to)\s+/i,

  // Status
  /^(what'?s?\s+the\s+)?(status|state|git\s*status)/i,
  /^(show|get)\s+(me\s+)?(the\s+)?(status|changes)/i,
  /^(what|which)\s+(files?|branch)/i,

  // Project info
  /^(current|active)\s+(project|workspace)/i,
];

/**
 * Task patterns (coding work)
 */
const TASK_PATTERNS = [
  // Create/build
  /^(add|create|build|implement|make|write|develop)\s+/i,

  // Fix/change
  /^(fix|change|modify|update|edit|correct|repair)\s+/i,

  // Refactor
  /^(refactor|rewrite|restructure|reorganize)\s+/i,

  // Delete/remove
  /^(delete|remove)\s+/i,

  // Setup/configure
  /^(set\s*up|setup|configure|initialize)\s+/i,

  // Explain (needs file reading)
  /^(explain|describe|what\s+does)\s+/i,
  /^(how\s+does|where\s+is)\s+/i,

  // Read/show code
  /^(show|read|get|open)\s+(me\s+)?(the\s+)?(code|file|function|class)/i,

  // Test/run
  /^(test|run|execute)\s+/i,

  // File paths mentioned
  /\.(ts|js|tsx|jsx|py|rs|go|java|cpp|c|h|css|scss|html|json|yaml|yml|md|txt)(\s|$)/i,
];

// =============================================================================
// MAIN CLASSIFICATION
// =============================================================================

/**
 * Classify user intent using pattern matching
 *
 * @param message - User message
 * @param _session - Session context (unused in pattern matching)
 * @returns Classification result
 */
export function classifyIntent(
  message: string,
  _session: Session
): ClassifiedIntent {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // Check conversation patterns first (highest confidence)
  for (const pattern of CONVERSATION_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.debug('Intent: conversation', { message: trimmed.substring(0, 50) });
      return {
        type: 'conversation',
        confidence: 0.95,
        reason: 'conversation_pattern',
      };
    }
  }

  // Check workspace patterns
  for (const pattern of WORKSPACE_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.debug('Intent: workspace', { message: trimmed.substring(0, 50) });
      return {
        type: 'workspace',
        confidence: 0.9,
        reason: 'workspace_pattern',
      };
    }
  }

  // Check task patterns
  for (const pattern of TASK_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.debug('Intent: task', { message: trimmed.substring(0, 50) });
      return {
        type: 'task',
        confidence: 0.85,
        reason: 'task_pattern',
      };
    }
  }

  // Short messages without clear intent → conversation
  if (trimmed.length < 20 && !hasCodeIndicators(lower)) {
    logger.debug('Intent: conversation (short message)', { message: trimmed });
    return {
      type: 'conversation',
      confidence: 0.6,
      reason: 'short_message',
    };
  }

  // Default: assume it's a task (let the LLM figure it out)
  logger.debug('Intent: task (default)', { message: trimmed.substring(0, 50) });
  return {
    type: 'task',
    confidence: 0.5,
    reason: 'default',
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if message has code-related indicators
 */
function hasCodeIndicators(message: string): boolean {
  const indicators = [
    /\.(ts|js|tsx|jsx|py|rs|go|java|cpp|c|h|css|html|json|yaml|md)/i,
    /\bfunction\b/i,
    /\bclass\b/i,
    /\bimport\b/i,
    /\bexport\b/i,
    /\bconst\b/i,
    /\blet\b/i,
    /\bvar\b/i,
    /\bdef\b/i,
    /\breturn\b/i,
    /[{}\[\]();]/,
    /=>/,
    /::/,
  ];

  return indicators.some((pattern) => pattern.test(message));
}

// =============================================================================
// LLM-BASED CLASSIFICATION (for ambiguous cases)
// =============================================================================

/**
 * Parse LLM response into intent
 *
 * @param response - LLM response (should be just the intent word)
 * @returns Parsed intent or null
 */
export function parseIntentResponse(response: string): IntentType | null {
  const cleaned = response.trim().toLowerCase();

  if (cleaned === 'conversation' || cleaned.startsWith('conversation')) {
    return 'conversation';
  }
  if (cleaned === 'workspace' || cleaned.startsWith('workspace')) {
    return 'workspace';
  }
  if (cleaned === 'task' || cleaned.startsWith('task')) {
    return 'task';
  }

  return null;
}

/**
 * Get intent with LLM fallback
 *
 * For low-confidence classifications, this can be used to get
 * an LLM-based classification instead.
 *
 * @param patternResult - Pattern-based classification result
 * @returns Whether to use LLM fallback
 */
export function shouldUseLLMFallback(patternResult: ClassifiedIntent): boolean {
  return patternResult.confidence < 0.7;
}
