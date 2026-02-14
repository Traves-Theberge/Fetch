/**
 * @fileoverview Identity data types used by the prompt builder.
 *
 * @module identity/types
 */

/**
 * Canonical in-memory identity model used to render the system prompt.
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
