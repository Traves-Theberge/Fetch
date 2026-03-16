/**
 * @fileoverview Path constants for persistent runtime data.
 *
 * This module resolves the data root and derived file/directory paths used by
 * sessions, tasks, identity, skills, and custom tools.
 *
 * @module config/paths
 */

import path from 'path';
import fs from 'fs';
import { env } from './env.js';

/**
 * Resolve the persistent data directory.
 *
 * Resolution order:
 * 1) `DATA_DIR` env override
 * 2) `/app/data` (Docker volume mount)
 * 3) `<cwd>/data`
 * 4) `<cwd>/../data`
 * 5) fallback to `<cwd>/data`
 */
function resolveDataDir(): string {
  // Explicit override
  if (env.DATA_DIR) {
    return path.resolve(env.DATA_DIR);
  }

  // Docker: /app/data exists as a mounted volume
  const dockerPath = '/app/data';
  if (fs.existsSync(dockerPath)) {
    return dockerPath;
  }

  // Local dev: try data/ relative to CWD first (if running from project root)
  const cwdData = path.join(process.cwd(), 'data');
  if (fs.existsSync(cwdData)) {
    return cwdData;
  }

  // Local dev: try ../data relative to CWD (if running from fetch-app/)
  const parentData = path.resolve(process.cwd(), '..', 'data');
  if (fs.existsSync(parentData)) {
    return parentData;
  }

  // Fallback: create data/ in CWD
  return cwdData;
}

/** Root directory for persistent runtime data. */
export const DATA_DIR = resolveDataDir();

/** Directory containing identity markdown files. */
export const IDENTITY_DIR = path.join(DATA_DIR, 'identity');

/** Directory containing user-defined skills. */
export const SKILLS_DIR = path.join(DATA_DIR, 'skills');

/** Directory containing custom tool definition JSON files. */
export const TOOLS_DIR = path.join(DATA_DIR, 'tools');

/** Absolute path to sessions SQLite database file. */
export const SESSIONS_DB = env.DATABASE_PATH || path.join(DATA_DIR, 'sessions.db');

/** Absolute path to tasks SQLite database file. */
export const TASKS_DB = env.TASKS_DB_PATH || path.join(DATA_DIR, 'tasks.db');

/** Absolute path to workflow/cron state file. */
export const WORKFLOWS_JSON = path.join(DATA_DIR, 'workflows.json');

/** Absolute path to the fetch.config.json file for TPMJS tool configuration. */
export const FETCH_CONFIG = path.join(DATA_DIR, 'fetch.config.json');
