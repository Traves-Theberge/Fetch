/**
 * Status API Server
 * 
 * Exposes bridge status, QR code, and auth state for the Go TUI.
 * Port 8765 (internal to Docker network)
 */

import http from 'http';
import { logger } from '../utils/logger.js';

const PORT = 8765;

export interface BridgeStatus {
  state: 'initializing' | 'qr_pending' | 'authenticated' | 'disconnected' | 'error';
  qrCode: string | null;
  qrUrl: string | null;
  uptime: number;
  messageCount: number;
  lastError: string | null;
}

// Global status (updated by bridge events)
let status: BridgeStatus = {
  state: 'initializing',
  qrCode: null,
  qrUrl: null,
  uptime: 0,
  messageCount: 0,
  lastError: null
};

const startTime = Date.now();

/**
 * Update bridge status (called from bridge events)
 */
export function updateStatus(update: Partial<BridgeStatus>): void {
  status = { ...status, ...update };
  logger.debug('Status updated:', { state: status.state });
}

/**
 * Increment message count
 */
export function incrementMessageCount(): void {
  status.messageCount++;
}

/**
 * Get current status
 */
export function getStatus(): BridgeStatus {
  return {
    ...status,
    uptime: Math.floor((Date.now() - startTime) / 1000)
  };
}

/**
 * Start the status API server
 */
export function startStatusServer(): void {
  const server = http.createServer((req, res) => {
    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && req.url === '/api/status') {
      res.writeHead(200);
      res.end(JSON.stringify(getStatus()));
    } else if (req.method === 'GET' && req.url === '/api/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ healthy: true }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Status API listening on port ${PORT}`);
  });

  server.on('error', (err) => {
    logger.error('Status API server error:', err);
  });
}
