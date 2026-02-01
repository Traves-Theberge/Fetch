/**
 * Orchestrator - The Brain
 * 
 * Uses OpenRouter to parse user intent and dispatch to appropriate AI agents.
 * Maintains task state and history.
 */

import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { TaskManager, Task } from '../tasks/manager.js';
import { DockerExecutor } from '../executor/docker.js';
import { sanitizeOutput } from '../utils/sanitize.js';

interface ActionPlan {
  tool: 'claude' | 'gemini' | 'copilot' | 'status' | 'help';
  args: string[];
  explanation: string;
}

export class Orchestrator {
  private openai: OpenAI;
  private taskManager: TaskManager;
  private executor: DockerExecutor;

  constructor() {
    this.openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    this.taskManager = new TaskManager();
    this.executor = new DockerExecutor();
  }

  /**
   * Process a user message and return a response
   */
  async process(message: string): Promise<string> {
    try {
      // Parse user intent
      const actionPlan = await this.parseIntent(message);
      
      logger.info(`Action plan: ${JSON.stringify(actionPlan)}`);

      // Handle built-in commands
      if (actionPlan.tool === 'status') {
        return this.getStatus();
      }

      if (actionPlan.tool === 'help') {
        return this.getHelp();
      }

      // Create task and execute
      const task = await this.taskManager.createTask({
        agent: actionPlan.tool,
        prompt: message,
        args: actionPlan.args
      });

      // Execute the task
      const result = await this.executeTask(task, actionPlan);
      
      return result;
    } catch (error) {
      logger.error('Orchestrator error:', error);
      return '❌ Failed to process your request. Please try again.';
    }
  }

  /**
   * Parse user intent using OpenRouter
   */
  private async parseIntent(message: string): Promise<ActionPlan> {
    const systemPrompt = `You are Fetch, a helpful AI assistant that routes coding tasks to the appropriate tool.

Available tools:
- claude: For complex refactoring, code generation, bug fixes, and architectural changes
- gemini: For quick explanations, documentation questions, and code reviews
- copilot: For git-related tasks, GitHub operations, and repository management
- status: To check the status of running tasks
- help: To show available commands

Analyze the user's message and respond with a JSON object:
{
  "tool": "claude" | "gemini" | "copilot" | "status" | "help",
  "args": ["array", "of", "arguments"],
  "explanation": "Brief explanation of what will be done"
}

IMPORTANT: Respond ONLY with the JSON object, no other text.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      const content = response.choices[0]?.message?.content || '';
      return JSON.parse(content) as ActionPlan;
    } catch (error) {
      logger.error('Failed to parse intent:', error);
      // Default to claude for unknown intents
      return {
        tool: 'claude',
        args: [message],
        explanation: 'Forwarding to Claude for processing'
      };
    }
  }

  /**
   * Execute a task using the appropriate agent
   */
  private async executeTask(task: Task, actionPlan: ActionPlan): Promise<string> {
    await this.taskManager.updateStatus(task.id, 'IN_PROGRESS');

    try {
      let result: string;

      switch (actionPlan.tool) {
        case 'claude':
          result = await this.executor.runClaude(actionPlan.args.join(' '));
          break;
        case 'gemini':
          result = await this.executor.runGemini(actionPlan.args.join(' '));
          break;
        case 'copilot':
          result = await this.executor.runCopilot(actionPlan.args.join(' '));
          break;
        default:
          result = 'Unknown tool specified';
      }

      // Sanitize output before returning
      const sanitized = sanitizeOutput(result);
      
      await this.taskManager.updateStatus(task.id, 'COMPLETED', sanitized);
      
      return `✅ *Task ${task.id}*\n\n${actionPlan.explanation}\n\n\`\`\`\n${sanitized}\n\`\`\``;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await this.taskManager.updateStatus(task.id, 'FAILED', errorMsg);
      return `❌ *Task ${task.id} Failed*\n\n${errorMsg}`;
    }
  }

  private getStatus(): string {
    const tasks = this.taskManager.getRecentTasks(5);
    if (tasks.length === 0) {
      return '📋 No recent tasks.';
    }

    const taskList = tasks.map(t => 
      `• ${t.id}: ${t.status} (${t.agent})`
    ).join('\n');

    return `📋 *Recent Tasks*\n\n${taskList}`;
  }

  private getHelp(): string {
    return `🐕 *Fetch Commands*

I can help you with coding tasks! Just describe what you need:

• *"Fix the bug in auth.ts"* → Claude handles complex fixes
• *"Explain how useEffect works"* → Gemini for explanations  
• *"Why is my git push failing?"* → Copilot for git issues
• *"status"* → Check recent task status

Just send me a message describing your task!`;
  }
}
