/**
 * Identity System Types
 * 
 * Defines the personality and core directives of the agent.
 */

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
}

export interface SystemPromptConfig {
  identity: AgentIdentity;
  datetime: string;
  skills: string; // XML string
  memory: string; // Recent relevant memories
  mode: string;   // Current mode context
}
