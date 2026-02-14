/**
 * @fileoverview HTTP status/control API and docs/static file server.
 *
 * Responsibilities:
 * - expose bridge status/health for the manager UI
 * - provide admin-protected control endpoints (logout, config reload, sessions)
 * - serve documentation assets under `/docs`
 *
 * @module api/status
 * @see {@link startStatusServer} Start the HTTP server and route requests
 * @see {@link updateStatus} Update in-memory bridge status
 * @see {@link getStatus} Read current status snapshot
 * 
 * ## Endpoints
 * 
 * | Method | Path | Description |
 * |--------|------|-------------|
 * | GET | /api/status | Current bridge status (JSON) |
 * | GET | /api/health | Lightweight health check (Go TUI) |
 * | POST | /api/logout | Disconnect WhatsApp (admin token required) |
 * | POST | /api/config/reload | Reload mounted `.env` into process env (admin token required) |
 * | GET | /api/sessions | List sessions (admin token required) |
 * | GET | /api/sessions/:id | Read one session (admin token required) |
 * | DELETE | /api/sessions/:id | Delete one session (admin token required) |
 * | POST | /api/sessions/:id/clear | Clear one session history (admin token required) |
 * | GET | /docs/* | Documentation site (static) |
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { getVersion } from '../utils/version.js';
import { getSessionManager } from '../session/manager.js';
import { validateRuntimeEnvUpdates } from '../config/env.js';
import { getNotificationMetrics, type NotificationMetrics } from '../agent/notifications.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** HTTP server port (internal to Docker network) */
const PORT = 8765;

/** Path to documentation files */
const DOCS_PATH = '/app/docs';
const ENV_PATH = '/app/.env';
const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Status payload returned by `GET /api/status`.
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
  /** Notification formatter path/fallback counters */
  notificationMetrics: NotificationMetrics;
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
  version: getVersion(),
  notificationMetrics: getNotificationMetrics(),
};

/** Server start time for uptime calculation */
const startTime = Date.now();

/** Callback for logout action */
let logoutCallback: (() => Promise<void>) | null = null;
let envWatcherInitialized = false;

/** Optional admin token for protected endpoints (logout/config/session APIs). */
const ADMIN_TOKEN = env.ADMIN_TOKEN || '';

/** Returns true when request is authorized for admin-only endpoints. */
function isAdminAuthorized(req: http.IncomingMessage): boolean {
  // If ADMIN_TOKEN is unset, allow local TUI/admin workflows without token wiring.
  if (!ADMIN_TOKEN) return true;
  return req.headers.authorization === `Bearer ${ADMIN_TOKEN}`;
}

/**
 * Register callback used by `POST /api/logout`.
 */
export function setLogoutCallback(callback: () => Promise<void>): void {
  logoutCallback = callback;
}

/**
 * Execute the registered logout callback, if available.
 *
 * @returns `true` when callback runs successfully; otherwise `false`
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
 * Merge partial fields into the in-memory status object.
 *
 * @param update - Status fields to overwrite
 */
export function updateStatus(update: Partial<BridgeStatus>): void {
  status = { ...status, ...update };
  logger.debug('Status updated:', { state: status.state });
}

/**
 * Increment processed-message counter for status reporting.
 */
export function incrementMessageCount(): void {
  status.messageCount++;
}

/**
 * Return a status snapshot with computed uptime.
 *
 * @returns Current status payload
 */
export function getStatus(): BridgeStatus {
  return {
    ...status,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    notificationMetrics: getNotificationMetrics(),
  };
}

/** Returns true when session-id uses supported URL-safe grammar. */
export function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_REGEX.test(sessionId);
}

/**
 * Reload process.env from mounted .env file.
 *
 * @returns Updated key names
 */
function reloadEnvFromFile(): string[] {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error('.env not mounted');
  }

  const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
  const updatedKeys: string[] = [];
  const pendingUpdates: Record<string, string> = {};

  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();
    if (!key) continue;

    if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    pendingUpdates[key] = value;
  }

  const validation = validateRuntimeEnvUpdates(pendingUpdates);
  if (!validation.valid) {
    const first = validation.invalid[0];
    throw new Error(`Invalid runtime config updates: ${first?.key ?? 'unknown'} ${first?.reason ?? ''}`.trim());
  }

  for (const [key, value] of Object.entries(pendingUpdates)) {
    if (process.env[key] !== value) {
      process.env[key] = value;
      updatedKeys.push(key);
    }
  }

  return updatedKeys;
}

/**
 * Start the HTTP server and register all API/docs routes.
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

      if (!isAdminAuthorized(req)) {
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

      if (!isAdminAuthorized(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
        return;
      }

      try {
        const updatedKeys = reloadEnvFromFile();

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
      // Redirect markdown navigation to viewer (e.g. /docs/SETUP_GUIDE.md -> /docs/index.html#SETUP_GUIDE)
      // We check Sec-Fetch-Mode to distinguish between browser navigation and fetch() requests
      if (url.endsWith('.md') && req.headers['sec-fetch-mode'] === 'navigate') {
        const basename = path.basename(url, '.md');
        res.writeHead(302, { Location: `/docs/index.html#${basename}` });
        res.end();
        return;
      }

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

    // Redirect root README to docs viewer
    if (req.method === 'GET' && url === '/README.md') {
      res.writeHead(302, { Location: '/docs/index.html#README' });
      res.end();
      return;
    }



    // GET /api/sessions
    if (req.method === 'GET' && url === '/api/sessions') {
      res.setHeader('Content-Type', 'application/json');

      if (!isAdminAuthorized(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
        return;
      }

      try {
        const manager = await getSessionManager();
        const sessions = await manager.listSessions(100); // Limit to 100 for now

        // Return simplified list
        const summary = sessions.map(s => ({
          id: s.id,
          userId: s.userId,
          messageCount: s.messages.length,
          lastActivityAt: s.lastActivityAt,
          createdAt: s.createdAt,
          activeProject: s.currentProject?.name || null
        }));

        res.writeHead(200);
        res.end(JSON.stringify({ success: true, sessions: summary }));
      } catch (err) {
        logger.error('Failed to list sessions:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, message: 'Internal server error' }));
      }
      return;
    }

    // GET /api/sessions/:id
    if (req.method === 'GET' && url.startsWith('/api/sessions/')) {
      res.setHeader('Content-Type', 'application/json');

      if (!isAdminAuthorized(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
        return;
      }

      const parts = url.split('/');
      const sessionId = parts[3];
      if (!sessionId) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, message: 'Missing session ID' }));
        return;
      }
      if (parts.length !== 4 || !isValidSessionId(sessionId)) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, message: 'Invalid session ID' }));
        return;
      }

      try {
        const manager = await getSessionManager();
        const session = await manager.getSessionById(sessionId);

        if (session) {
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, session }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ success: false, message: 'Session not found' }));
        }
      } catch (err) {
        logger.error(`Failed to get session ${sessionId}:`, err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, message: 'Internal server error' }));
      }
      return;
    }

    // DELETE /api/sessions/:id
    if (req.method === 'DELETE' && url.startsWith('/api/sessions/')) {
      res.setHeader('Content-Type', 'application/json');

      if (!isAdminAuthorized(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
        return;
      }

      const parts = url.split('/');
      const sessionId = parts[3];
      if (!sessionId) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, message: 'Missing session ID' }));
        return;
      }
      if (parts.length !== 4 || !isValidSessionId(sessionId)) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, message: 'Invalid session ID' }));
        return;
      }

      try {
        const manager = await getSessionManager();
        const success = await manager.deleteSession(sessionId);

        if (success) {
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, message: 'Session deleted' }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ success: false, message: 'Session not found' }));
        }
      } catch (err) {
        logger.error(`Failed to delete session ${sessionId}:`, err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, message: 'Internal server error' }));
      }
      return;
    }

    // POST /api/sessions/:id/clear
    if (req.method === 'POST' && url.startsWith('/api/sessions/') && url.endsWith('/clear')) {
      res.setHeader('Content-Type', 'application/json');

      if (!isAdminAuthorized(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
        return;
      }

      const parts = url.split('/');
      const sessionId = parts[3]; // /api/sessions/:id/clear
      if (parts.length !== 5 || parts[4] !== 'clear' || !sessionId || !isValidSessionId(sessionId)) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, message: 'Invalid session ID' }));
        return;
      }

      try {
        const manager = await getSessionManager();
        const cleared = await manager.clearSession(sessionId);

        if (cleared) {
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, message: 'Session cleared' }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ success: false, message: 'Session not found' }));
        }
      } catch (err) {
        logger.error(`Failed to clear session ${sessionId}:`, err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, message: 'Internal server error' }));
      }
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
    if (!env.ADMIN_TOKEN) logger.info('Admin token not set; admin endpoints allow local access.');
  });

  if (!envWatcherInitialized) {
    envWatcherInitialized = true;
    fs.watchFile(ENV_PATH, { interval: 1000 }, (curr, prev) => {
      if (curr.mtimeMs === prev.mtimeMs) return;
      try {
        const updatedKeys = reloadEnvFromFile();
        if (updatedKeys.length > 0) {
          logger.info(`Auto-reloaded .env: ${updatedKeys.length} key(s) updated: ${updatedKeys.join(', ')}`);
        }
      } catch (error) {
        logger.warn(`Auto-reload from .env failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  server.on('error', (err) => {
    logger.error('Status API server error:', err);
  });
}

/**
 * Serve a static docs asset with basic path validation and content-type mapping.
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
