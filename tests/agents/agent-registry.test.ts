import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry, getAgentRegistry, resetAgentRegistry } from "@/lib/agents/agent-registry";
import type { Agent, AgentInput, AgentContextData, AgentOutput } from "@/lib/agents/types";

const mockAgent: Agent = {
  agentType: "OPPORTUNITY",
  name: "Mock Agent",
  description: "Test agent",
  async execute(input: AgentInput, context: AgentContextData): Promise<AgentOutput> {
    return {
      agentType: "OPPORTUNITY",
      agentRunId: "run-1",
      status: "COMPLETED",
      confidence: 80,
      reasoningSummary: "Mock",
      evidence: [],
      proposals: [],
      warnings: [],
      createdAt: new Date(),
    };
  },
  validate() {
    return { valid: true, errors: [], warnings: [] };
  },
};

describe("agent registry", () => {
  beforeEach(() => {
    resetAgentRegistry();
  });

  it("registers and retrieves agents", () => {
    const registry = new AgentRegistry();
    registry.register(mockAgent, 1, true);

    expect(registry.has("OPPORTUNITY")).toBe(true);
    expect(registry.getAgent("OPPORTUNITY")).toBe(mockAgent);
  });

  it("returns priority order", () => {
    const registry = new AgentRegistry();
    const agent2: Agent = { ...mockAgent, agentType: "STRATEGY" };
    registry.register(agent2, 2, true);
    registry.register(mockAgent, 1, true);

    const all = registry.getAll();
    expect(all[0].agentType).toBe("OPPORTUNITY");
    expect(all[1].agentType).toBe("STRATEGY");
  });

  it("identifies critical agents", () => {
    const registry = new AgentRegistry();
    registry.register(mockAgent, 1, true);
    expect(registry.isCritical("OPPORTUNITY")).toBe(true);
    expect(registry.isCritical("LEARNING")).toBe(false);
  });

  it("prevents duplicate registration", () => {
    const registry = new AgentRegistry();
    registry.register(mockAgent, 1, true);
    expect(() => registry.register(mockAgent, 2, true)).toThrow();
  });

  it("returns all critical agents", () => {
    const registry = new AgentRegistry();
    const agent2: Agent = { ...mockAgent, agentType: "STRATEGY" };
    registry.register(mockAgent, 1, true);
    registry.register(agent2, 2, false);

    const critical = registry.getCriticalAgents();
    expect(critical).toHaveLength(1);
    expect(critical[0].agentType).toBe("OPPORTUNITY");
  });
});
