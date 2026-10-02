import { prisma } from "@/lib/prisma";
import { formatINR } from "./format";
import { formatMoney } from "@/lib/intelligence/strategy/generator";

export type StrategySummary = {
  id: string;
  merchantId: string;
  opportunityType: string;
  strategyId: string;
  strategyName: string;
  scenarioType: string;
  recommendedScenario: string;
  decisionScore: number;
  riskLevel: string;
  confidence: number;
  explanation: string;
  createdAt: Date;
  formattedDecisionScore: string;
  riskColor: string;
  scenarioLabel: string;
  daysOld: number;
};

export type StrategyDetail = StrategySummary & {
  baselineSnapshot: Record<string, unknown> | null;
  configSnapshot: Record<string, unknown> | null;
  decisions: {
    id: string;
    decisionCategory: string;
    decisionScore: number;
    explanation: string;
    confidence: number;
    riskLevel: string;
    createdAt: Date;
  }[];
  experiments: {
    id: string;
    predictedNetImpactMinor: number;
    actualNetImpactMinor: number | null;
    predictionError: number | null;
    isCalibrated: boolean;
    calibrationCount: number;
  }[];
  relatedActions: {
    id: string;
    status: string;
    amountMinor: number;
    createdAt: Date;
  }[];
};

export type StrategyComparison = {
  strategies: StrategySummary[];
  byRisk: { level: string; count: number }[];
  avgDecisionScore: number;
  topStrategy: StrategySummary | null;
};

const RISK_COLORS: Record<string, string> = {
  LOW: "green",
  MEDIUM: "yellow",
  HIGH: "red",
  CRITICAL: "red",
};

const SCENARIO_LABELS: Record<string, string> = {
  CONSERVATIVE: "Conservative",
  EXPECTED: "Expected",
  OPTIMISTIC: "Optimistic",
};

function enrichStrategy(s: {
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
}): StrategySummary {
  const now = new Date();
  const daysOld = Math.floor(
    (now.getTime() - s.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  return {
    id: s.id,
    merchantId: s.merchantId,
    opportunityType: s.opportunityType,
    strategyId: s.strategyId,
    strategyName: s.strategyName,
    scenarioType: s.recommendedScenario,
    recommendedScenario: s.recommendedScenario,
    decisionScore: s.decisionScore,
    riskLevel: s.riskLevel,
    confidence: s.confidence,
    explanation: s.explanation || "",
    createdAt: s.createdAt,
    formattedDecisionScore: `${s.decisionScore}/100`,
    riskColor: RISK_COLORS[s.riskLevel] || "gray",
    scenarioLabel: SCENARIO_LABELS[s.recommendedScenario] || s.recommendedScenario,
    daysOld,
  };
}

export async function getMerchantSimulations(
  merchantId: string,
  options?: { opportunityType?: string; riskLevel?: string; limit?: number }
): Promise<StrategySummary[]> {
  const where: Record<string, unknown> = { merchantId };
  if (options?.opportunityType) where.opportunityType = options.opportunityType;
  if (options?.riskLevel) where.riskLevel = options.riskLevel;

  const simulations = await prisma.simulation.findMany({
    where,
    orderBy: [{ decisionScore: "desc" }, { createdAt: "desc" }],
    take: options?.limit ?? 50,
  });

  return simulations.map(enrichStrategy);
}

export async function getSimulationDetail(
  merchantId: string,
  simulationId: string
): Promise<StrategyDetail | null> {
  const sim = await prisma.simulation.findFirst({
    where: { id: simulationId, merchantId },
  });
  if (!sim) return null;

  const enriched = enrichStrategy(sim);

  const [decisions, experiments, relatedActions] = await Promise.all([
    prisma.decision.findMany({
      where: { simulationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        decisionCategory: true,
        decisionScore: true,
        explanation: true,
        confidence: true,
        riskLevel: true,
        createdAt: true,
      },
    }),
    prisma.strategyExperiment.findMany({
      where: { strategyId: sim.strategyId, merchantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        predictedNetImpactMinor: true,
        actualNetImpactMinor: true,
        predictionError: true,
        isCalibrated: true,
        calibrationCount: true,
      },
    }),
    prisma.actionRequest.findMany({
      where: { strategyId: sim.strategyId, merchantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        amountMinor: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    ...enriched,
    baselineSnapshot: sim.baselineSnapshot as Record<string, unknown> | null,
    configSnapshot: sim.configSnapshot as Record<string, unknown> | null,
    decisions,
    experiments,
    relatedActions,
  };
}

export async function compareStrategies(
  merchantId: string,
  strategyIds: string[]
): Promise<StrategyComparison> {
  const simulations = await prisma.simulation.findMany({
    where: { id: { in: strategyIds }, merchantId },
    orderBy: { decisionScore: "desc" },
  });

  const enriched = simulations.map(enrichStrategy);

  const riskCounts: Record<string, number> = {};
  for (const s of enriched) {
    riskCounts[s.riskLevel] = (riskCounts[s.riskLevel] || 0) + 1;
  }

  const avgDecisionScore =
    enriched.length > 0
      ? Math.round(
          enriched.reduce((sum, s) => sum + s.decisionScore, 0) / enriched.length
        )
      : 0;

  return {
    strategies: enriched,
    byRisk: Object.entries(riskCounts).map(([level, count]) => ({
      level,
      count,
    })),
    avgDecisionScore,
    topStrategy: enriched[0] || null,
  };
}

export async function getStrategyStats(merchantId: string) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [total, byRisk, byScenario, recentCount, avgScore] = await Promise.all([
    prisma.simulation.count({ where: { merchantId } }),
    prisma.simulation.groupBy({
      by: ["riskLevel"],
      where: { merchantId },
      _count: true,
      _avg: { decisionScore: true },
    }),
    prisma.simulation.groupBy({
      by: ["recommendedScenario"],
      where: { merchantId },
      _count: true,
    }),
    prisma.simulation.count({
      where: { merchantId, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.simulation.aggregate({
      where: { merchantId },
      _avg: { decisionScore: true },
    }),
  ]);

  return {
    total,
    recentCount,
    avgDecisionScore: Math.round(avgScore._avg.decisionScore || 0),
    byRisk: byRisk.map((r) => ({
      level: r.riskLevel,
      count: r._count,
      avgScore: Math.round(r._avg.decisionScore || 0),
      color: RISK_COLORS[r.riskLevel] || "gray",
    })),
    byScenario: byScenario.map((s) => ({
      scenario: s.recommendedScenario,
      label: SCENARIO_LABELS[s.recommendedScenario] || s.recommendedScenario,
      count: s._count,
    })),
  };
}
