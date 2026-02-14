/**
 * @fileoverview Bridge process entry point.
 *
 * Boots env validation, status API, skills, WhatsApp bridge, and shutdown hooks.
 *
 * @module index
 */

import 'dotenv/config';
import { Bridge } from './bridge/client.js';
import { logger } from './utils/logger.js';
import { startStatusServer, setLogoutCallback } from './api/status.js';
import { validateEnv } from './config/env.js';
import { getSessionStore } from './session/store.js';
import { getTaskStore } from './task/store.js';
import { getSkillManager } from './skills/manager.js';
import { getVersion } from './utils/version.js';

/** Module-scoped bridge reference for graceful shutdown */
let activeBridge: Bridge | null = null;

/** Bootstraps the bridge runtime and exits on unrecoverable startup errors. */
async function main(): Promise<void> {
  const version = getVersion();
  logger.info(`🐕 Fetch Bridge ${version} starting...`);

  // Validate critical environment variables FIRST (before starting subsystems)
  const { valid, missing } = validateEnv();
  if (!valid) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
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
    // Properly serialize error for logging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Failed to initialize Fetch Bridge:', { message: errorMessage, stack: errorStack });
    process.exit(1);
  }
}

// =============================================================================
// Graceful Shutdown
// =============================================================================

let shuttingDown = false;

/** Performs ordered shutdown of harnesses, bridge client, and stores. */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return; // guard against double-signal
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
  } catch (error) {
    logger.error('Error during shutdown', { error });
  }

  logger.info('👋 Goodbye.');
  process.exit(0);
}

// =============================================================================
// Global Error Handlers
// =============================================================================

/** Logs unhandled promise rejections for diagnostics. */
process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error('Unhandled rejection', { message, stack });
});

/** Logs uncaught exceptions and terminates the process. */
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception — exiting', { message: error.message, stack: error.stack });
  process.exit(1);
});

process.on('SIGINT', () => { shutdown('SIGINT'); });
process.on('SIGTERM', () => { shutdown('SIGTERM'); });

// Start the application
main();
