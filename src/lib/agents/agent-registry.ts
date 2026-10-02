import type { Agent, AgentType, AgentRegistration } from "./types";

export class AgentRegistry {
  private agents = new Map<AgentType, AgentRegistration>();

  register(agent: Agent, priority: number, isCritical: boolean): void {
    if (this.agents.has(agent.agentType)) {
      throw new Error(`Agent ${agent.agentType} already registered`);
    }
    this.agents.set(agent.agentType, {
      agentType: agent.agentType,
      agent,
      priority,
      isCritical,
    });
  }

  get(agentType: AgentType): AgentRegistration | undefined {
    return this.agents.get(agentType);
  }

  getAgent(agentType: AgentType): Agent | undefined {
    return this.agents.get(agentType)?.agent;
  }

  isCritical(agentType: AgentType): boolean {
    return this.agents.get(agentType)?.isCritical ?? false;
  }

  getAll(): AgentRegistration[] {
    return Array.from(this.agents.values()).sort((a, b) => a.priority - b.priority);
  }

  getCriticalAgents(): AgentRegistration[] {
    return this.getAll().filter((r) => r.isCritical);
  }

  has(agentType: AgentType): boolean {
    return this.agents.has(agentType);
  }
}

let globalRegistry: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (!globalRegistry) {
    globalRegistry = new AgentRegistry();
  }
  return globalRegistry;
}

export function resetAgentRegistry(): void {
  globalRegistry = null;
}
