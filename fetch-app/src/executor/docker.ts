/**
 * Docker Executor - The Supervisor
 * 
 * Executes AI CLI tools inside the Kennel container.
 * 
 * SECURITY: Uses array-based argument passing to prevent shell injection.
 * NEVER concatenates user input into shell strings.
 */

import Docker from 'dockerode';
import { logger } from '../utils/logger.js';

const KENNEL_CONTAINER = 'fetch-kennel';
const EXECUTION_TIMEOUT = 300000; // 5 minutes

export class DockerExecutor {
  private docker: Docker;

  constructor() {
    // Connect to Docker socket
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  /**
   * Execute a command in the Kennel container
   * 
   * SECURITY: Arguments are passed as an array, never concatenated
   */
  private async execInKennel(cmd: string[]): Promise<string> {
    logger.info(`Executing in kennel: ${cmd[0]}`);

    try {
      const container = this.docker.getContainer(KENNEL_CONTAINER);
      
      // Create exec instance with array-based command
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: '/workspace'
      });

      // Start execution with timeout
      const stream = await exec.start({ hijack: true, stdin: false });
      
      return new Promise((resolve, reject) => {
        let output = '';
        let errorOutput = '';

        // Set timeout
        const timeout = setTimeout(() => {
          reject(new Error('Execution timed out after 5 minutes'));
        }, EXECUTION_TIMEOUT);

        // Handle stream data
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });

        stream.on('end', () => {
          clearTimeout(timeout);
          if (errorOutput && !output) {
            resolve(errorOutput); // Some tools write to stderr
          } else {
            resolve(output || 'Command completed with no output');
          }
        });

        stream.on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    } catch (error) {
      logger.error('Docker execution error:', error);
      throw error;
    }
  }

  /**
   * Run Claude Code CLI
   * Uses environment variable ANTHROPIC_API_KEY from container
   */
  async runClaude(prompt: string): Promise<string> {
    // SECURITY: prompt is passed as a separate array element
    return this.execInKennel([
      'claude',
      '--print',
      prompt
    ]);
  }

  /**
   * Run Gemini CLI
   * Uses environment variable GEMINI_API_KEY from container
   */
  async runGemini(prompt: string): Promise<string> {
    // SECURITY: prompt is passed as a separate array element
    return this.execInKennel([
      'gemini',
      prompt
    ]);
  }

  /**
   * Run GitHub Copilot CLI
   * Uses pre-authenticated hosts.json mounted in container
   */
  async runCopilot(prompt: string): Promise<string> {
    // SECURITY: prompt is passed as a separate array element
    return this.execInKennel([
      'gh',
      'copilot',
      'explain',
      prompt
    ]);
  }

  /**
   * Check if Kennel container is running
   */
  async isKennelRunning(): Promise<boolean> {
    try {
      const container = this.docker.getContainer(KENNEL_CONTAINER);
      const info = await container.inspect();
      return info.State.Running;
    } catch {
      return false;
    }
  }
}
