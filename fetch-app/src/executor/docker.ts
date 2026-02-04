/**
 * @fileoverview Docker Executor Module - The Supervisor
 * 
 * Executes AI CLI tools (Copilot, Claude, Gemini) inside the Kennel container.
 * Provides a secure execution environment for AI-powered coding assistants
 * with support for toggling between different providers.
 * 
 * @module executor/docker
 * @see {@link module:bridge/client} For WhatsApp bridge integration
 * @see {@link module:utils/logger} For logging utilities
 * 
 * ## Security Model
 * 
 * - Uses array-based argument passing to prevent shell injection
 * - NEVER concatenates user input into shell strings
 * - All execution happens inside isolated Docker container
 * - 5-minute execution timeout to prevent runaway processes
 * 
 * ## Supported CLI Providers
 * 
 * | Provider | Auth Method | Environment Variable |
 * |----------|-------------|---------------------|
 * | Copilot | ~/.config/gh/ mounted | ENABLE_COPILOT |
 * | Claude | ~/.config/claude-code/ mounted | ENABLE_CLAUDE |
 * | Gemini | ~/.gemini/ or GEMINI_API_KEY | ENABLE_GEMINI |
 * 
 * ## Architecture
 * 
 * ```
 * ┌───────────────────────────────────────────┐
 * │            Fetch Bridge                    │
 * │         (fetch-app container)              │
 * └──────────────┬────────────────────────────┘
 *                │ Docker API
 *                ▼
 * ┌───────────────────────────────────────────┐
 * │          Kennel Container                  │
 * │    ┌─────────────────────────────────┐    │
 * │    │  AI CLI Execution Environment   │    │
 * │    │  • gh copilot                   │    │
 * │    │  • claude                       │    │
 * │    │  • gemini                       │    │
 * │    └─────────────────────────────────┘    │
 * │    ┌─────────────────────────────────┐    │
 * │    │       /workspace volume         │    │
 * │    │    (mounted project files)      │    │
 * │    └─────────────────────────────────┘    │
 * └───────────────────────────────────────────┘
 * ```
 * 
 * @example
 * ```typescript
 * import { DockerExecutor } from './docker.js';
 * 
 * const executor = new DockerExecutor();
 * 
 * // Check what's available
 * const enabled = executor.getEnabledCLIs();
 * // => ['copilot', 'claude']
 * 
 * // Run with first available CLI
 * const { cli, result } = await executor.runWithAvailableCLI('Explain this code');
 * console.log(`${cli} responded: ${result}`);
 * ```
 */

import Docker from 'dockerode';
import { logger } from '../utils/logger.js';

/**
 * Container name for the Kennel execution environment.
 * @constant {string}
 */
const KENNEL_CONTAINER = 'fetch-kennel';

/**
 * Maximum execution time before timeout (5 minutes).
 * @constant {number}
 */
const EXECUTION_TIMEOUT = 300000; // 5 minutes

/**
 * Available CLI providers for AI-assisted coding.
 * @typedef {'copilot' | 'claude' | 'gemini'} CLIProvider
 */
/** Available CLI providers */
export type CLIProvider = 'copilot' | 'claude' | 'gemini';

/**
 * Configuration flags for enabled CLI providers.
 * @interface CLIConfig
 * @property {boolean} copilot - Whether GitHub Copilot CLI is enabled
 * @property {boolean} claude - Whether Claude CLI is enabled
 * @property {boolean} gemini - Whether Gemini CLI is enabled
 */
/** CLI configuration from environment */
interface CLIConfig {
  copilot: boolean;
  claude: boolean;
  gemini: boolean;
}

/**
 * Docker executor for running AI CLIs in the Kennel container.
 * 
 * Manages connection to Docker, CLI toggle configuration, and
 * secure command execution with timeout handling.
 * 
 * @class DockerExecutor
 */
export class DockerExecutor {
  /** @private Docker API client */
  private docker: Docker;
  /** @private Enabled CLI configuration from environment */
  private enabledCLIs: CLIConfig;

  /**
   * Create a new DockerExecutor.
   * 
   * Connects to Docker via Unix socket and loads CLI toggle
   * configuration from environment variables.
   */
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
   * Get list of enabled CLI providers.
   * 
   * @returns {CLIProvider[]} Array of enabled provider names
   */
  getEnabledCLIs(): CLIProvider[] {
    const enabled: CLIProvider[] = [];
    if (this.enabledCLIs.copilot) enabled.push('copilot');
    if (this.enabledCLIs.claude) enabled.push('claude');
    if (this.enabledCLIs.gemini) enabled.push('gemini');
    return enabled;
  }

  /**
   * Check if a specific CLI provider is enabled.
   * 
   * @param {CLIProvider} cli - The CLI provider to check
   * @returns {boolean} True if the provider is enabled
   */
  isEnabled(cli: CLIProvider): boolean {
    return this.enabledCLIs[cli];
  }

  /**
   * Execute a command in the Kennel container.
   * 
   * SECURITY: Arguments are passed as an array, never concatenated
   * into a shell string. This prevents command injection attacks.
   * 
   * @param {string[]} cmd - Command and arguments as array
   * @returns {Promise<string>} Command output
   * @throws {Error} If execution times out or container is not available
   * @private
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
        const errorOutput = '';

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
   * Run GitHub Copilot CLI with a prompt.
   * 
   * Auth: Uses ~/.config/gh/ mounted from host.
   * 
   * @param {string} prompt - The prompt to send to Copilot
   * @returns {Promise<string>} Copilot's response
   * @throws {Error} If Copilot is not enabled
   */
  async runCopilot(prompt: string): Promise<string> {
    if (!this.enabledCLIs.copilot) {
      throw new Error('Copilot CLI is not enabled. Set ENABLE_COPILOT=true in .env');
    }
    return this.execInKennel(['gh', 'copilot', 'suggest', prompt]);
  }

  /**
   * Run Claude Code CLI with a prompt.
   * 
   * Auth: Uses ~/.config/claude-code/ mounted from host.
   * Note: Uses --dangerously-skip-permissions flag for non-interactive mode.
   * 
   * @param {string} prompt - The prompt to send to Claude
   * @returns {Promise<string>} Claude's response
   * @throws {Error} If Claude is not enabled
   */
  async runClaude(prompt: string): Promise<string> {
    if (!this.enabledCLIs.claude) {
      throw new Error('Claude CLI is not enabled. Set ENABLE_CLAUDE=true in .env');
    }
    return this.execInKennel(['claude', '-p', prompt, '--dangerously-skip-permissions']);
  }

  /**
   * Run Gemini CLI with a prompt.
   * 
   * Auth: Uses ~/.gemini/ mounted from host OR GEMINI_API_KEY env var.
   * 
   * @param {string} prompt - The prompt to send to Gemini
   * @returns {Promise<string>} Gemini's response
   * @throws {Error} If Gemini is not enabled
   */
  async runGemini(prompt: string): Promise<string> {
    if (!this.enabledCLIs.gemini) {
      throw new Error('Gemini CLI is not enabled. Set ENABLE_GEMINI=true in .env');
    }
    return this.execInKennel(['gemini', '-p', prompt]);
  }

  /**
   * Run prompt with the first available enabled CLI.
   * 
   * Tries each enabled CLI in order (copilot, claude, gemini) until
   * one succeeds. Useful when you don't care which provider handles
   * the request.
   * 
   * @param {string} prompt - The prompt to send
   * @returns {Promise<{cli: CLIProvider, result: string}>} Provider used and result
   * @throws {Error} If no CLIs are enabled or all fail
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
   * Check if the Kennel container is running.
   * 
   * @returns {Promise<boolean>} True if container is running
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
