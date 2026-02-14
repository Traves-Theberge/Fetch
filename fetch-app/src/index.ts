/**
 * @fileoverview Bridge process entry point.
 *
 * Boots env validation, status API, skills, WhatsApp bridge, and shutdown hooks.
 *
 * @module index
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { Bridge } from './bridge/client.js';
import { logger } from './utils/logger.js';
import { startStatusServer, setLogoutCallback } from './api/status.js';
import { validateEnv } from './config/env.js';
import { getSessionStore } from './session/store.js';
import { getTaskStore } from './task/store.js';
import { getSkillManager } from './skills/manager.js';
import { getIdentityManager } from './identity/manager.js';
import { getToolRegistry } from './tools/registry.js';
import { getVersion } from './utils/version.js';

type ExitFn = (code: number) => void;

interface RuntimeOptions {
  exit?: ExitFn;
}

interface Runtime {
  main: () => Promise<void>;
  shutdown: (signal: string) => Promise<void>;
  registerProcessHandlers: () => void;
}

/**
 * Creates an app runtime with injectable process-exit behavior for tests.
 */
export function createRuntime(options: RuntimeOptions = {}): Runtime {
  const exit = options.exit ?? ((code: number) => process.exit(code));

  let activeBridge: Bridge | null = null;
  let shuttingDown = false;
  let handlersRegistered = false;

  const main = async (): Promise<void> => {
    const version = getVersion();
    logger.info(`🐕 Fetch Bridge ${version} starting...`);

    // Validate critical environment variables FIRST (before starting subsystems)
    const { valid, missing } = validateEnv();
    if (!valid) {
      logger.error(`Missing required environment variables: ${missing.join(', ')}`);
      exit(1);
      return;
    }

    // Start status API server
    startStatusServer();

    try {
      // Load skills (builtin + user) before bridge starts accepting messages
      await getSkillManager().init();

      const bridge = new Bridge();
      await bridge.initialize();
      activeBridge = bridge;

      // Register logout callback for the status API
      setLogoutCallback(async () => {
        logger.info('🔌 Logout requested via API, destroying bridge...');
        await bridge.destroy();
        activeBridge = null;
        logger.info('✅ Bridge destroyed, WhatsApp disconnected');
      });

      logger.info('✅ Fetch Bridge is ready and listening!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('Failed to initialize Fetch Bridge:', { message: errorMessage, stack: errorStack });
      exit(1);
    }
  };

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`🛑 Received ${signal}, shutting down gracefully...`);

    try {
      // 1. Kill any running harness child processes
      const { getHarnessPool } = await import('./harness/pool.js');
      try {
        const pool = getHarnessPool();
        pool.getSpawner().killAll();
      } catch { /* pool may never have been created */ }

      // 2. Destroy WhatsApp bridge (closes Puppeteer + WebSocket)
      if (activeBridge) {
        await activeBridge.destroy();
        activeBridge = null;
      }

      // 3. Flush & close SQLite databases
      try { getSessionStore().close(); } catch { /* may not be initialized */ }
      try { getTaskStore().close(); } catch { /* may not be initialized */ }

      // 4. Shutdown file watchers and manager-owned resources
      try { await getSkillManager().shutdown(); } catch { /* may not be initialized */ }
      try { getIdentityManager().shutdown(); } catch { /* may not be initialized */ }
      try { await getToolRegistry().shutdown(); } catch { /* may not be initialized */ }
    } catch (error) {
      logger.error('Error during shutdown', { error });
    }

    logger.info('👋 Goodbye.');
    exit(0);
  };

  const registerProcessHandlers = (): void => {
    if (handlersRegistered) return;
    handlersRegistered = true;

    process.on('unhandledRejection', (reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      logger.error('Unhandled rejection', { message, stack });
    });

    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception - exiting', { message: error.message, stack: error.stack });
      exit(1);
    });

    process.on('SIGINT', () => { void shutdown('SIGINT'); });
    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  };

  return { main, shutdown, registerProcessHandlers };
}

const runtime = createRuntime();

/**
 * Starts the bridge runtime.
 */
export async function main(): Promise<void> {
  await runtime.main();
}

/**
 * Performs graceful shutdown.
 */
export async function shutdown(signal: string): Promise<void> {
  await runtime.shutdown(signal);
}

function isCliEntrypoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isCliEntrypoint()) {
  runtime.registerProcessHandlers();
  void runtime.main();
}
