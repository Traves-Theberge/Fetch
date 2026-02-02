/**
 * @fileoverview Agent Core - Main Orchestrator
 * 
 * Implements the agentic loop with 4-mode architecture. Routes user messages
 * through intent classification to appropriate handlers (conversation, inquiry,
 * action, task) and manages the execution lifecycle.
 * 
 * @module agent/core
 * @see {@link AgentCore} - Main agent class
 * @see {@link processMessage} - Entry point for user messages
 * @see {@link runAgentLoop} - Task mode execution loop
 * 
 * ## Architecture
 * 
 * ```
 * User Message
 *      │
 *      ▼
 * ┌─────────────┐
 * │ Intent      │ ← Classify message type
 * │ Classifier  │
 * └─────┬───────┘
 *       │
 *       ├── conversation → handleConversation()
 *       ├── inquiry     → handleInquiry()
 *       ├── action      → handleAction()
 *       └── task        → runAgentLoop()
 * ```
 * 
 * ## Task Mode Loop (ReAct Pattern)
 * 
 * ```
 * while (not complete and under iteration limit):
 *   1. Think: LLM decides next action
 *   2. Act: Execute tool(s)
 *   3. Observe: Process results
 *   4. Repeat or complete
 * ```
 * 
 * ## Approval System
 * 
 * - **Suggest mode**: All write operations need approval
 * - **Autonomous mode**: Only sensitive ops need approval
 * - Approvals stored in session.currentTask.pendingApproval
 * 
 * @example
 * ```typescript
 * import { AgentCore } from './core.js';
 * import { SessionManager } from '../session/manager.js';
 * 
 * const sessionManager = new SessionManager();
 * const agent = new AgentCore(sessionManager);
 * 
 * const session = await sessionManager.getOrCreate('user123');
 * const responses = await agent.processMessage(session, "What does this code do?");
 * ```
 */

import OpenAI from 'openai';
import { 
  Session, 
  ToolCall
} from '../session/types.js';
import { SessionManager } from '../session/manager.js';
import { 
  Tool, 
  ToolResult, 
  Decision
} from '../tools/types.js';
import { ToolRegistry, getToolRegistry } from '../tools/registry.js';
import { getCurrentCommit } from '../tools/git.js';
import { logger } from '../utils/logger.js';
import { formatApprovalRequest, formatTaskComplete, formatTaskFailed, formatProgress } from './format.js';
import { classifyIntent, shouldBypassConversation } from './intent.js';
import { handleConversation } from './conversation.js';
import { handleInquiry } from './inquiry.js';
import { handleAction } from './action.js';
import { buildTaskPrompt } from './prompts.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** OpenRouter API key from environment */
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/** LLM model (configurable via AGENT_MODEL env var, default gpt-4o-mini) */
const MODEL = process.env.AGENT_MODEL || 'openai/gpt-4o-mini';

// =============================================================================
// AGENT CORE CLASS
// =============================================================================

/**
 * Main agent class implementing the 4-mode agentic loop.
 * 
 * Handles message routing, tool execution, approval workflows,
 * and task lifecycle management.
 * 
 * @class
 */
export class AgentCore {
  /** OpenAI client configured for OpenRouter */
  private openai: OpenAI;
  
  /** Session manager for state persistence */
  private sessionManager: SessionManager;
  
  /** Registry of available tools */
  private toolRegistry: ToolRegistry;

  /**
   * Creates a new AgentCore instance.
   * 
   * @param {SessionManager} sessionManager - Session state manager
   * @param {ToolRegistry} [toolRegistry] - Optional custom tool registry
   * @throws {Error} If OPENROUTER_API_KEY is not set
   */
  constructor(
    sessionManager: SessionManager,
    toolRegistry?: ToolRegistry
  ) {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY required for agent');
    }

    this.openai = new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1'
    });
    
    this.sessionManager = sessionManager;
    this.toolRegistry = toolRegistry || getToolRegistry();
  }

  /**
   * Main entry point - processes a user message and returns responses.
   * 
   * Routes through intent classification to appropriate handler.
   * Handles pending approvals, paused tasks, and new messages.
   * 
   * @param {Session} session - Current user session
   * @param {string} userMessage - The user's message
   * @returns {Promise<string[]>} Array of response messages
   */
  async processMessage(session: Session, userMessage: string): Promise<string[]> {
    const responses: string[] = [];

    // Add user message to history
    await this.sessionManager.addUserMessage(session, userMessage);

    // Check if there's a pending approval
    if (session.currentTask?.pendingApproval) {
      return this.handleApprovalResponse(session, userMessage);
    }

    // Check if task is paused
    if (session.currentTask?.status === 'paused') {
      if (this.isResumeIntent(userMessage)) {
        await this.sessionManager.resumeTask(session);
        responses.push('▶️ Resuming task...');
        return [...responses, ...(await this.runAgentLoop(session))];
      } else if (this.isStopIntent(userMessage)) {
        // User wants to cancel
        await this.sessionManager.abortTask(session);
        responses.push('🛑 Task cancelled.');
        return responses;
      } else {
        // Treat as answer to the paused question - resume and continue with this message
        await this.sessionManager.resumeTask(session);
        return this.runAgentLoop(session);
      }
    }

    // 🐕 Classify intent and route to appropriate mode
    const intent = classifyIntent(userMessage, session);
    
    // Don't reclassify if there's active work
    if (!shouldBypassConversation(intent, session)) {
      switch (intent.type) {
        case 'conversation':
          // Simple chat - no task, no tools
          const chatReply = await handleConversation(session, userMessage, intent);
          await this.sessionManager.addAssistantMessage(session, chatReply[0]);
          return chatReply;
          
        case 'inquiry':
          // Questions about code - read-only tools, no approval
          return handleInquiry(
            session, 
            userMessage, 
            intent, 
            this.sessionManager, 
            this.toolRegistry
          );
          
        case 'action':
          // Single change - one approval cycle
          return handleAction(
            session,
            userMessage,
            intent,
            this.sessionManager,
            this.toolRegistry
          );
          
        case 'task':
          // Complex work - full task system
          break; // Fall through to runAgentLoop
      }
    }

    // Start new task or continue existing
    return this.runAgentLoop(session);
  }

  /**
   * Handle approval response (yes/no/edit)
   */
  private async handleApprovalResponse(session: Session, response: string): Promise<string[]> {
    const task = session.currentTask!;
    const approval = task.pendingApproval!;
    const normalizedResponse = response.toLowerCase().trim();

    // Check for approval
    const isApproved = ['yes', 'y', 'ok', 'approve', '👍', 'yep', 'sure'].includes(normalizedResponse);
    const isRejected = ['no', 'n', 'nope', 'reject', '👎', 'cancel'].includes(normalizedResponse);
    const isSkip = ['skip', 's'].includes(normalizedResponse);
    const isYesAll = ['yesall', 'ya', 'yes all', 'approve all'].includes(normalizedResponse);

    if (isYesAll) {
      // Switch to autonomous mode
      await this.sessionManager.setAutonomyLevel(session, 'autonomous');
      await this.sessionManager.clearPendingApproval(session, true);
      
      // Execute the pending tool
      const result = await this.executeTool(approval.tool, approval.args);
      await this.recordToolResult(session, approval.tool, approval.args, result, true);
      
      if (result.success && (approval.tool === 'write_file' || approval.tool === 'edit_file')) {
        task.filesModified.push(approval.args.path as string);
        await this.autoCommitIfEnabled(session, approval.tool, approval.args);
      }

      return ['🤖 Autonomous mode enabled. Continuing...', ...(await this.runAgentLoop(session))];
    }

    if (isApproved) {
      await this.sessionManager.clearPendingApproval(session, true);
      
      // Execute the approved tool
      const result = await this.executeTool(approval.tool, approval.args);
      await this.recordToolResult(session, approval.tool, approval.args, result, true);
      
      if (result.success && (approval.tool === 'write_file' || approval.tool === 'edit_file')) {
        task.filesModified.push(approval.args.path as string);
        await this.autoCommitIfEnabled(session, approval.tool, approval.args);
      }

      // Continue the agent loop
      return this.runAgentLoop(session);
    }

    if (isRejected) {
      await this.sessionManager.clearPendingApproval(session, false);
      
      // Record rejection
      await this.recordToolResult(session, approval.tool, approval.args, {
        success: false,
        output: '',
        error: 'User rejected this action',
        duration: 0
      }, false);

      // Continue - agent will adapt
      return this.runAgentLoop(session);
    }

    if (isSkip) {
      await this.sessionManager.clearPendingApproval(session, false);
      
      // Record skip
      await this.recordToolResult(session, approval.tool, approval.args, {
        success: true,
        output: 'Skipped by user',
        duration: 0
      }, false);

      return ['⏭️ Skipped. Continuing...', ...(await this.runAgentLoop(session))];
    }

    // Unknown response
    return ['Please respond with yes/no/skip/yesall'];
  }

  /**
   * Main agent loop
   */
  private async runAgentLoop(session: Session): Promise<string[]> {
    const responses: string[] = [];

    // Create task if none exists
    if (!session.currentTask) {
      const lastUserMessage = this.getLastUserMessage(session);
      if (!lastUserMessage) {
        return ['How can I help you?'];
      }

      await this.sessionManager.startTask(session, lastUserMessage);
      
      // Record git state for undo-all
      const gitCommit = await getCurrentCommit();
      if (gitCommit && !session.gitStartCommit) {
        await this.sessionManager.setGitStartCommit(session, gitCommit);
      }
    }

    const task = session.currentTask!;

    // Safety: check iteration limit
    if (task.iterations >= task.maxIterations) {
      const failedTask = await this.sessionManager.failTask(
        session, 
        `Reached maximum iterations (${task.maxIterations})`
      );
      responses.push(formatTaskFailed(failedTask));
      return responses;
    }

    // Increment iteration
    task.iterations++;
    await this.sessionManager.updateTask(session, { iterations: task.iterations });

    try {
      // Get decision from LLM
      const decision = await this.decide(session);

      // Handle decision
      switch (decision.type) {
        case 'use_tool': {
          const tool = decision.tool;
          
          // Check if approval needed
          if (this.needsApproval(session, tool, decision.args)) {
            // Generate diff for file operations
            let diff: string | undefined;
            if (tool.name === 'write_file' || tool.name === 'edit_file') {
              diff = await this.generateDiff(tool.name, decision.args);
            }

            // Set pending approval
            await this.sessionManager.setPendingApproval(
              session,
              tool.name,
              decision.args,
              decision.reasoning,
              diff
            );

            responses.push(formatApprovalRequest(
              tool.name,
              decision.args,
              decision.reasoning,
              diff
            ));
            return responses;
          }

          // Execute tool directly
          const result = await this.executeTool(tool.name, decision.args);
          await this.recordToolResult(session, tool.name, decision.args, result, true);

          if (result.success && tool.modifiesWorkspace) {
            if (tool.name === 'write_file' || tool.name === 'edit_file') {
              task.filesModified.push(decision.args.path as string);
            }
            await this.autoCommitIfEnabled(session, tool.name, decision.args);
          }

          // Progress update in verbose mode
          if (session.preferences.verboseMode) {
            responses.push(formatProgress(task, `Executed ${tool.name}`));
          }

          // Continue loop
          return [...responses, ...(await this.runAgentLoop(session))];
        }

        case 'ask_user': {
          // Format question and wait for response
          let question = `❓ ${decision.question}`;
          if (decision.options) {
            question += '\n\n' + decision.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
          }
          
          // Add to messages
          await this.sessionManager.addAssistantMessage(session, question);
          
          // Pause task
          await this.sessionManager.pauseTask(session);
          
          responses.push(question);
          return responses;
        }

        case 'report_progress': {
          if (session.preferences.verboseMode) {
            responses.push(formatProgress(task, decision.message));
          }
          // Continue loop
          return [...responses, ...(await this.runAgentLoop(session))];
        }

        case 'complete': {
          const completedTask = await this.sessionManager.completeTask(session, decision.summary);
          responses.push(formatTaskComplete(completedTask, session));
          return responses;
        }

        case 'blocked': {
          const failedTask = await this.sessionManager.failTask(session, decision.reason);
          responses.push(formatTaskFailed(failedTask, decision.suggestion));
          return responses;
        }
      }
    } catch (error) {
      logger.error('Agent loop error', { error, taskId: task.id });
      const message = error instanceof Error ? error.message : 'Unknown error';
      
      if (task.iterations < 3) {
        // Retry a few times
        return this.runAgentLoop(session);
      }
      
      const failedTask = await this.sessionManager.failTask(session, message);
      responses.push(formatTaskFailed(failedTask));
      return responses;
    }

    return responses;
  }

  /**
   * Get decision from LLM
   */
  private async decide(session: Session): Promise<Decision> {
    const systemPrompt = this.buildSystemPrompt(session);
    const messages = this.buildMessages(session);
    const tools = this.toolRegistry.toOpenAIFormat();

    logger.debug('Calling LLM', { 
      model: MODEL,
      messageCount: messages.length,
      toolCount: tools.length 
    });

    const response = await this.openai.chat.completions.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages as OpenAI.ChatCompletionMessageParam[]
      ],
      tools: tools.length > 0 ? tools as OpenAI.ChatCompletionTool[] : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined
    });

    return this.parseDecision(response);
  }

  /**
   * Build system prompt with context
   */
  private buildSystemPrompt(session: Session): string {
    // Use centralized task prompt
    let prompt = buildTaskPrompt(session);

    // Add repo map if available
    if (session.repoMap) {
      prompt += `\n\n## Repository Structure\n${session.repoMap}`;
    }

    return prompt;
  }

  /**
   * Build messages array for LLM (OpenAI format)
   */
  private buildMessages(session: Session): Array<{ role: string; content: string; tool_call_id?: string; name?: string }> {
    const messages: Array<{ role: string; content: string; tool_call_id?: string; name?: string }> = [];
    
    // Get recent messages (limit context window)
    const recentMessages = session.messages.slice(-30);
    
    for (const msg of recentMessages) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: msg.content });
      } else if (msg.role === 'tool' && msg.toolCall) {
        // OpenAI format for tool results
        messages.push({
          role: 'tool',
          tool_call_id: msg.id,
          name: msg.toolCall.name,
          content: msg.toolCall.result || msg.content
        });
      }
    }

    return messages;
  }

  /**
   * Parse LLM response into a Decision (OpenAI format)
   */
  private parseDecision(response: OpenAI.ChatCompletion): Decision {
    const choice = response.choices[0];
    
    if (!choice) {
      return {
        type: 'blocked',
        reason: 'No response from LLM'
      };
    }

    const message = choice.message;
    
    // Check for tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0]; // Handle first tool call
      
      // Type guard for function tool calls
      if (toolCall.type !== 'function') {
        return {
          type: 'blocked',
          reason: 'Unsupported tool call type'
        };
      }
      
      const functionCall = toolCall.function;
      const tool = this.toolRegistry.get(functionCall.name);
      
      if (!tool) {
        return {
          type: 'blocked',
          reason: `Unknown tool: ${functionCall.name}`
        };
      }

      // Parse arguments
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(functionCall.arguments);
      } catch {
        args = {};
      }

      // Check for control tools
      if (functionCall.name === 'ask_user') {
        return {
          type: 'ask_user',
          question: (args as { question: string }).question,
          options: (args as { options?: string[] }).options
        };
      }

      if (functionCall.name === 'report_progress') {
        return {
          type: 'report_progress',
          message: (args as { message: string }).message,
          percentComplete: (args as { percent_complete?: number }).percent_complete
        };
      }

      if (functionCall.name === 'task_complete') {
        return {
          type: 'complete',
          summary: (args as { summary: string }).summary,
          filesModified: (args as { files_modified?: string[] }).files_modified
        };
      }

      if (functionCall.name === 'task_blocked') {
        return {
          type: 'blocked',
          reason: (args as { reason: string }).reason,
          suggestion: (args as { suggestion?: string }).suggestion
        };
      }

      // Regular tool use
      return {
        type: 'use_tool',
        tool,
        args,
        reasoning: message.content || ''
      };
    }

    // No tool use - check text for completion signals
    const text = message.content || '';
    
    if (text.toLowerCase().includes('task complete') || 
        text.toLowerCase().includes('i have completed')) {
      return {
        type: 'complete',
        summary: text
      };
    }

    // Default: treat as a question/response to user
    return {
      type: 'ask_user',
      question: text
    };
  }

  /**
   * Check if tool needs approval
   */
  private needsApproval(
    session: Session, 
    tool: Tool, 
    args: Record<string, unknown>
  ): boolean {
    const mode = session.preferences.autonomyLevel;

    // Autonomous mode - no approvals needed
    if (mode === 'autonomous') {
      return false;
    }

    // Supervised mode - everything needs approval except auto-approve tools
    if (mode === 'supervised') {
      return !tool.autoApprove;
    }

    // Cautious mode - approve writes and commands
    if (mode === 'cautious') {
      // Auto-approve read operations
      if (tool.autoApprove && !tool.modifiesWorkspace) {
        return false;
      }

      // Approve anything that modifies workspace
      if (tool.modifiesWorkspace) {
        return true;
      }

      // Special case: lint with fix needs approval
      if (tool.name === 'run_lint' && args.fix) {
        return true;
      }

      return false;
    }

    return !tool.autoApprove;
  }

  /**
   * Execute a tool
   */
  private async executeTool(
    toolName: string, 
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.toolRegistry.get(toolName);
    
    if (!tool) {
      return {
        success: false,
        output: '',
        error: `Unknown tool: ${toolName}`,
        duration: 0
      };
    }

    logger.info('Executing tool', { tool: toolName, args });

    try {
      return await tool.execute(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Tool execution failed', { tool: toolName, error });
      return {
        success: false,
        output: '',
        error: message,
        duration: 0
      };
    }
  }

  /**
   * Record tool result in session
   */
  private async recordToolResult(
    session: Session,
    toolName: string,
    args: Record<string, unknown>,
    result: ToolResult,
    approved: boolean
  ): Promise<void> {
    const toolCall: ToolCall = {
      name: toolName,
      args,
      result: result.success ? result.output : result.error,
      approved,
      duration: result.duration
    };

    await this.sessionManager.addToolMessage(
      session,
      toolCall,
      result.success ? result.output : `Error: ${result.error}`
    );
  }

  /**
   * Generate diff preview for file operations
   */
  private async generateDiff(
    toolName: string, 
    args: Record<string, unknown>
  ): Promise<string> {
    const filePath = args.path as string;
    
    try {
      // Read current file content
      const readTool = this.toolRegistry.get('read_file');
      if (!readTool) return '';
      
      const result = await readTool.execute({ path: filePath });
      const oldContent = result.success ? result.output : '';

      if (toolName === 'write_file') {
        const newContent = args.content as string;
        return this.createDiffString(oldContent, newContent, filePath);
      }

      if (toolName === 'edit_file') {
        const search = args.search as string;
        const replace = args.replace as string;
        
        // Find the line numbers
        const lines = oldContent.split('\n');
        let startLine = -1;
        
        for (let i = 0; i < lines.length; i++) {
          if (oldContent.substring(
            lines.slice(0, i).join('\n').length
          ).startsWith(search)) {
            startLine = i + 1;
            break;
          }
        }

        return `File: ${filePath}${startLine > 0 ? ` (around line ${startLine})` : ''}\n` +
               `─────────────────────\n` +
               `- ${search.split('\n').join('\n- ')}\n` +
               `+ ${replace.split('\n').join('\n+ ')}\n` +
               `─────────────────────`;
      }
    } catch {
      // File doesn't exist (new file)
      if (toolName === 'write_file') {
        return `New file: ${filePath}`;
      }
    }

    return '';
  }

  /**
   * Create a simple diff string
   */
  private createDiffString(oldContent: string, newContent: string, filePath: string): string {
    if (!oldContent) {
      return `New file: ${filePath}\n(${newContent.split('\n').length} lines)`;
    }

    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    // Simple diff - show first few changes
    const changes: string[] = [];
    const maxChanges = 10;

    for (let i = 0; i < Math.max(oldLines.length, newLines.length) && changes.length < maxChanges; i++) {
      if (oldLines[i] !== newLines[i]) {
        if (oldLines[i]) changes.push(`- ${oldLines[i]}`);
        if (newLines[i]) changes.push(`+ ${newLines[i]}`);
      }
    }

    if (changes.length === 0) {
      return 'No changes detected';
    }

    return `File: ${filePath}\n─────────────────────\n${changes.join('\n')}\n─────────────────────`;
  }

  /**
   * Auto-commit if enabled
   */
  private async autoCommitIfEnabled(
    session: Session,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<void> {
    if (!session.preferences.autoCommit) return;

    const commitTool = this.toolRegistry.get('git_commit');
    if (!commitTool) return;

    // Generate commit message
    const filePath = args.path as string;
    const action = toolName === 'write_file' ? 'update' : 'edit';
    const message = `${action}: ${filePath.split('/').pop()}`;

    try {
      const result = await commitTool.execute({ 
        message,
        files: [filePath]
      });

      if (result.success && result.metadata?.hash) {
        session.currentTask?.commitsCreated.push(result.metadata.hash as string);
        await this.sessionManager.updateTask(session, {
          commitsCreated: session.currentTask?.commitsCreated || []
        });
      }
    } catch (error) {
      logger.warn('Auto-commit failed', { error });
    }
  }

  /**
   * Get last user message
   */
  private getLastUserMessage(session: Session): string | null {
    for (let i = session.messages.length - 1; i >= 0; i--) {
      if (session.messages[i].role === 'user') {
        return session.messages[i].content;
      }
    }
    return null;
  }

  /**
   * Check if message is a resume intent
   */
  private isResumeIntent(message: string): boolean {
    const resumeWords = ['resume', 'continue', 'go', 'proceed', 'yes'];
    return resumeWords.includes(message.toLowerCase().trim());
  }

  /**
   * Check if message is a stop intent
   */
  private isStopIntent(message: string): boolean {
    const stopWords = ['stop', 'cancel', 'quit', 'abort', 'nevermind', 'never mind'];
    return stopWords.includes(message.toLowerCase().trim());
  }
}
