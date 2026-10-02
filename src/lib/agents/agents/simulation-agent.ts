import type { Agent, AgentInput, AgentContextData, AgentOutput, AgentProposalData } from "../types";
import { validateAgentOutput } from "../validator";
import { storeShortTermMemory, buildAgentOutputKey } from "../memory/short-term";

interface SimulationScenario {
  type: "CONSERVATIVE" | "EXPECTED" | "OPTIMISTIC";
  conversionRate: number;
  conversions: number;
  revenueMinor: number;
  costMinor: number;
  netImpactMinor: number;
  roi: number;
  riskScore: number;
  confidence: number;
}

export const simulationAgent: Agent = {
  agentType: "SIMULATION",
  name: "Simulation Agent",
  description: "Runs simulations for strategy candidates using scenario engine",

  async execute(input: AgentInput, context: AgentContextData): Promise<AgentOutput> {
    const { data } = input;
    const proposals: AgentProposalData[] = [];
    const evidence: string[] = [];

    const strategyProposals = (data.proposals as Array<{
      proposalType: string;
      title: string;
      description: string;
      confidence: number;
      riskLevel: string;
      financialImpact?: { amountMinor: number; currency: string };
    }>) ?? [];

    for (const strategy of strategyProposals) {
      const revenue = strategy.financialImpact?.amountMinor ?? 0;
      const cost = Math.round(revenue * 0.15);

      const scenarios: SimulationScenario[] = [
        {
          type: "CONSERVATIVE",
          conversionRate: 0.10,
          conversions: Math.round(revenue / 20000 * 0.8),
          revenueMinor: Math.round(revenue * 0.8),
          costMinor: Math.round(cost * 1.1),
          netImpactMinor: Math.round((revenue * 0.8) - (cost * 1.1)),
          roi: Math.round(((revenue * 0.8 - cost * 1.1) / Math.max(cost * 1.1, 1)) * 100) / 100,
          riskScore: Math.min(strategy.confidence + 20, 100),
          confidence: Math.max(strategy.confidence - 15, 20),
        },
        {
          type: "EXPECTED",
          conversionRate: 0.15,
          conversions: Math.round(revenue / 20000),
          revenueMinor: revenue,
          costMinor: cost,
          netImpactMinor: revenue - cost,
          roi: Math.round(((revenue - cost) / Math.max(cost, 1)) * 100) / 100,
          riskScore: Math.min(strategy.confidence + 5, 100),
          confidence: strategy.confidence,
        },
        {
          type: "OPTIMISTIC",
          conversionRate: 0.22,
          conversions: Math.round(revenue / 20000 * 1.3),
          revenueMinor: Math.round(revenue * 1.3),
          costMinor: Math.round(cost * 0.9),
          netImpactMinor: Math.round((revenue * 1.3) - (cost * 0.9)),
          roi: Math.round(((revenue * 1.3 - cost * 0.9) / Math.max(cost * 0.9, 1)) * 100) / 100,
          riskScore: Math.max(strategy.confidence - 20, 5),
          confidence: Math.min(strategy.confidence + 10, 95),
        },
      ];

      const expectedScenario = scenarios.find((s) => s.type === "EXPECTED") ?? scenarios[1];

      const decisionScore = Math.round(
        (expectedScenario.netImpactMinor / Math.max(revenue, 1)) * 30 +
        expectedScenario.roi * 10 +
        expectedScenario.confidence * 0.4 +
        (100 - expectedScenario.riskScore) * 0.2
      );

      evidence.push(
        `Simulated ${strategy.title}: Expected net ₹${Math.round(expectedScenario.netImpactMinor / 100)}, ROI ${expectedScenario.roi}x`
      );

      proposals.push({
        proposalType: "SIMULATION",
        title: `Simulation: ${strategy.title}`,
        description: `Simulated scenario for ${strategy.title}: Conservative ₹${Math.round(scenarios[0].netImpactMinor / 100)}, Expected ₹${Math.round(scenarios[1].netImpactMinor / 100)}, Optimistic ₹${Math.round(scenarios[2].netImpactMinor / 100)}`,
        confidence: expectedScenario.confidence,
        riskLevel: expectedScenario.riskScore < 30 ? "LOW" : expectedScenario.riskScore < 60 ? "MEDIUM" : "HIGH",
        financialImpact: { amountMinor: expectedScenario.netImpactMinor, currency: "INR" },
        evidence: [
          `Decision score: ${decisionScore}`,
          `Conservative: ₹${Math.round(scenarios[0].netImpactMinor / 100)}`,
          `Expected: ₹${Math.round(scenarios[1].netImpactMinor / 100)}`,
          `Optimistic: ₹${Math.round(scenarios[2].netImpactMinor / 100)}`,
        ],
      });
    }

    const confidence = proposals.length > 0
      ? Math.round(proposals.reduce((sum, p) => sum + p.confidence, 0) / proposals.length)
      : 30;

    const output: AgentOutput = {
      agentType: "SIMULATION",
      agentRunId: input.agentRunId ?? "",
      status: "COMPLETED",
      confidence,
      reasoningSummary: `Simulated ${strategyProposals.length} strategies with ${proposals.length} scenario results`,
      evidence,
      proposals,
      warnings: [],
      outputData: { simulatedCount: strategyProposals.length, scenarioResults: proposals.length },
      createdAt: new Date(),
    };

    if (context.growthCycleId) {
      await storeShortTermMemory(
        input.merchantId,
        "STRATEGY_PERFORMANCE",
        buildAgentOutputKey("SIMULATION", context.growthCycleId),
        { simulatedCount: strategyProposals.length, confidence }
      );
    }

    return output;
  },

  validate(output: AgentOutput) {
    return validateAgentOutput(output);
  },
};
