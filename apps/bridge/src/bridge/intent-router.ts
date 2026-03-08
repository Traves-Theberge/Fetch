/**
 * @fileoverview AI-powered intent router for multi-agent Discord messages.
 *
 * Instead of brittle string matching, this module uses a lightweight LLM call
 * to intelligently determine which agents should respond to a given message.
 * The router considers: direct addressing, topic relevance, team-wide requests,
 * and conversational context.
 *
 * @module bridge/intent-router
 */

import OpenAI from 'openai';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  emoji: string;
}

export interface RoutingResult {
  /** Agent IDs that should respond to this message */
  respondents: string[];
  /** Brief reasoning (for debug logging) */
  reasoning: string;
}

// =============================================================================
// CLIENT
// =============================================================================

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    });
  }
  return client;
}

// =============================================================================
// ROUTER
// =============================================================================

const ROUTER_MODEL = 'openai/gpt-4o-mini';
const ROUTER_TIMEOUT_MS = 3000;
const ROUTER_MAX_TOKENS = 100;

/**
 * Determine which agents should respond to a Discord message.
 *
 * Fast path: if a bot is explicitly @mentioned (Discord mention), that bot
 * always responds — the LLM is only consulted for non-mention routing.
 *
 * @param message - The user's message text
 * @param agents - Available agent profiles
 * @param mentionedAgentIds - Agent IDs that were @mentioned in Discord
 * @returns Which agents should respond
 */
export async function routeMessage(
  message: string,
  agents: AgentProfile[],
  mentionedAgentIds: string[],
): Promise<RoutingResult> {
  // Fast path: explicit @mentions always respond
  if (mentionedAgentIds.length > 0) {
    return {
      respondents: mentionedAgentIds,
      reasoning: `Explicit @mention: ${mentionedAgentIds.join(', ')}`,
    };
  }

  // LLM routing for everything else
  try {
    return await routeWithLLM(message, agents);
  } catch (err) {
    logger.warn('Intent router LLM call failed, falling back to heuristic', err);
    return fallbackRoute(message, agents);
  }
}

/**
 * LLM-based routing with structured output.
 */
async function routeWithLLM(
  message: string,
  agents: AgentProfile[],
): Promise<RoutingResult> {
  const agentList = agents
    .map(a => `- ${a.id}: ${a.name} (${a.role})`)
    .join('\n');

  const systemPrompt = `You are a message router for a team of AI agents in a Discord channel. Given a message, decide which agent(s) should respond.

Available agents:
${agentList}

Rules:
- If the message addresses an agent by name, route to that agent.
- If the message is about a topic that clearly matches one agent's role, route to that agent.
- If the message asks the "team", "everyone", "all", or is a general announcement, route to ALL agents.
- If the message is a follow-up that references another agent's work (e.g. "check what mya said"), route to the agent being ASKED, not the one being referenced.
- If a message is from one agent asking another to collaborate (e.g. "Let's work with Nova on this"), route to the agent(s) being invited to collaborate.
- If a message contains deliverables, updates, or questions directed at the team, route to agents whose expertise is relevant.
- If ambiguous, route to the single most relevant agent based on topic.
- Never route to zero agents — always pick at least one.

Respond with ONLY a JSON object: {"agents": ["id1", "id2"], "reason": "brief explanation"}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROUTER_TIMEOUT_MS);

  try {
    const response = await getClient().chat.completions.create({
      model: ROUTER_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      max_tokens: ROUTER_MAX_TOKENS,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }, { signal: controller.signal });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) throw new Error('Empty router response');

    const parsed = JSON.parse(content) as { agents: string[]; reason: string };
    const validIds = new Set(agents.map(a => a.id));
    const respondents = (parsed.agents || []).filter((id: string) => validIds.has(id));

    if (respondents.length === 0) {
      // LLM returned invalid IDs — fall back
      return fallbackRoute(message, agents);
    }

    logger.info(`Intent router: [${respondents.join(', ')}] — ${parsed.reason}`);

    return {
      respondents,
      reasoning: parsed.reason || 'LLM routing',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Simple heuristic fallback when LLM routing fails.
 * Matches agent names at message start (case-insensitive).
 */
function fallbackRoute(
  message: string,
  agents: AgentProfile[],
): RoutingResult {
  const msgLower = message.toLowerCase().trimStart();

  // Check if message starts with an agent name
  for (const agent of agents) {
    const name = agent.name.toLowerCase();
    if (
      msgLower.startsWith(name) &&
      (msgLower.length === name.length || /\W/.test(msgLower[name.length]))
    ) {
      return {
        respondents: [agent.id],
        reasoning: `Fallback: message starts with "${agent.name}"`,
      };
    }
  }

  // Default to first agent (least bad option)
  return {
    respondents: [agents[0].id],
    reasoning: 'Fallback: no clear addressee, routed to first agent',
  };
}
