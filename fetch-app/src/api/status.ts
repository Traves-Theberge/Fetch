/**
 * Status API Server
 * 
 * Exposes bridge status, QR code, and auth state for the Go TUI.
 * Also serves the documentation site at /docs
 * Port 8765 (internal to Docker network)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

const PORT = 8765;
const DOCS_PATH = '/app/docs';

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
    const url = req.url || '/';
    
    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');

    // API Routes
    if (req.method === 'GET' && url === '/api/status') {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify(getStatus()));
      return;
    }
    
    if (req.method === 'GET' && url === '/api/health') {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({ healthy: true }));
      return;
    }
    
    // Documentation Routes
    if (req.method === 'GET' && (url === '/docs' || url === '/docs/')) {
      res.writeHead(302, { Location: '/docs/index.html' });
      res.end();
      return;
    }
    
    if (req.method === 'GET' && url.startsWith('/docs/')) {
      const filePath = path.join(DOCS_PATH, url.slice(6)); // Remove '/docs/'
      serveStaticFile(filePath, res);
      return;
    }
    
    // Root redirect to docs
    if (req.method === 'GET' && url === '/') {
      res.writeHead(302, { Location: '/docs/' });
      res.end();
      return;
    }
    
    // 404
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Status API listening on port ${PORT}`);
    logger.info(`Documentation available at http://localhost:${PORT}/docs`);
  });

  server.on('error', (err) => {
    logger.error('Status API server error:', err);
  });
}

/**
 * Serve a static file with appropriate content type
 */
function serveStaticFile(filePath: string, res: http.ServerResponse): void {
  // Security: prevent directory traversal
  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(DOCS_PATH)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  // Content type mapping
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
  };
  
  fs.readFile(normalizedPath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not found');
      } else {
        res.writeHead(500);
        res.end('Internal server error');
      }
      return;
    }
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.writeHead(200);
    res.end(data);
  });
}
