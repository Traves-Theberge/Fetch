/**
 * @fileoverview Polling Configuration Loader
 * 
 * Parses POLLING.md to load polling tasks into the PollingService.
 */

import fs from 'fs/promises';
import { logger } from '../utils/logger.js';
import { getPollingService } from './polling.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { POLLING_FILE } from '../config/paths.js';

const execAsync = promisify(exec);

// Path to polling config
const POLLING_FILE_PATH = POLLING_FILE;

interface ParsedTask {
  id: string;
  interval: string;
  command: string;
  enabled: boolean;
}

export class PollingLoader {
  /**
   * Load polling tasks from configuration file
   */
  public async load(): Promise<void> {
    try {
      const content = await this.readConfigFile();
      if (!content) return;

      const tasks = this.parseMarkdown(content);
      this.registerTasks(tasks);
      
      logger.info(`Loaded ${tasks.length} polling tasks from POLLING.md`);
    } catch (error) {
      logger.warn('Failed to load POLLING.md:', error);
    }
  }

  private async readConfigFile(): Promise<string | null> {
    try {
      await fs.access(POLLING_FILE_PATH);
      return await fs.readFile(POLLING_FILE_PATH, 'utf-8');
    } catch {
      logger.warn(`POLLING.md not found at ${POLLING_FILE_PATH}`);
      return null;
    }
  }

  /**
   * Parse markdown content into structured tasks
   * Expected format:
   * ### Task Name
   * - **ID:** `id`
   * - **Interval:** 10m
   * - **Command:** `cmd`
   * - **Enabled:** true
   */
  private parseMarkdown(content: string): ParsedTask[] {
    const tasks: ParsedTask[] = [];
    const sections = content.split('###').slice(1); // Skip header

    for (const section of sections) {
      const task: Partial<ParsedTask> = {};
      
      // Extract fields using regex
      const idMatch = section.match(/- \*\*ID:\*\* `([^`]+)`/);
      const intervalMatch = section.match(/- \*\*Interval:\*\* ([\d\w]+)/);
      const commandMatch = section.match(/- \*\*Command:\*\* `([^`]+)`/);
      const enabledMatch = section.match(/- \*\*Enabled:\*\* (true|false)/);

      if (idMatch && intervalMatch && commandMatch) {
         task.id = idMatch[1];
         task.interval = intervalMatch[1];
         task.command = commandMatch[1];
         task.enabled = enabledMatch ? enabledMatch[1] === 'true' : true; // Default true

         tasks.push(task as ParsedTask);
      }
    }

    return tasks;
  }

  private registerTasks(tasks: ParsedTask[]): void {
    const service = getPollingService();

    for (const t of tasks) {
      // Convert interval string (e.g., "10m") to ms
      const intervalMs = this.parseInterval(t.interval);
      
      service.addTask({
        id: t.id,
        name: t.id, // Use ID as name for now
        intervalMs: intervalMs,
        enabled: t.enabled,
        handler: async () => {
          logger.info(`Executing polling task: ${t.id}`);
          try {
             // For now, we execute the command. 
             // In future, we might map to internal handlers.
             const { stdout, stderr } = await execAsync(t.command);
             if (stdout) logger.debug(`[${t.id}] stdout: ${stdout.trim()}`);
             if (stderr) logger.warn(`[${t.id}] stderr: ${stderr.trim()}`);
          } catch (err: unknown) {
             const message = err instanceof Error ? err.message : String(err);
             throw new Error(`Command failed: ${message}`);
          }
        }
      });
    }
  }

  private parseInterval(interval: string): number {
    const value = parseInt(interval.slice(0, -1));
    const unit = interval.slice(-1);

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 60000; // Default 1m
    }
  }
}

export const loadPollingConfig = () => new PollingLoader().load();
