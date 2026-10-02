/**
 * Outcome Tracking (Phase 3 — Decision Intelligence)
 *
 * Records actual vs predicted outcomes for learning.
 * All calculations are deterministic and documented.
 *
 * Status types:
 * - REAL: actual business result
 * - SIMULATED: simulated/estimated result (no external execution)
 */

import { prisma } from "@/lib/prisma";

/** Outcome record interface */
export interface OutcomeRecord {
  id: string;
  decisionId: string;
  merchantId: string;
  predictedScenario: string;
  predictedNetImpactMinor: number;
  actualNetImpactMinor: number | null;
  absoluteError: number | null;
  percentageError: number | null;
  status: string;
  createdAt: Date;
}

/** Outcome summary interface */
export interface OutcomeSummary {
  id: string;
  decisionId: string;
  merchantId: string;
  predictedScenario: string;
  predictedNetImpactMinor: number;
  actualNetImpactMinor: number | null;
  absoluteError: number | null;
  percentageError: number | null;
  status: string;
  createdAt: Date;
}

/** Statistics interface */
export interface OutcomeStatistics {
  totalOutcomes: number;
  meanAbsoluteError: number;
  meanPercentageError: number;
  accuracy: number;
  averageROIError: number;
}

/** Record a new outcome */
export async function recordOutcome(
  decisionId: string,
  merchantId: string,
  predictedScenario: string,
  predictedNetImpactMinor: number,
  actualNetImpactMinor: number,
  predictedROI: number,
  predictedConversions: number,
  actualConversions: number,
  status: string = "SIMULATED"
) {
  const absoluteError = Math.abs(predictedNetImpactMinor - actualNetImpactMinor);
  const percentageError = predictedNetImpactMinor !== 0
    ? Math.abs((predictedNetImpactMinor - actualNetImpactMinor) / Math.abs(predictedNetImpactMinor)) * 100
    : 0;

  const correctPrediction = predictedNetImpactMinor > 0
    ? actualNetImpactMinor > 0
    : predictedNetImpactMinor < 0
      ? actualNetImpactMinor < 0
      : actualNetImpactMinor === 0;

  const data = {
    decisionId,
    merchantId,
    predictedScenario,
    predictedNetImpactMinor,
    actualNetImpactMinor,
    absoluteError,
    percentageError,
    correctPrediction,
    status,
  };

  const outcome = (await prisma.decisionOutcome.create({
    data,
  })) as unknown as OutcomeRecord;

  return outcome;
}

/** Get an outcome by ID */
export async function getOutcome(outcomeId: string) {
  const outcome = (await prisma.decisionOutcome.findUnique({
    where: { id: outcomeId },
  })) as unknown as OutcomeRecord;

  if (!outcome) {
    return null;
  }

  return outcome;
}

/** List outcomes for a merchant */
export async function listOutcomes(merchantId: string, decisionId?: string) {
  const where = decisionId ? { merchantId, decisionId } : { merchantId };

  const prismaOutcomes = await prisma.decisionOutcome.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return prismaOutcomes.map((o) => ({
    id: o.id,
    decisionId: o.decisionId,
    merchantId: o.merchantId,
    predictedScenario: o.predictedScenario,
    predictedNetImpactMinor: o.predictedNetImpactMinor,
    actualNetImpactMinor: o.actualNetImpactMinor,
    absoluteError: o.absoluteError,
    percentageError: o.percentageError,
    status: (o as unknown as OutcomeSummary).status,
    createdAt: o.createdAt,
  } as OutcomeSummary));
}

/** Calculate prediction error statistics */
export async function calculatePredictionError(merchantId: string) {
  const outcomes = await prisma.decisionOutcome.findMany({
    where: { merchantId },
    select: {
      absoluteError: true,
      percentageError: true,
      correctPrediction: true,
    },
  });

  if (outcomes.length === 0) {
    return {
      totalOutcomes: 0,
      meanAbsoluteError: 0,
      meanPercentageError: 0,
      accuracy: 0,
      averageROIError: 0,
    };
  }

  const totalOutcomes = outcomes.length;
  const meanAbsoluteError = outcomes.reduce(
    (sum, o) => sum + (o.absoluteError ?? 0),
    0
  ) / totalOutcomes;

  const meanPercentageError = outcomes.reduce(
    (sum, o) => sum + (o.percentageError ?? 0),
    0
  ) / totalOutcomes;

  const correctCount = outcomes.filter((o) => o.correctPrediction === true).length;
  const accuracy = (correctCount / totalOutcomes) * 100;

  return {
    totalOutcomes,
    meanAbsoluteError,
    meanPercentageError,
    accuracy,
    averageROIError: 0,
  };
}