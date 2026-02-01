/**
 * Docker Executor - The Supervisor
 * 
 * Executes AI CLI tools inside the Kennel container.
 * Supports toggling between Claude, Gemini, and GitHub Copilot.
 * 
 * SECURITY: Uses array-based argument passing to prevent shell injection.
 * NEVER concatenates user input into shell strings.
 */

import Docker from 'dockerode';
import { logger } from '../utils/logger.js';

const KENNEL_CONTAINER = 'fetch-kennel';
const EXECUTION_TIMEOUT = 300000; // 5 minutes

/** Available CLI providers */
export type CLIProvider = 'copilot' | 'claude' | 'gemini';

/** CLI configuration from environment */
interface CLIConfig {
  copilot: boolean;
  claude: boolean;
  gemini: boolean;
}

export class DockerExecutor {
  private docker: Docker;
  private enabledCLIs: CLIConfig;

  constructor() {
    // Connect to Docker socket
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
    
    // Load CLI toggle configuration from environment
    this.enabledCLIs = {
      copilot: process.env.ENABLE_COPILOT !== 'false',
      claude: process.env.ENABLE_CLAUDE === 'true',
      gemini: process.env.ENABLE_GEMINI === 'true'
    };
    
    logger.info('Enabled CLIs:', this.getEnabledCLIs());
  }

  /**
   * Get list of enabled CLI providers
   */
  getEnabledCLIs(): CLIProvider[] {
    const enabled: CLIProvider[] = [];
    if (this.enabledCLIs.copilot) enabled.push('copilot');
    if (this.enabledCLIs.claude) enabled.push('claude');
    if (this.enabledCLIs.gemini) enabled.push('gemini');
    return enabled;
  }

  /**
   * Check if a specific CLI is enabled
   */
  isEnabled(cli: CLIProvider): boolean {
    return this.enabledCLIs[cli];
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
   * Run GitHub Copilot CLI
   * Auth: Uses ~/.config/gh/ mounted from host
   */
  async runCopilot(prompt: string): Promise<string> {
    if (!this.enabledCLIs.copilot) {
      throw new Error('Copilot CLI is not enabled. Set ENABLE_COPILOT=true in .env');
    }
    return this.execInKennel(['gh', 'copilot', 'suggest', prompt]);
  }

  /**
   * Run Claude Code CLI
   * Auth: Uses ~/.config/claude-code/ mounted from host
   */
  async runClaude(prompt: string): Promise<string> {
    if (!this.enabledCLIs.claude) {
      throw new Error('Claude CLI is not enabled. Set ENABLE_CLAUDE=true in .env');
    }
    return this.execInKennel(['claude', '-p', prompt, '--dangerously-skip-permissions']);
  }

  /**
   * Run Gemini CLI
   * Auth: Uses ~/.gemini/ mounted from host OR GEMINI_API_KEY env var
   */
  async runGemini(prompt: string): Promise<string> {
    if (!this.enabledCLIs.gemini) {
      throw new Error('Gemini CLI is not enabled. Set ENABLE_GEMINI=true in .env');
    }
    return this.execInKennel(['gemini', '-p', prompt]);
  }

  /**
   * Run prompt with the first available enabled CLI
   */
  async runWithAvailableCLI(prompt: string): Promise<{ cli: CLIProvider; result: string }> {
    const enabled = this.getEnabledCLIs();
    if (enabled.length === 0) {
      throw new Error('No CLIs enabled. Enable at least one in .env');
    }
    
    // Try each enabled CLI in order
    for (const cli of enabled) {
      try {
        let result: string;
        switch (cli) {
          case 'copilot':
            result = await this.runCopilot(prompt);
            break;
          case 'claude':
            result = await this.runClaude(prompt);
            break;
          case 'gemini':
            result = await this.runGemini(prompt);
            break;
        }
        return { cli, result };
      } catch (error) {
        logger.warn(`${cli} failed, trying next CLI...`, error);
        continue;
      }
    }
    
    throw new Error('All enabled CLIs failed');
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
