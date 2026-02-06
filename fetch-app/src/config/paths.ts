/**
 * @fileoverview Centralized Path Configuration
 * 
 * Single source of truth for all data directory paths.
 * Resolves correctly in both Docker (WORKDIR=/app, volume at /app/data)
 * and local development (CWD=fetch-app/, data at ../data/).
 * 
 * Priority: DATA_DIR env var > /app/data (Docker) > ./data (local fallback)
 * 
 * @module config/paths
 */

import path from 'path';
import fs from 'fs';

/**
 * Resolve the root data directory.
 * 
 * In Docker: WORKDIR is /app, volume mounted at /app/data → resolves to /app/data
 * In development: CWD is fetch-app/, data is at ../data/ → resolves to ../data
 * Override: Set DATA_DIR env var to force a specific path
 */
function resolveDataDir(): string {
  // Explicit override
  if (process.env.DATA_DIR) {
    return path.resolve(process.env.DATA_DIR);
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

/** Root data directory — all persistent data lives here */
export const DATA_DIR = resolveDataDir();

/** Identity configuration files (COLLAR.md, ALPHA.md) */
export const IDENTITY_DIR = path.join(DATA_DIR, 'identity');

/** Agent profile files (claude.md, gemini.md, copilot.md with YAML frontmatter) */
export const AGENTS_DIR = path.join(DATA_DIR, 'agents');

/** User-created skills (each skill is a directory with SKILL.md) */
export const SKILLS_DIR = path.join(DATA_DIR, 'skills');

/** Custom tool definitions (*.json files) */
export const TOOLS_DIR = path.join(DATA_DIR, 'tools');

/** Polling configuration file */
export const POLLING_FILE = path.join(DATA_DIR, 'POLLING.md');

/** Sessions database */
export const SESSIONS_DB = process.env.DATABASE_PATH || path.join(DATA_DIR, 'sessions.db');

/** Tasks database */
export const TASKS_DB = process.env.TASKS_DB_PATH || path.join(DATA_DIR, 'tasks.db');
