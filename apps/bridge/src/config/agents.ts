/**
 * @fileoverview Multi-agent configuration for Discord multi-bot mode.
 *
 * Parses the `DISCORD_AGENTS` environment variable (JSON array) into typed
 * agent configs. When unset, returns an empty array — signaling the bridge
 * should use the single-bot fallback path.
 *
 * @module config/agents
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Per-agent inline identity overrides.
 * Merged on top of whatever COLLAR.md provides (or the built-in default).
 */
export interface AgentIdentityOverrides {
  name?: string;
  role?: string;
  emoji?: string;
  voiceTone?: string;
}

/**
 * Configuration for one Discord bot agent.
 *
 * Each entry in the `DISCORD_AGENTS` JSON array maps to one Discord bot
 * application (one token, one @mention handle) with its own persona,
 * security config, and optionally its own AI model/harness backend.
 */
export interface DiscordAgentConfig {
  /** Unique slug (e.g. "fetch", "mary", "scout"). Used in session namespacing. */
  id: string;

  /** Discord bot token from the Developer Portal. */
  botToken: string;

  /** Discord snowflake of the bot owner. */
  ownerId: string;

  /** Comma-separated trusted user snowflakes. */
  trustedUserIds?: string;

  /** Comma-separated allowed channel snowflakes (empty = all DMs + any channel). */
  channelIds?: string;

  /** Path to identity directory containing COLLAR.md. Falls back to global IDENTITY_DIR. */
  identityDir?: string;

  /** Inline identity overrides merged on top of COLLAR.md / defaults. */
  identity?: AgentIdentityOverrides;

  /** Override the orchestrator LLM model for this agent (defaults to AGENT_MODEL). */
  agentModel?: string;

  /** Platform label injected into the system prompt (defaults to "Discord"). */
  platform?: string;
}

// =============================================================================
// PARSER
// =============================================================================

/**
 * Parses the `DISCORD_AGENTS` env var into validated agent configs.
 *
 * @returns Array of agent configs (empty when env var is unset → single-bot mode).
 */
export function parseDiscordAgents(): DiscordAgentConfig[] {
  // Try env var first, then fall back to data/discord-agents.json file
  let raw = process.env.DISCORD_AGENTS;
  if (!raw || raw.trim() === '') {
    const filePath = resolve(process.cwd(), 'data/discord-agents.json');
    try {
      raw = readFileSync(filePath, 'utf-8');
      logger.info(`Loaded Discord agents config from ${filePath}`);
    } catch {
      return []; // No env var and no file → single-bot mode
    }
  }
  if (!raw || raw.trim() === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.error('DISCORD_AGENTS is not valid JSON', err);
    return [];
  }

  if (!Array.isArray(parsed)) {
    logger.error('DISCORD_AGENTS must be a JSON array');
    return [];
  }

  const configs: DiscordAgentConfig[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i] as Record<string, unknown>;
    const errors: string[] = [];

    if (typeof entry.id !== 'string' || !entry.id.trim()) {
      errors.push('missing "id"');
    }
    if (typeof entry.botToken !== 'string' || !entry.botToken.trim()) {
      errors.push('missing "botToken"');
    }
    if (typeof entry.ownerId !== 'string' || !entry.ownerId.trim()) {
      errors.push('missing "ownerId"');
    }

    if (errors.length > 0) {
      logger.error(`DISCORD_AGENTS[${i}]: ${errors.join(', ')} — skipping`);
      continue;
    }

    const id = (entry.id as string).trim().toLowerCase();
    if (seenIds.has(id)) {
      logger.error(`DISCORD_AGENTS[${i}]: duplicate id "${id}" — skipping`);
      continue;
    }
    seenIds.add(id);

    configs.push({
      id,
      botToken: (entry.botToken as string).trim(),
      ownerId: (entry.ownerId as string).trim(),
      trustedUserIds: typeof entry.trustedUserIds === 'string' ? entry.trustedUserIds : undefined,
      channelIds: typeof entry.channelIds === 'string' ? entry.channelIds : undefined,
      identityDir: typeof entry.identityDir === 'string' ? entry.identityDir : undefined,
      identity: typeof entry.identity === 'object' && entry.identity !== null
        ? entry.identity as AgentIdentityOverrides
        : undefined,
      agentModel: typeof entry.agentModel === 'string' ? entry.agentModel : undefined,
      platform: typeof entry.platform === 'string' ? entry.platform : undefined,
    });
  }

  if (configs.length > 0) {
    logger.info(`Parsed ${configs.length} Discord agent(s): ${configs.map(c => c.id).join(', ')}`);
  }

  return configs;
}
