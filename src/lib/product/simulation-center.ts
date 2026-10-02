import { prisma } from "@/lib/prisma";
import { formatINR } from "./format";
import type { SimulationInput } from "@/lib/intelligence/simulation-agent";
import type { StrategyCandidate } from "@/lib/intelligence/strategy/generator";
import type { OpportunityType } from "@/lib/intelligence/opportunity/detector";

export type SimulationSummary = {
  id: string;
  merchantId: string;
  opportunityType: string;
  strategyId: string;
  strategyName: string;
  recommendedScenario: string;
  decisionScore: number;
  riskLevel: string;
  confidence: number;
  explanation: string | null;
  createdAt: Date;
  formattedScore: string;
  riskColor: string;
  scenarioLabel: string;
  isSimulated: true;
};

export type SimulationDetail = SimulationSummary & {
  baselineSnapshot: Record<string, unknown> | null;
  configSnapshot: Record<string, unknown> | null;
  scenarios: {
    id: string;
    scenarioType: string;
    eligibleCustomers: number;
    expectedConversionRate: number;
    expectedConversions: number;
    expectedRevenueMinor: number;
    expectedCostMinor: number;
    expectedNetImpactMinor: number;
    expectedROI: number;
    confidence: number;
    riskScore: number;
    riskLevel: string;
    evidence: string | null;
  }[];
  decisions: {
    id: string;
    decisionCategory: string;
    decisionScore: number;
    explanation: string;
    confidence: number;
    riskLevel: string;
    createdAt: Date;
  }[];
};

export type SimulationRunResult = {
  simulationId: string;
  decisionScore: number;
  recommendedScenario: string;
  explanation: string;
  riskLevel: string;
  confidence: number;
  isSimulated: true;
  scenarios: {
    type: string;
    revenue: string;
    cost: string;
    netImpact: string;
    roi: number;
    riskLevel: string;
  }[];
};

const SCENARIO_LABELS: Record<string, string> = {
  CONSERVATIVE: "Conservative",
  EXPECTED: "Expected",
  OPTIMISTIC: "Optimistic",
};

const RISK_COLORS: Record<string, string> = {
  LOW: "green",
  MEDIUM: "yellow",
  HIGH: "red",
};

function formatScenario(s: string): string {
  return SCENARIO_LABELS[s] || s;
}

function enrichSimulation(s: {
  id: string;
  merchantId: string;
  opportunityType: string;
  strategyId: string;
  strategyName: string;
  recommendedScenario: string;
  decisionScore: number;
  riskLevel: string;
  confidence: number;
  explanation: string | null;
  createdAt: Date;
}): SimulationSummary {
  return {
    ...s,
    formattedScore: `${s.decisionScore}/100`,
    riskColor: RISK_COLORS[s.riskLevel] || "gray",
    scenarioLabel: formatScenario(s.recommendedScenario),
    isSimulated: true as const,
  };
}

export async function listSimulations(
  merchantId: string,
  options?: { opportunityType?: string; riskLevel?: string; limit?: number }
): Promise<SimulationSummary[]> {
  const where: Record<string, unknown> = { merchantId };
  if (options?.opportunityType) where.opportunityType = options.opportunityType;
  if (options?.riskLevel) where.riskLevel = options.riskLevel;

  const sims = await prisma.simulation.findMany({
    where,
    orderBy: [{ decisionScore: "desc" }, { createdAt: "desc" }],
    take: options?.limit ?? 50,
  });

  return sims.map(enrichSimulation);
}

export async function getSimulationById(
  merchantId: string,
  simulationId: string
): Promise<SimulationDetail | null> {
  const sim = await prisma.simulation.findFirst({
    where: { id: simulationId, merchantId },
  });
  if (!sim) return null;

  const enriched = enrichSimulation(sim);

  const [scenarios, decisions] = await Promise.all([
    prisma.scenario.findMany({
      where: {
        merchantId,
        opportunityType: sim.opportunityType,
        strategyId: sim.strategyId,
      },
      orderBy: { scenarioType: "asc" },
    }),
    prisma.decision.findMany({
      where: { simulationId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    ...enriched,
    baselineSnapshot: sim.baselineSnapshot as Record<string, unknown> | null,
    configSnapshot: sim.configSnapshot as Record<string, unknown> | null,
    scenarios: scenarios.map((sc) => ({
      id: sc.id,
      scenarioType: sc.scenarioType,
      eligibleCustomers: sc.eligibleCustomers,
      expectedConversionRate: sc.expectedConversionRate,
      expectedConversions: sc.expectedConversions,
      expectedRevenueMinor: sc.expectedRevenueMinor,
      expectedCostMinor: sc.expectedCostMinor,
      expectedNetImpactMinor: sc.expectedNetImpactMinor,
      expectedROI: sc.expectedROI,
      confidence: sc.confidence,
      riskScore: sc.riskScore,
      riskLevel: sc.riskLevel,
      evidence: sc.evidence,
    })),
    decisions: decisions.map((d) => ({
      id: d.id,
      decisionCategory: d.decisionCategory,
      decisionScore: d.decisionScore,
      explanation: d.explanation,
      confidence: d.confidence,
      riskLevel: d.riskLevel,
      createdAt: d.createdAt,
    })),
  };
}

export async function runSimulation(
  merchantId: string,
  opportunityType: string,
  strategyId: string,
  strategyName: string
): Promise<SimulationRunResult> {
  const { runSimulationAgent } = await import(
    "@/lib/intelligence/simulation-agent"
  );

  const candidate: StrategyCandidate = {
    id: strategyId,
    strategyType: "DISCOUNT",
    name: strategyName,
    description: `Simulation for ${strategyName}`,
    financials: {
      estimatedRevenueMinor: 0,
      estimatedCostMinor: 0,
      estimatedNetImpactMinor: 0,
      estimatedROI: 0,
      riskLevel: "MEDIUM",
    },
    assumptions: [],
    rationale: "",
    estimatedRevenueRupees: "₹0",
    estimatedCostRupees: "₹0",
    estimatedNetImpactRupees: "₹0",
    riskLevel: "MEDIUM",
    confidence: 50,
  };

  const input: SimulationInput = {
    merchantId,
    opportunityType: opportunityType as OpportunityType,
    strategyId,
    strategy: candidate,
  };

  const output = await runSimulationAgent(input);

  // Compute decision category before transaction (no DB access needed)
  const expectedScenario = output.scenarios.find((s) => s.scenarioType === "EXPECTED");
  const hasPositiveImpact = expectedScenario ? expectedScenario.expectedNetImpactMinor > 0 : false;
  const highConfidence = output.confidence >= 70;
  const riskScore = output.riskLevel === "HIGH" ? 80 : output.riskLevel === "MEDIUM" ? 50 : 20;
  const lowRisk = riskScore < 40;

  let decisionCategory: string;
  if (output.decisionScore >= 80 && highConfidence && lowRisk) {
    decisionCategory = "STRONG_RECOMMENDATION";
  } else if (output.decisionScore >= 60 && hasPositiveImpact) {
    decisionCategory = "RECOMMEND";
  } else if (hasPositiveImpact && !highConfidence) {
    decisionCategory = "LOW_CONFIDENCE_RECOMMENDATION";
  } else if (output.decisionScore < 40 || !hasPositiveImpact) {
    decisionCategory = "NO_CLEAR_WINNER";
  } else {
    decisionCategory = "DO_NOT_ACT";
  }

  // Persist Simulation + Scenarios + Decision atomically
  const savedSim = await prisma.$transaction(async (tx) => {
    const simulation = await tx.simulation.create({
      data: {
        merchantId,
        opportunityType,
        strategyId,
        strategyName,
        recommendedScenario: output.recommendedScenario,
        decisionScore: output.decisionScore,
        riskLevel: output.riskLevel,
        confidence: output.confidence,
        explanation: output.explanation,
        baselineSnapshot: JSON.stringify(output.baseline),
        configSnapshot: JSON.stringify(output.input.config || null),
      },
    });

    for (const sc of output.scenarios) {
      await tx.scenario.create({
        data: {
          merchantId,
          opportunityType,
          strategyId,
          scenarioType: sc.scenarioType,
          eligibleCustomers: sc.eligibleCustomers,
          expectedConversionRate: sc.expectedConversionRate,
          expectedConversions: sc.expectedConversions,
          expectedRevenueMinor: sc.expectedRevenueMinor,
          expectedCostMinor: sc.expectedCostMinor,
          expectedNetImpactMinor: sc.expectedNetImpactMinor,
          expectedROI: sc.expectedROI,
          confidence: sc.confidence,
          riskScore: sc.riskScore,
          riskLevel: sc.riskLevel,
          downsideRevenueMinor: sc.downsideRevenueMinor,
          downsideCostMinor: sc.downsideCostMinor,
          downsideNetImpactMinor: sc.downsideNetImpactMinor,
          evidence: JSON.stringify(sc.evidence),
        },
      });
    }

    await tx.decision.create({
      data: {
        merchantId,
        simulationId: simulation.id,
        opportunityType,
        strategyId,
        strategyName,
        recommendedScenario: output.recommendedScenario,
        decisionScore: output.decisionScore,
        riskLevel: output.riskLevel,
        confidence: output.confidence,
        decisionCategory,
        explanation: output.explanation,
        evidence: JSON.stringify({
          scenarios: output.scenarios.map((s) => ({
            type: s.scenarioType,
            revenue: s.expectedRevenueMinor,
            cost: s.expectedCostMinor,
            netImpact: s.expectedNetImpactMinor,
            roi: s.expectedROI,
          })),
        }),
      },
    });

    return simulation;
  });

  return {
    simulationId: savedSim.id,
    decisionScore: output.decisionScore,
    recommendedScenario: output.recommendedScenario,
    explanation: output.explanation,
    riskLevel: output.riskLevel,
    confidence: output.confidence,
    isSimulated: true,
    scenarios: output.scenarios.map((sc) => ({
      type: formatScenario(sc.scenarioType),
      revenue: formatINR(sc.expectedRevenueMinor),
      cost: formatINR(sc.expectedCostMinor),
      netImpact: formatINR(sc.expectedNetImpactMinor),
      roi: Math.round(sc.expectedROI * 100) / 100,
      riskLevel: sc.riskLevel,
    })),
  };
}

export async function getSimulationStats(merchantId: string) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [total, recentCount, byRisk, byScenario, avgScore] = await Promise.all([
    prisma.simulation.count({ where: { merchantId } }),
    prisma.simulation.count({
      where: { merchantId, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.simulation.groupBy({
      by: ["riskLevel"],
      where: { merchantId },
      _count: true,
    }),
    prisma.simulation.groupBy({
      by: ["recommendedScenario"],
      where: { merchantId },
      _count: true,
    }),
    prisma.simulation.aggregate({
      where: { merchantId },
      _avg: { decisionScore: true, confidence: true },
    }),
  ]);

  return {
    total,
    recentCount,
    avgDecisionScore: Math.round(avgScore._avg.decisionScore || 0),
    avgConfidence: Math.round(avgScore._avg.confidence || 0),
    byRisk: byRisk.map((r) => ({
      level: r.riskLevel,
      count: r._count,
      color: RISK_COLORS[r.riskLevel] || "gray",
    })),
    byScenario: byScenario.map((s) => ({
      scenario: s.recommendedScenario,
      label: formatScenario(s.recommendedScenario),
      count: s._count,
    })),
  };
}
