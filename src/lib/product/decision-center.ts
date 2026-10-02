import { prisma } from "@/lib/prisma";

export type DecisionSummary = {
  id: string;
  merchantId: string;
  simulationId: string | null;
  opportunityType: string;
  strategyId: string;
  strategyName: string;
  recommendedScenario: string;
  decisionScore: number;
  riskLevel: string;
  confidence: number;
  decisionCategory: string;
  explanation: string;
  createdAt: Date;
  formattedScore: string;
  riskColor: string;
  categoryLabel: string;
  categoryColor: string;
  scenarioLabel: string;
};

export type DecisionDetail = DecisionSummary & {
  evidence: string | null;
  simulation: {
    id: string;
    strategyName: string;
    recommendedScenario: string;
    decisionScore: number;
    riskLevel: string;
    confidence: number;
    explanation: string | null;
  } | null;
  outcomes: {
    id: string;
    predictedScenario: string;
    predictedNetImpactMinor: number;
    actualNetImpactMinor: number | null;
    absoluteError: number | null;
    percentageError: number | null;
    correctPrediction: boolean;
    createdAt: Date;
  }[];
  relatedActions: {
    id: string;
    status: string;
    amountMinor: number;
    createdAt: Date;
  }[];
};

const SCENARIO_LABELS: Record<string, string> = {
  CONSERVATIVE: "Conservative",
  EXPECTED: "Expected",
  OPTIMISTIC: "Optimistic",
};

const CATEGORY_LABELS: Record<string, string> = {
  STRONG_RECOMMENDATION: "Strong Recommendation",
  RECOMMEND: "Recommend",
  LOW_CONFIDENCE_RECOMMENDATION: "Low Confidence",
  NO_CLEAR_WINNER: "No Clear Winner",
  DO_NOT_ACT: "Do Not Act",
};

const CATEGORY_COLORS: Record<string, string> = {
  STRONG_RECOMMENDATION: "green",
  RECOMMEND: "blue",
  LOW_CONFIDENCE_RECOMMENDATION: "yellow",
  NO_CLEAR_WINNER: "gray",
  DO_NOT_ACT: "red",
};

const RISK_COLORS: Record<string, string> = {
  LOW: "green",
  MEDIUM: "yellow",
  HIGH: "red",
};

function enrichDecision(d: {
  id: string;
  merchantId: string;
  simulationId: string | null;
  opportunityType: string;
  strategyId: string;
  strategyName: string;
  recommendedScenario: string;
  decisionScore: number;
  riskLevel: string;
  confidence: number;
  decisionCategory: string;
  explanation: string;
  createdAt: Date;
}): DecisionSummary {
  return {
    ...d,
    formattedScore: `${d.decisionScore}/100`,
    riskColor: RISK_COLORS[d.riskLevel] || "gray",
    categoryLabel: CATEGORY_LABELS[d.decisionCategory] || d.decisionCategory,
    categoryColor: CATEGORY_COLORS[d.decisionCategory] || "gray",
    scenarioLabel: SCENARIO_LABELS[d.recommendedScenario] || d.recommendedScenario,
  };
}

export async function listDecisions(
  merchantId: string,
  options?: { category?: string; opportunityType?: string; limit?: number }
): Promise<DecisionSummary[]> {
  const where: Record<string, unknown> = { merchantId };
  if (options?.category) where.decisionCategory = options.category;
  if (options?.opportunityType) where.opportunityType = options.opportunityType;

  const decisions = await prisma.decision.findMany({
    where,
    orderBy: [{ decisionScore: "desc" }, { createdAt: "desc" }],
    take: options?.limit ?? 50,
  });

  return decisions.map(enrichDecision);
}

export async function getDecisionById(
  merchantId: string,
  decisionId: string
): Promise<DecisionDetail | null> {
  const decision = await prisma.decision.findFirst({
    where: { id: decisionId, merchantId },
  });
  if (!decision) return null;

  const enriched = enrichDecision(decision);

  const [simulation, outcomes, relatedActions] = await Promise.all([
    decision.simulationId
      ? prisma.simulation.findUnique({
          where: { id: decision.simulationId },
          select: {
            id: true,
            strategyName: true,
            recommendedScenario: true,
            decisionScore: true,
            riskLevel: true,
            confidence: true,
            explanation: true,
          },
        })
      : null,
    prisma.decisionOutcome.findMany({
      where: { decisionId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.actionRequest.findMany({
      where: { strategyId: decision.strategyId, merchantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, status: true, amountMinor: true, createdAt: true },
    }),
  ]);

  return {
    ...enriched,
    evidence: decision.evidence,
    simulation,
    outcomes,
    relatedActions,
  };
}

export async function getDecisionStats(merchantId: string) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [total, byCategory, byRisk, recentCount, avgScore] = await Promise.all([
    prisma.decision.count({ where: { merchantId } }),
    prisma.decision.groupBy({
      by: ["decisionCategory"],
      where: { merchantId },
      _count: true,
    }),
    prisma.decision.groupBy({
      by: ["riskLevel"],
      where: { merchantId },
      _count: true,
    }),
    prisma.decision.count({
      where: { merchantId, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.decision.aggregate({
      where: { merchantId },
      _avg: { decisionScore: true, confidence: true },
    }),
  ]);

  return {
    total,
    recentCount,
    avgDecisionScore: Math.round(avgScore._avg.decisionScore || 0),
    avgConfidence: Math.round(avgScore._avg.confidence || 0),
    byCategory: byCategory.map((c) => ({
      category: c.decisionCategory,
      label: CATEGORY_LABELS[c.decisionCategory] || c.decisionCategory,
      color: CATEGORY_COLORS[c.decisionCategory] || "gray",
      count: c._count,
    })),
    byRisk: byRisk.map((r) => ({
      level: r.riskLevel,
      count: r._count,
      color: RISK_COLORS[r.riskLevel] || "gray",
    })),
  };
}
