/**
 * Fetch Bridge - Command Handlers
 * 
 * Handles special commands that don't require AI agent processing.
 */

import { TaskManager } from '../tasks/manager.js';
import { DockerExecutor } from '../executor/docker.js';

export interface CommandResult {
  handled: boolean;
  response?: string;
}

const COMMANDS = {
  HELP: /^(help|commands|\?)$/i,
  STATUS: /^(status|tasks?)$/i,
  PING: /^ping$/i,
  CLEAR: /^clear$/i,
};

export class CommandHandler {
  private taskManager: TaskManager;
  private executor: DockerExecutor;

  constructor(taskManager: TaskManager, executor: DockerExecutor) {
    this.taskManager = taskManager;
    this.executor = executor;
  }

  /**
   * Try to handle a message as a built-in command
   * Returns { handled: true, response } if handled, { handled: false } otherwise
   */
  async handle(message: string): Promise<CommandResult> {
    const trimmed = message.trim();

    if (COMMANDS.HELP.test(trimmed)) {
      return { handled: true, response: this.getHelp() };
    }

    if (COMMANDS.STATUS.test(trimmed)) {
      return { handled: true, response: await this.getStatus() };
    }

    if (COMMANDS.PING.test(trimmed)) {
      return { handled: true, response: '🏓 Pong! Fetch is awake and ready.' };
    }

    if (COMMANDS.CLEAR.test(trimmed)) {
      return { handled: true, response: '🧹 Context cleared. What would you like to work on?' };
    }

    return { handled: false };
  }

  private getHelp(): string {
    return `🐕 *Fetch - Your Loyal Dev-Retriever*

*Available Commands:*
• \`help\` - Show this message
• \`status\` - Check recent task status
• \`ping\` - Check if Fetch is responsive

*AI Agents:*
Just describe what you need and Fetch will route to the right agent:

📝 *Claude* - Complex coding tasks
  _"Refactor the auth module to use JWT"_
  _"Fix the memory leak in the worker"_

💡 *Gemini* - Explanations & reviews
  _"Explain how React hooks work"_
  _"Review this function for bugs"_

🐙 *Copilot* - Git & GitHub help
  _"Why is my push failing?"_
  _"How do I rebase onto main?"_

Just send your request and I'll fetch the answer! 🎾`;
  }

  private async getStatus(): Promise<string> {
    const tasks = this.taskManager.getRecentTasks(5);
    const kennelRunning = await this.executor.isKennelRunning();

    let status = '📊 *Fetch Status*\n\n';
    
    // System status
    status += '*System:*\n';
    status += kennelRunning 
      ? '✅ Kennel container running\n' 
      : '❌ Kennel container not running\n';
    status += '\n';

    // Recent tasks
    status += '*Recent Tasks:*\n';
    if (tasks.length === 0) {
      status += '_No tasks yet_\n';
    } else {
      for (const task of tasks) {
        const icon = task.status === 'COMPLETED' ? '✅' 
          : task.status === 'FAILED' ? '❌' 
          : task.status === 'IN_PROGRESS' ? '⏳' 
          : '📋';
        status += `${icon} \`${task.id}\` ${task.agent} - ${task.status}\n`;
      }
    }

    return status;
  }
}
