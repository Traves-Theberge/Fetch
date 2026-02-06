/**
 * Identity System Types
 * 
 * Defines the personality and core directives of the agent.
 */

/**
 * A Pack member (harness agent) loaded from data/agents/*.md
 */
export interface PackMember {
  /** Display name (e.g. "Claude") */
  name: string;
  /** Nickname (e.g. "The Sage") */
  alias: string;
  /** Status emoji */
  emoji: string;
  /** Harness ID matching AgentType (e.g. "claude") */
  harness: string;
  /** CLI command (e.g. "claude", "gemini", "gh copilot") */
  cli: string;
  /** Role description */
  role: string;
  /** Priority for fallback chain (lower = try first) */
  fallback_priority: number;
  /** Keywords that route tasks TO this agent */
  triggers: string[];
  /** Keywords that route tasks AWAY from this agent */
  avoid: string[];
  /** Full markdown body (instructions, strengths, personality) */
  body: string;
  /** Source file path */
  sourcePath: string;
}

export interface AgentIdentity {
  name: string;
  role: string;
  emoji: string;
  voice: {
    tone: string;
    style: string[];
    vocabulary: string[];
  };
  directives: {
    primary: string[];   // Unbreakable rules
    secondary: string[]; // Operational guidelines
    behavioral: string[]; // Personality traits
  };
  context: {
    owner: string;
    projectRoot: string;
    platform: string;
  };
  /** Pack members (harness agents) loaded from data/agents/ */
  pack: PackMember[];
}
