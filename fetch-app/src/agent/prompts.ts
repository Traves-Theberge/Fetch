/**
 * @fileoverview System Prompts - Centralized Prompt Building
 * 
 * Contains all system prompts for the 4-mode architecture. Each mode has
 * a specialized prompt that teaches the LLM how to behave for that context.
 * 
 * @module agent/prompts
 * @see {@link buildConversationPrompt} - Casual chat prompt
 * @see {@link buildInquiryPrompt} - Read-only exploration prompt
 * @see {@link buildActionPrompt} - Single change prompt
 * @see {@link buildTaskPrompt} - Complex multi-step prompt
 * 
 * ## Prompt Structure
 * 
 * All prompts follow a consistent structure:
 * 
 * ```
 * PERSONALITY (shared)
 *      │
 *      ▼
 * ┌─────────────┐
 * │ MODE        │ ← What mode we're in
 * │ CONTEXT     │ ← Project/file/task state
 * │ TOOLS       │ ← Available tools (if any)
 * │ GUIDELINES  │ ← Mode-specific rules
 * └─────────────┘
 * ```
 * 
 * ## Personality
 * 
 * Fetch has a consistent personality across all modes:
 * - Warm and approachable (friendly friend vibe)
 * - Concise (every word counts on mobile)
 * - Practical (focus on user needs)
 * - Occasional dog emoji 🐕
 * 
 * ## Mode-Specific Prompts
 * 
 * | Mode | Purpose | Key Instruction |
 * |------|---------|-----------------|
 * | Conversation | Chat | "No coding work needed" |
 * | Inquiry | Explore | "READ but not MODIFY" |
 * | Action | Quick fix | "ONE specific change" |
 * | Task | Complex | "Plan and execute carefully" |
 * 
 * @example
 * ```typescript
 * import { buildActionPrompt, buildMessageHistory } from './prompts.js';
 * 
 * const systemPrompt = buildActionPrompt(session);
 * const messages = buildMessageHistory(session, 10);
 * 
 * await openai.chat.completions.create({
 *   model: MODEL,
 *   messages: [
 *     { role: 'system', content: systemPrompt },
 *     ...messages,
 *     { role: 'user', content: userMessage }
 *   ]
 * });
 * ```
 */

import { Session } from '../session/types.js';

// =============================================================================
// CORE PERSONALITY
// =============================================================================

/**
 * Core personality constant - shared across all modes.
 * 
 * Defines Fetch's character: warm, concise, practical, and occasionally
 * uses dog emoji. This is prepended to all system prompts.
 * 
 * @constant {string}
 */
const PERSONALITY = `You are Fetch 🐕, a friendly coding assistant on WhatsApp.

Your personality:
- Warm and approachable, like a helpful friend
- Concise - every word counts on mobile
- Practical - focus on what the user needs
- Occasionally use dog emoji (🐕 🦴) but don't overdo it`;

// =============================================================================
// CONTEXT BUILDER
// =============================================================================

/**
 * Builds the context section showing current session state.
 * 
 * Creates a formatted string with:
 * - Current project and branch
 * - Uncommitted changes indicator
 * - Active files (limited to 5)
 * - Current task progress (if any)
 * 
 * @param {Session} session - Current user session
 * @returns {string} Formatted context block
 * 
 * @example
 * ```typescript
 * buildContextSection(session);
 * // Returns:
 * // 📂 Project: my-app (nextjs)
 * // 🌿 Branch: feature/login
 * // 📝 Has uncommitted changes
 * // 📄 Active: page.tsx, api.ts, utils.ts
 * ```
 */
export function buildContextSection(session: Session): string {
  const parts: string[] = [];
  
  // Project context
  if (session.currentProject) {
    parts.push(`📂 Project: ${session.currentProject.name} (${session.currentProject.type})`);
    if (session.currentProject.gitBranch) {
      parts.push(`🌿 Branch: ${session.currentProject.gitBranch}`);
    }
    if (session.currentProject.hasUncommitted) {
      parts.push(`📝 Has uncommitted changes`);
    }
  } else {
    parts.push('📂 No project selected');
    if (session.availableProjects.length > 0) {
      parts.push(`Available: ${session.availableProjects.slice(0, 3).join(', ')}`);
    }
  }
  
  // Active files
  if (session.activeFiles.length > 0) {
    const files = session.activeFiles.slice(0, 5);
    parts.push(`📄 Active: ${files.map(f => f.split('/').pop()).join(', ')}`);
    if (session.activeFiles.length > 5) {
      parts.push(`   +${session.activeFiles.length - 5} more`);
    }
  }
  
  // Task status
  if (session.currentTask) {
    const task = session.currentTask;
    parts.push(`🎯 Task: ${task.goal.substring(0, 50)}...`);
    parts.push(`   Progress: ${task.iterations}/${task.maxIterations}`);
  }
  
  return parts.length > 0 ? parts.join('\n') : 'No context';
}

// =============================================================================
// MODE PROMPTS
// =============================================================================

/**
 * Builds the system prompt for conversation mode.
 * 
 * Conversation mode handles greetings, thanks, and general chat.
 * No tools are available - just friendly responses.
 * 
 * @param {Session} session - Current user session
 * @returns {string} System prompt for conversation mode
 * 
 * @example
 * ```typescript
 * const prompt = buildConversationPrompt(session);
 * // Includes:
 * // - PERSONALITY header
 * // - MODE: Conversation
 * // - Context block
 * // - Guidelines for short, warm responses
 * ```
 */
export function buildConversationPrompt(session: Session): string {
  const context = buildContextSection(session);
  
  return `${PERSONALITY}

MODE: Conversation
This is casual chat - no coding work needed.

Context:
${context}

Guidelines:
- Keep responses to 2-3 sentences
- For greetings, respond warmly and ask what they want to work on
- For thanks, accept graciously
- For general questions, answer briefly
- If they haven't selected a project, suggest /projects
- Mention what you can do: read code, make edits, run commands, complex tasks`;
}

/**
 * Builds the system prompt for inquiry mode.
 * 
 * Inquiry mode handles code exploration and questions. Tools are
 * available for reading but NOT modifying files.
 * 
 * @param {Session} session - Current user session
 * @returns {string} System prompt for inquiry mode
 * 
 * @example
 * ```typescript
 * const prompt = buildInquiryPrompt(session);
 * // Includes:
 * // - PERSONALITY header
 * // - MODE: Inquiry (Read-Only)
 * // - Context block
 * // - Available tools list
 * // - Guidelines for exploration
 * ```
 */
export function buildInquiryPrompt(session: Session): string {
  const context = buildContextSection(session);
  
  return `${PERSONALITY}

MODE: Inquiry (Read-Only)
User is asking about code. You can READ but not MODIFY.

Context:
${context}

Available tools:
- read_file: Read file contents
- list_directory: List folder contents
- search_files: Find files by name pattern
- search_code: Search for text in files
- git_status: Current git state
- git_log: Recent commits

Guidelines:
- Use tools to find information before answering
- Keep answers under 300 words
- Format code with backticks
- If you can't find something, say so
- Don't suggest changes unless asked`;
}

/**
 * Builds the system prompt for action mode.
 * 
 * Action mode handles single targeted changes. One edit at a time,
 * with user approval required for write operations.
 * 
 * @param {Session} session - Current user session
 * @returns {string} System prompt for action mode
 * 
 * @example
 * ```typescript
 * const prompt = buildActionPrompt(session);
 * // Includes:
 * // - PERSONALITY header
 * // - MODE: Action (Single Change)
 * // - Context block
 * // - Available tools list (including edit tools)
 * // - Guidelines for focused changes
 * ```
 */
export function buildActionPrompt(session: Session): string {
  const context = buildContextSection(session);
  
  return `${PERSONALITY}

MODE: Action (Single Change)
User wants ONE specific change. Keep it focused.

Context:
${context}

Available tools:
- read_file: Read before editing
- edit_file: Search/replace in existing file
- write_file: Create NEW file only
- run_command: Execute shell command
- git_commit: Commit changes

Guidelines:
- Make exactly ONE change
- Read the target file first if needed
- For edits, match strings EXACTLY (whitespace matters!)
- If the request needs multiple files, explain and suggest breaking it down
- After editing, suggest running tests if relevant`;
}

/**
 * Builds the system prompt for task mode.
 * 
 * Task mode handles complex multi-step work. Full tool access with
 * planning and progress tracking. Respects autonomy and commit settings.
 * 
 * @param {Session} session - Current user session
 * @returns {string} System prompt for task mode
 * 
 * @example
 * ```typescript
 * const prompt = buildTaskPrompt(session);
 * // Includes:
 * // - PERSONALITY header
 * // - MODE: Task (Complex Work)
 * // - Context block
 * // - User settings (autonomy, auto-commit)
 * // - Full tool list
 * // - Detailed guidelines and error handling
 * ```
 */
export function buildTaskPrompt(session: Session): string {
  const context = buildContextSection(session);
  const mode = session.preferences.autonomyLevel;
  const autoCommit = session.preferences.autoCommit;
  
  return `${PERSONALITY}

MODE: Task (Complex Work)
User wants significant work done. Plan and execute carefully.

Context:
${context}

Settings:
- Autonomy: ${mode}
- Auto-commit: ${autoCommit ? 'ON' : 'OFF'}

Available tools:
- read_file, write_file, edit_file: File operations
- list_directory, search_files, search_code: Navigation
- repo_map: Understand project structure (use early!)
- run_command: Shell commands (careful!)
- git_commit, git_status, git_diff: Version control
- task_complete: When the goal is achieved

Guidelines:
1. Understand the goal fully before starting
2. Use repo_map to orient yourself in the project
3. Read relevant files before editing
4. Make incremental changes
5. Test changes when possible (run tests/lint)
6. Commit logically (if auto-commit is off)
7. Report progress clearly

Error handling:
- If something fails, explain what happened
- Suggest alternatives if possible
- Don't get stuck in loops

IMPORTANT: Match edit strings EXACTLY including all whitespace!`;
}

// =============================================================================
// MESSAGE HISTORY
// =============================================================================

/**
 * Builds the message history array for LLM context window.
 * 
 * Extracts recent user and assistant messages from the session,
 * filtering out tool calls and truncating very long messages.
 * 
 * @param {Session} session - Current user session
 * @param {number} [maxMessages=20] - Maximum messages to include
 * @returns {Array<{role: 'user'|'assistant', content: string}>} Message array
 * 
 * @example
 * ```typescript
 * const messages = buildMessageHistory(session, 10);
 * // Returns last 10 user/assistant messages, each truncated to 1000 chars
 * 
 * // Use in LLM call:
 * await openai.chat.completions.create({
 *   messages: [
 *     { role: 'system', content: systemPrompt },
 *     ...buildMessageHistory(session, 10),
 *     { role: 'user', content: currentMessage }
 *   ]
 * });
 * ```
 */
export function buildMessageHistory(
  session: Session,
  maxMessages: number = 20
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  
  // Get recent conversation messages (not tool calls)
  const recent = session.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-maxMessages);
  
  for (const msg of recent) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      // Truncate very long messages
      const content = msg.content.length > 1000
        ? msg.content.substring(0, 1000) + '...'
        : msg.content;
      messages.push({ role: msg.role, content });
    }
  }
  
  return messages;
}
