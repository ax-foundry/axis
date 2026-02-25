export interface AgentConfig {
  /** Must match the `source_name` value in the data exactly */
  name: string;
  /** Display label (capitalized / branded) */
  label: string;
  /** Short role description shown under the name */
  role?: string;
  /** Path to avatar image in /public (e.g. "/agents/my_agent.png") */
  avatar?: string;
  /** Short description shown on the agent card */
  description?: string;
  /** Full biography markdown shown in detail view */
  biography?: string;
  /** Whether the agent is currently active */
  active?: boolean;
  /** Langfuse trace names that map to this agent (e.g. ["alpha-bot-gpt4", "alpha-bot-gemini"]) */
  trace_names?: string[];
}

/**
 * Mutable agent registry, populated from backend API on app init.
 * Access via AGENT_REGISTRY getter or getAgentConfig() helper.
 */
let agentRegistry: AgentConfig[] = [];

/**
 * Set the agent registry from backend API response.
 * Called by ThemeProvider during app initialization.
 */
export function setAgentRegistry(agents: AgentConfig[]): void {
  agentRegistry = agents;
}

/**
 * Get the current agent registry.
 * Returns the dynamically loaded agents, or an empty array if not yet loaded.
 */
export function getAgentRegistry(): AgentConfig[] {
  return agentRegistry;
}

/** Lookup helper — matches by name or trace_names. */
export function getAgentConfig(sourceName: string): AgentConfig | undefined {
  return agentRegistry.find((a) => a.name === sourceName || a.trace_names?.includes(sourceName));
}
