/**
 * Fetch Bridge - The Brain
 * 
 * WhatsApp to AI Agent orchestration layer.
 * Security-first design with strict whitelist enforcement.
 */

import 'dotenv/config';
import { Bridge } from './bridge/client.js';
import { logger } from './utils/logger.js';
import { startStatusServer } from './api/status.js';

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

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

main();
