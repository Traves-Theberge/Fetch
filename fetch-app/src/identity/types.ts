/**
 * @fileoverview Identity System Types
 *
 * Defines the personality and directives used by the
 * Identity Manager to build the system prompt.
 *
 * - {@link AgentIdentity} — Fetch's core persona (loaded from COLLAR.md + ALPHA.md)
 *
 * @module identity/types
 */

export interface AgentIdentity {
  name: string;
  role: string;
  emoji: string;
  voice: {
    tone: string;
  };
  directives: {
    primary: string[];   // Unbreakable rules
    secondary: string[]; // Operational guidelines
    behavioral: string[]; // Personality traits
  };
  context: {
    owner: string;
  };
}
