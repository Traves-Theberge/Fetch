/**
 * @fileoverview Status API Server
 * 
 * Exposes bridge status, QR code, and authentication state via HTTP.
 * Used by the Go TUI manager to display connection status.
 * Also serves the documentation site at /docs.
 * 
 * @module api/status
 * @see {@link startStatusServer} - Start the HTTP server
 * @see {@link updateStatus} - Update bridge status
 * @see {@link getStatus} - Get current status
 * 
 * ## Endpoints
 * 
 * | Method | Path | Description |
 * |--------|------|------------|
 * | GET | /api/status | Current bridge status (JSON) |
 * | GET | /api/health | Lightweight health check (Go TUI) |
 * | POST | /api/logout | Disconnect WhatsApp (admin token) |
 * | GET | /docs/* | Documentation site (static) |
 * 
 * ## Status States
 * 
 * | State | Description |
 * |-------|------------|
 * | initializing | Bridge starting up |
 * | qr_pending | QR code displayed, awaiting scan |
 * | authenticated | WhatsApp connected |
 * | disconnected | Connection lost |
 * | error | Error occurred |
 * 
 * ## Status Response
 * 
 * ```json
 * {
 *   "state": "authenticated",
 *   "qrCode": null,
 *   "qrUrl": null,
 *   "uptime": 3600,
 *   "messageCount": 42,
 *   "lastError": null
 * }
 * ```
 * 
 * @example
 * ```typescript
 * import { startStatusServer, updateStatus } from './status.js';
 * 
 * startStatusServer(); // Starts on port 8765
 * updateStatus({ state: 'authenticated' });
 * ```
 */

import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { getVersion } from '../utils/version.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** HTTP server port (internal to Docker network) */
const PORT = 8765;

/** Path to documentation files */
const DOCS_PATH = '/app/docs';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Bridge status information.
 * @interface
 */
export interface BridgeStatus {
  /** Current connection state */
  state: 'initializing' | 'qr_pending' | 'authenticated' | 'disconnected' | 'error';
  /** QR code data (when state is qr_pending) */
  qrCode: string | null;
  /** URL to view QR code in browser */
  qrUrl: string | null;
  /** Uptime in seconds */
  uptime: number;
  /** Total messages processed */
  messageCount: number;
  /** Last error message (if any) */
  lastError: string | null;
  /** Current version */
  version: string;
}

// =============================================================================
// GLOBAL STATE
// =============================================================================

/** Global status (updated by bridge events) */
let status: BridgeStatus = {
  state: 'initializing',
  qrCode: null,
  qrUrl: null,
  uptime: 0,
  messageCount: 0,
  lastError: null,
  version: getVersion()
};

/** Server start time for uptime calculation */
const startTime = Date.now();

/** Callback for logout action */
let logoutCallback: (() => Promise<void>) | null = null;

/** Admin token for protected endpoints (logout) */
const ADMIN_TOKEN = env.ADMIN_TOKEN || crypto.randomBytes(24).toString('hex');

/**
 * Registers a logout callback function.
 * Called by the bridge to provide logout functionality.
 */
export function setLogoutCallback(callback: () => Promise<void>): void {
  logoutCallback = callback;
}

/**
 * Triggers logout/disconnect from WhatsApp.
 * Returns true if successful.
 */
export async function triggerLogout(): Promise<boolean> {
  if (logoutCallback) {
    try {
      await logoutCallback();
      return true;
    } catch (error) {
      logger.error('Logout failed:', error);
      return false;
    }
  }
  return false;
}

// =============================================================================
// STATUS FUNCTIONS
// =============================================================================

/**
 * Updates the bridge status.
 * Called by bridge event handlers when state changes.
 * 
 * @param {Partial<BridgeStatus>} update - Fields to update
 */
export function updateStatus(update: Partial<BridgeStatus>): void {
  status = { ...status, ...update };
  logger.debug('Status updated:', { state: status.state });
}

/**
 * Increments the message counter.
 * Called for each processed message.
 */
export function incrementMessageCount(): void {
  status.messageCount++;
}

/**
 * Gets the current bridge status with calculated uptime.
 * 
 * @returns {BridgeStatus} Current status snapshot
 */
export function getStatus(): BridgeStatus {
  return {
    ...status,
    uptime: Math.floor((Date.now() - startTime) / 1000)
  };
}

/**
 * Starts the status API HTTP server.
 * Listens on PORT (8765) for status requests and serves docs.
 */
export function startStatusServer(): void {
  const server = http.createServer(async (req, res) => {
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

    // Logout/Disconnect endpoint (requires admin token)
    if (req.method === 'POST' && url === '/api/logout') {
      res.setHeader('Content-Type', 'application/json');

      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${ADMIN_TOKEN}`) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
        return;
      }

      const success = await triggerLogout();
      if (success) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: 'Logged out successfully' }));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, message: 'Logout failed or not available' }));
      }
      return;
    }

    // Hot-reload configuration from mounted .env file
    if (req.method === 'POST' && url === '/api/config/reload') {
      res.setHeader('Content-Type', 'application/json');

      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${ADMIN_TOKEN}`) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
        return;
      }

      try {
        const envPath = '/app/.env';
        if (!fs.existsSync(envPath)) {
          res.writeHead(404);
          res.end(JSON.stringify({ success: false, message: '.env not mounted' }));
          return;
        }

        const envContent = fs.readFileSync(envPath, 'utf-8');
        const updatedKeys: string[] = [];
        const envFileKeys = new Set<string>();

        for (const line of envContent.split('\n')) {
          const trimmed = line.trim();
          // Skip comments and empty lines
          if (!trimmed || trimmed.startsWith('#')) continue;

          const eqIndex = trimmed.indexOf('=');
          if (eqIndex === -1) continue;

          const key = trimmed.substring(0, eqIndex).trim();
          let value = trimmed.substring(eqIndex + 1).trim();

          if (!key) continue;

          // Strip surrounding quotes (docker-compose does this at startup)
          if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          envFileKeys.add(key);

          // Only update if value actually changed
          if (process.env[key] !== value) {
            process.env[key] = value;
            updatedKeys.push(key);
          }
        }

        logger.info(`Config reload: ${updatedKeys.length} key(s) updated${updatedKeys.length > 0 ? ': ' + updatedKeys.join(', ') : ''}`);

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          updatedKeys,
          message: `${updatedKeys.length} key(s) updated`,
        }));
      } catch (err) {
        logger.error('Config reload failed:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, message: 'Reload failed' }));
      }
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
    if (!env.ADMIN_TOKEN) {
      logger.info(`Admin token (auto-generated): ${ADMIN_TOKEN}`);
    }
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
