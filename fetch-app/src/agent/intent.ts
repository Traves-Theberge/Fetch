/**
 * @fileoverview Intent Classification
 *
 * Classifies user messages into intents:
 * - conversation: Chat that doesn't need tools
 * - action: Any work requiring tools (workspace mgmt, coding tasks, etc.)
 * - clarify: Ambiguous request requiring user input
 *
 * @module agent/intent
 */

import { Session } from '../session/types.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Intent types — 3 categories
 *
 * Previously split workspace/task, but both route to the same
 * tool-enabled handler, so they are now unified as 'action'.
 */
export type IntentType = 'conversation' | 'action' | 'clarify';

/**
 * Classification result
 */
export interface ClassifiedIntent {
  type: IntentType;
  confidence: number;
  reason: string;
  /** Extracted entities (project names, file paths, etc.) */
  entities?: ExtractedEntities;
}

/**
 * Entities extracted from the message
 */
export interface ExtractedEntities {
  /** Project/workspace names mentioned */
  projectNames?: string[];
  /** File paths mentioned */
  filePaths?: string[];
  /** Action verbs detected */
  actions?: string[];
  /** Whether this seems destructive (delete, remove, etc.) */
  isDestructive?: boolean;
}

// =============================================================================
// PATTERN DEFINITIONS - Organized by Intent
// =============================================================================

/**
 * Conversation patterns (greetings, thanks, general chat)
 * These are STRONG signals - high confidence match
 */
const CONVERSATION_PATTERNS = {
  // Greetings - very common
  greetings: [
    /^(hi|hey|hello|howdy|yo|sup|hiya|heya)[\s!.,]*$/i,
    /^good\s*(morning|afternoon|evening|night)[\s!.,]*$/i,
    /^what'?s?\s*(up|good)[\s?!]*$/i,
    /^how\s*(are\s*you|is\s*it\s*going|goes\s*it)[\s?]*$/i,
    /^(greetings|salutations)[\s!.,]*$/i,
  ],

  // Thanks - always conversation
  thanks: [
    /^(thanks|thank\s*you|ty|thx|cheers|appreciate\s*it|ta)[\s!.,]*$/i,
    /^(great|awesome|perfect|nice|excellent|wonderful)[\s!.,]*$/i,
    /^(love\s*it|you'?re?\s*(the\s*best|awesome|great))[\s!]*$/i,
    /^(good\s*(job|work|boy)|well\s*done)[\s!]*$/i,
  ],

  // Farewells
  farewells: [
    /^(bye|goodbye|see\s*ya|later|ciao|take\s*care|peace|gtg|gotta\s*go)[\s!.,]*$/i,
    /^(good\s*night|nighty?\s*night|sleep\s*well)[\s!.,]*$/i,
  ],

  // Help/capability questions - we want to explain, not do tasks
  help: [
    /^(help|help\s*me)[\s?!]*$/i,
    /^what\s+can\s+you\s+do[\s?]*$/i,
    /^what\s+are\s+(your|you)\s+(capabilities|features|commands)[\s?]*$/i,
    /^how\s+do\s+(you|I)\s+(work|use\s+(you|this))[\s?]*$/i,
    /^(commands?|options?|menu)[\s?]*$/i,
    /^(tell\s*me\s*about\s*yourself|who\s*are\s*you)[\s?]*$/i,
  ],

  // Reactions/affirmations - short acknowledgments
  reactions: [
    /^(ok|okay|k|sure|yep|yeah|yes|no|nope|nah|mhm|uh\s*huh)[\s!.,]*$/i,
    /^(got\s*it|understood|makes\s*sense|i\s*see|ah|oh|hmm+)[\s!.,]*$/i,
    /^(cool|nice|neat|sick|dope|lit|fire|💯|👍|👎|🔥|❤️|😊|🙏)[\s!.,]*$/i,
  ],

  // Questions about concepts (not file-specific)
  conceptQuestions: [
    /^what\s+is\s+(a\s+)?[a-z]+[\s?]*$/i,  // "what is a hook?"
    /^(explain|describe)\s+what\s+/i,       // "explain what X means"
    /^how\s+does\s+[a-z]+\s+work[\s?]*$/i,  // "how does React work?"
    /^why\s+(do|should|would)\s+/i,         // "why do we use TypeScript?"
  ],
};

/**
 * Workspace patterns (project selection, status)
 * Medium-high confidence - clear project/workspace intent
 */
const WORKSPACE_PATTERNS = {
  // List projects
  list: [
    /^(what|which|list|show|display)\s*(my\s*)?(projects?|workspaces?|repos?)[\s?]*$/i,
    /^(projects?|workspaces?|repos?)[\s?]*$/i,
    /^(what|which)\s+do\s+i\s+have[\s?]*$/i,
    /^show\s*(me\s*)?(what|my)\s*(projects?|workspaces?)[\s?]*$/i,
  ],

  // Select project - look for project-like names
  select: [
    /^(switch|use|select|work\s*on|open|go\s*to|load)\s+(to\s+)?(the\s+)?[\w-]+(\s+(project|workspace|app))?[\s?]*$/i,
    /^(let'?s?\s*)?(work\s+on|use)\s+[\w-]+(\s+(project|workspace|app))?[\s?]*$/i,
    /^(cd|change\s+to|move\s+to)\s+[\w-]+[\s?]*$/i,
  ],

  // Create workspace/project - THIS IS WORKSPACE, NOT TASK!
  create: [
    /^(create|make|new|setup|init|initialize|scaffold|start)\s+(a\s+)?(new\s+)?(project|workspace|repo|app|application)/i,
    /^(create|make|new|setup)\s+[\w-]+\s+(project|workspace)/i,
    /^new\s+project\s+(called|named)\s+/i,
    /^(start|spin\s*up|bootstrap)\s+(a\s+)?(new\s+)?(project|app)/i,
  ],

  // Delete workspace/project
  delete: [
    /^(delete|remove|destroy)\s+(the\s+)?(project|workspace)\s+/i,
    /^(delete|remove)\s+[\w-]+\s+(project|workspace)/i,
  ],

  // Status queries
  status: [
    /^(what'?s?\s*(the\s*)?)?(status|state|situation)[\s?]*$/i,
    /^(show|get|give)\s*(me\s*)?(the\s+)?(status|state|changes?)[\s?]*$/i,
    /^git\s*status[\s?]*$/i,
    /^(what|which)\s+(files?|branch|changes?)[\s?]*$/i,
    /^(what'?s?\s*)?changed[\s?]*$/i,
    /^(any\s+)?uncommitted\s*(changes?)?[\s?]*$/i,
  ],

  // Current context
  context: [
    /^(what|which)\s+(is\s+(the\s+)?)?(current|active)\s+(project|workspace)[\s?]*$/i,
    /^where\s+am\s+i[\s?]*$/i,
    /^(current|active)\s+(project|workspace)[\s?]*$/i,
  ],
};

/**
 * Task patterns (coding work)
 * Look for ACTION VERBS + CODE CONTEXT
 */
const TASK_PATTERNS = {
  // Create/build - constructive actions
  create: [
    /^(add|create|build|implement|make|write|develop|generate|scaffold)\s+/i,
    /^(new|setup|initialize|init)\s+/i,
    /^(put|insert|include)\s+.*\s+(in|into|to)\s+/i,
  ],

  // Fix/change - modification actions
  modify: [
    /^(fix|change|modify|update|edit|correct|repair|patch|amend)\s+/i,
    /^(improve|enhance|optimize|upgrade)\s+/i,
    /^(adjust|tweak|alter)\s+/i,
  ],

  // Refactor - structural changes
  refactor: [
    /^(refactor|rewrite|restructure|reorganize|clean\s*up)\s+/i,
    /^(extract|move|split|merge|combine)\s+/i,
    /^(rename|convert)\s+/i,
  ],

  // Delete/remove - DESTRUCTIVE (needs extra care)
  destructive: [
    /^(delete|remove|drop|destroy|clear|wipe|purge)\s+/i,
    /^(get\s*rid\s*of|eliminate)\s+/i,
  ],

  // Test/verify
  test: [
    /^(test|write\s*tests?\s*for|add\s*tests?\s*(to|for)?)\s+/i,
    /^(run|execute)\s+(the\s+)?tests?/i,
    /^(verify|validate|check)\s+(the\s+)?(code|logic|function)/i,
  ],

  // Debug/investigate
  debug: [
    /^(debug|diagnose|investigate|trace|find\s*(the|why))\s+/i,
    /^(why\s+is|what'?s?\s*wrong\s*with)\s+/i,
    /^(fix|find)\s+(the\s+)?(bug|issue|error|problem)/i,
  ],

  // Explain with file context - needs to read files
  explainCode: [
    /^(explain|describe|walk\s*me\s*through)\s+(this|the|my)\s+(code|function|file|class|component)/i,
    /^(what\s+does|how\s+does)\s+(this|the|my)\s+/i,
    /^(show|read|open|get)\s+(me\s+)?(the\s+)?(code|file|contents?|function)/i,
  ],
};

/**
 * File path patterns - strong indicator of code context
 */
const FILE_PATTERNS = [
  // Common file extensions
  /\.(ts|tsx|js|jsx|mjs|cjs)(\s|$)/i,  // JavaScript/TypeScript
  /\.(py|pyi|pyw)(\s|$)/i,             // Python
  /\.(rs|toml)(\s|$)/i,                // Rust
  /\.(go|mod)(\s|$)/i,                 // Go
  /\.(java|kt|scala)(\s|$)/i,          // JVM languages
  /\.(cpp|cc|c|h|hpp)(\s|$)/i,         // C/C++
  /\.(css|scss|sass|less)(\s|$)/i,     // Styles
  /\.(html|htm|vue|svelte)(\s|$)/i,    // Markup/frameworks
  /\.(json|yaml|yml|toml|xml)(\s|$)/i, // Config files
  /\.(md|mdx|txt|rst)(\s|$)/i,         // Docs
  /\.(sql|graphql)(\s|$)/i,            // Query languages
  /\.(sh|bash|zsh|fish)(\s|$)/i,       // Shell scripts
  /\.(env|gitignore|dockerfile)/i,     // Special files

  // Path-like strings
  /\/(src|lib|app|pages?|components?|utils?|hooks?|api|tests?)\//i,
  /\.\.\//,  // Relative path
  /@\//,     // Alias imports
];

/**
 * Code keywords - indicate code context
 */
const CODE_INDICATORS = [
  /\b(function|class|interface|type|enum|const|let|var|def|fn|func|impl)\b/i,
  /\b(import|export|require|from|module)\b/i,
  /\b(async|await|promise|callback)\b/i,
  /\b(component|hook|provider|context|state|props|redux|store)\b/i,
  /\b(api|endpoint|route|handler|middleware|controller)\b/i,
  /\b(database|schema|model|migration|query)\b/i,
  /[{}[\]();].*[{}[\]();]/,  // Multiple brackets = code
  /=>/,                         // Arrow function
  /::/,                         // Rust/C++ scope
];

// =============================================================================
// ENTITY EXTRACTION
// =============================================================================

/**
 * Extract entities from message for better context
 */
function extractEntities(message: string): ExtractedEntities {
  const entities: ExtractedEntities = {};

  // Extract file paths
  const fileMatches: string[] = [];
  for (const pattern of FILE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      fileMatches.push(match[0].trim());
    }
  }
  if (fileMatches.length > 0) {
    entities.filePaths = fileMatches;
  }

  // Detect destructive intent
  for (const pattern of TASK_PATTERNS.destructive) {
    if (pattern.test(message)) {
      entities.isDestructive = true;
      break;
    }
  }

  // Extract action verbs
  const actionPatterns = [
    /^(add|create|build|fix|change|update|delete|remove|refactor|test|explain|show)\b/i,
  ];
  for (const pattern of actionPatterns) {
    const match = message.match(pattern);
    if (match) {
      entities.actions = entities.actions ?? [];
      entities.actions.push(match[1].toLowerCase());
    }
  }

  return entities;
}

// =============================================================================
// MAIN CLASSIFICATION
// =============================================================================

/**
 * Classify user intent using pattern matching
 *
 * Priority order:
 * 1. Strong conversation signals (greetings, thanks) → conversation
 * 2. Workspace management phrases → workspace  
 * 3. Action verbs + code context → task
 * 4. Ambiguous short messages → conversation (safe default)
 * 5. Unknown with workspace → task
 *
 * @param message - User message
 * @param session - Session context
 * @returns Classification result with confidence and entities
 */
export function classifyIntent(
  message: string,
  session: Session
): ClassifiedIntent {
  const trimmed = message.trim();
  // Note: We use trimmed directly with regex patterns (case-insensitive)
  // No need for lowercase since patterns have /i flag

  // Extract entities for context
  const entities = extractEntities(trimmed);

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 0: Vague/Ambiguous signals requiring clarification (V3.1)
  // ─────────────────────────────────────────────────────────────────────────
  
  // If message is just "fix it", "make it work", "do it"
  const AMBIGUOUS_PATTERNS = [
      /^(fix|do|make|change|update)\s*(it|this|that|something)?[\s!.]*$/i,
      /^not working[\s!.]*$/i,
      /^help me[\s!.]*$/i,
      /^broken[\s!.]*$/i
  ];
  
  for (const pattern of AMBIGUOUS_PATTERNS) {
      if (pattern.test(trimmed)) {
          // If we have an active task, this might refer to it, so check context
          if (!session.activeTaskId) {
              logger.debug(`Intent: clarify (ambiguous)`, { message: trimmed.substring(0, 50) });
              return {
                  type: 'clarify',
                  confidence: 0.9,
                  reason: 'ambiguous_request',
                  entities
              };
          }
      }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: Strong conversation signals
  // ─────────────────────────────────────────────────────────────────────────

  for (const [category, patterns] of Object.entries(CONVERSATION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        logger.debug(`Intent: conversation (${category})`, { message: trimmed.substring(0, 50) });
        return {
          type: 'conversation',
          confidence: 0.95,
          reason: `conversation_${category}`,
          entities,
        };
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: Check workspace patterns
  // Project listing, selection, status
  // ─────────────────────────────────────────────────────────────────────────

  for (const [category, patterns] of Object.entries(WORKSPACE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        logger.debug(`Intent: action/workspace (${category})`, { message: trimmed.substring(0, 50) });
        return {
          type: 'action',
          confidence: 0.9,
          reason: `workspace_${category}`,
          entities,
        };
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3: Check task patterns
  // Action verbs with code context
  // ─────────────────────────────────────────────────────────────────────────

  for (const [category, patterns] of Object.entries(TASK_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        // Extra validation for destructive actions
        if (category === 'destructive') {
          logger.debug('Intent: action/task (destructive - will confirm)', { message: trimmed.substring(0, 50) });
          return {
            type: 'action',
            confidence: 0.85,
            reason: 'task_destructive',
            entities: { ...entities, isDestructive: true },
          };
        }

        logger.debug(`Intent: action/task (${category})`, { message: trimmed.substring(0, 50) });
        return {
          type: 'action',
          confidence: 0.85,
          reason: `task_${category}`,
          entities,
        };
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 4: Check for code context without explicit action
  // File paths or code keywords suggest task intent
  // ─────────────────────────────────────────────────────────────────────────

  const hasFileContext = FILE_PATTERNS.some(p => p.test(trimmed));
  const hasCodeIndicators = CODE_INDICATORS.some(p => p.test(trimmed));

  if (hasFileContext || hasCodeIndicators) {
    logger.debug('Intent: action (code context detected)', { 
      message: trimmed.substring(0, 50),
      hasFileContext,
      hasCodeIndicators,
    });
    return {
      type: 'action',
      confidence: 0.7,
      reason: 'code_context',
      entities,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 5: Check message characteristics
  // Short ambiguous messages → conversation (safer)
  // ─────────────────────────────────────────────────────────────────────────

  // Very short messages without clear signals → conversation
  if (trimmed.length < 15) {
    logger.debug('Intent: conversation (short message)', { message: trimmed });
    return {
      type: 'conversation',
      confidence: 0.6,
      reason: 'short_message',
      entities,
    };
  }

  // Questions without code context → conversation
  if (trimmed.endsWith('?') && !hasFileContext && !hasCodeIndicators) {
    logger.debug('Intent: conversation (question without code context)', { message: trimmed.substring(0, 50) });
    return {
      type: 'conversation',
      confidence: 0.55,
      reason: 'question_no_code',
      entities,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 6: Check session context
  // If we have an active workspace, lean toward task
  // ─────────────────────────────────────────────────────────────────────────

  if (session.currentProject) {
    // User has a project selected - they're probably trying to do work
    logger.debug('Intent: action (has active workspace)', { 
      message: trimmed.substring(0, 50),
      workspace: session.currentProject.name,
    });
    return {
      type: 'action',
      confidence: 0.5,
      reason: 'active_workspace_context',
      entities,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FALLBACK: Unknown intent → conversation
  // "When in doubt, ask" - this is the safe default
  // ─────────────────────────────────────────────────────────────────────────

  logger.debug('Intent: conversation (fallback - will clarify)', { message: trimmed.substring(0, 50) });
  return {
    type: 'conversation',
    confidence: 0.4,
    reason: 'fallback_will_clarify',
    entities,
  };
}


