import type { Agent, AgentInput, AgentContextData, AgentOutput, AgentProposalData } from "../types";
import { validateAgentOutput } from "../validator";

export const decisionAgent: Agent = {
  agentType: "DECISION",
  name: "Decision Agent",
  description: "Selects the best strategy based on simulation results and risk analysis",

  async execute(input: AgentInput, context: AgentContextData): Promise<AgentOutput> {
    const { data } = input;
    const evidence: string[] = [];

    const simulationProposals = (data.proposals as Array<{
      proposalType: string;
      title: string;
      description: string;
      confidence: number;
      riskLevel: string;
      financialImpact?: { amountMinor: number; currency: string };
      evidence?: string[];
    }>) ?? [];

    if (simulationProposals.length === 0) {
      return {
        agentType: "DECISION",
        agentRunId: input.agentRunId ?? "",
        status: "COMPLETED",
        confidence: 20,
        reasoningSummary: "No simulation results to decide on",
        evidence: [],
        proposals: [],
        warnings: ["No strategies available for decision"],
        outputData: { decision: "DO_NOT_ACT" },
        createdAt: new Date(),
      };
    }

    const scored = simulationProposals.map((p) => {
      const riskMultiplier = p.riskLevel === "LOW" ? 1.0 : p.riskLevel === "MEDIUM" ? 0.85 : 0.7;
      const score = (p.confidence * 0.4 + (p.financialImpact?.amountMinor ?? 0) / 1000 * 0.3 + (100 - (p.riskLevel === "LOW" ? 20 : p.riskLevel === "MEDIUM" ? 50 : 80)) * 0.3) * riskMultiplier;
      return { ...p, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    let decisionCategory: string;
    if (best.score >= 70 && best.confidence >= 70 && best.riskLevel === "LOW") {
      decisionCategory = "STRONG_RECOMMENDATION";
    } else if (best.score >= 50 && best.confidence >= 50) {
      decisionCategory = "RECOMMEND";
    } else if (best.score >= 30) {
      decisionCategory = "LOW_CONFIDENCE_RECOMMENDATION";
    } else {
      decisionCategory = "DO_NOT_ACT";
    }

    evidence.push(`Best strategy: ${best.title} (score: ${Math.round(best.score)}, confidence: ${best.confidence})`);
    evidence.push(`Decision category: ${decisionCategory}`);

    const proposals: AgentProposalData[] = [{
      proposalType: "DECISION",
      title: best.title,
      description: `Recommended: ${best.title}. ${best.description}`,
      confidence: best.confidence,
      riskLevel: best.riskLevel,
      financialImpact: best.financialImpact,
      evidence: [
        `Decision score: ${Math.round(best.score)}`,
        `Decision category: ${decisionCategory}`,
        `Confidence: ${best.confidence}%`,
        `Risk: ${best.riskLevel}`,
        ...(best.evidence ?? []),
      ],
    }];

    return {
      agentType: "DECISION",
      agentRunId: input.agentRunId ?? "",
      status: "COMPLETED",
      confidence: best.confidence,
      reasoningSummary: `Selected "${best.title}" as best strategy (score: ${Math.round(best.score)}, category: ${decisionCategory})`,
      evidence,
      proposals,
      warnings: decisionCategory === "DO_NOT_ACT" ? ["No strong recommendation found"] : [],
      outputData: {
        decisionCategory,
        selectedStrategy: best.title,
        decisionScore: Math.round(best.score),
      },
      createdAt: new Date(),
    };
  },

  validate(output: AgentOutput) {
    return validateAgentOutput(output);
  },
};
