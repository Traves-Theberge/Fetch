/**
 * @fileoverview Fetch Bridge - The Brain
 * 
 * Main entry point for the Fetch WhatsApp-to-AI agent orchestration layer.
 * Initializes the bridge, validates environment, and handles graceful shutdown.
 * 
 * @module index
 * @see {@link module:bridge/client} For WhatsApp bridge implementation
 * @see {@link module:api/status} For health check API
 * @see {@link module:utils/logger} For logging utilities
 * 
 * ## Architecture Overview
 * 
 * ```
 * ┌─────────────────────────────────────────────────────┐
 * │                    Fetch Bridge                      │
 * │                   (Entry Point)                      │
 * └──────────────┬──────────────────────┬───────────────┘
 *                │                      │
 *        ┌───────▼───────┐      ┌───────▼───────┐
 *        │ Status API    │      │ WhatsApp      │
 *        │ (Port 3000)   │      │ Bridge        │
 *        └───────────────┘      └───────┬───────┘
 *                                       │
 *                               ┌───────▼───────┐
 *                               │ Message       │
 *                               │ Handler       │
 *                               └───────┬───────┘
 *                                       │
 *                 ┌─────────────────────┼─────────────────────┐
 *                 │                     │                     │
 *         ┌───────▼───────┐     ┌───────▼───────┐     ┌───────▼───────┐
 *         │ Conversation  │     │   Inquiry     │     │   Action      │
 *         │ Mode          │     │   Mode        │     │   Mode        │
 *         └───────────────┘     └───────────────┘     └───────────────┘
 * ```
 * 
 * ## Required Environment Variables
 * 
 * | Variable | Description |
 * |----------|-------------|
 * | OWNER_PHONE_NUMBER | Whitelisted phone number for access |
 * | OPENROUTER_API_KEY | API key for LLM access |
 * 
 * ## Security
 * 
 * - Strict whitelist enforcement via OWNER_PHONE_NUMBER
 * - All messages from non-whitelisted numbers are rejected
 * - Rate limiting prevents abuse
 * 
 * @example
 * ```bash
 * # Start the Fetch bridge
 * npm start
 * 
 * # Or with nodemon for development
 * npm run dev
 * ```
 */

import 'dotenv/config';
import { Bridge } from './bridge/client.js';
import { logger } from './utils/logger.js';
import { startStatusServer } from './api/status.js';

/**
 * Main application entry point.
 * 
 * Initializes the status API server, validates required environment
 * variables, and starts the WhatsApp bridge.
 * 
 * @async
 * @function main
 * @returns {Promise<void>}
 */
async function main(): Promise<void> {
  logger.info('🐕 Fetch Bridge starting...');
  
  // Start status API server first
  startStatusServer();
  
  // Validate critical environment variables
  const requiredEnvVars = [
    'OWNER_PHONE_NUMBER',
    'OPENROUTER_API_KEY'
  ];

  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missingVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
  }

  try {
    const bridge = new Bridge();
    await bridge.initialize();
    
    logger.info('✅ Fetch Bridge is ready and listening!');
  } catch (error) {
    // Properly serialize error for logging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Failed to initialize Fetch Bridge:', { message: errorMessage, stack: errorStack });
    process.exit(1);
  }
}

/**
 * Handle SIGINT signal for graceful shutdown.
 * Triggered by Ctrl+C in terminal.
 */
process.on('SIGINT', () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

/**
 * Handle SIGTERM signal for graceful shutdown.
 * Triggered by Docker stop or process manager.
 */
process.on('SIGTERM', () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the application
main();
