import { prisma } from "@/lib/prisma";

export interface ExecutionOutcome {
  id: string;
  executionId: string;
  decisionId: string;
  strategyId: string;
  merchantId: string;
  predictedRevenueMinor: number;
  actualRevenueMinor: number | null;
  predictedCostMinor: number;
  actualCostMinor: number | null;
  predictedNetImpactMinor: number;
  actualNetImpactMinor: number | null;
  predictedROI: number;
  actualROI: number | null;
  predictedConversion: number;
  actualConversion: number | null;
  source: "SIMULATED" | "REAL";
  status: string;
}

export async function recordExecutionOutcome(
  executionId: string,
  predicted: {
    revenueMinor: number;
    costMinor: number;
    netImpactMinor: number;
    roi: number;
    conversion: number;
  }
): Promise<void> {
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: { governanceDecision: true },
  });

  if (!execution) return;

  const decision = await prisma.decision.findFirst({
    where: { strategyId: execution.strategyId, merchantId: execution.merchantId },
  });

  const source: "SIMULATED" | "REAL" = execution.status === "SUCCEEDED" ? "REAL" : "SIMULATED";

  await prisma.decisionOutcome.create({
    data: {
      decisionId: decision?.id || execution.governanceDecisionId,
      merchantId: execution.merchantId,
      predictedScenario: "EXPECTED",
      predictedNetImpactMinor: predicted.netImpactMinor,
      actualNetImpactMinor: execution.status === "SUCCEEDED" ? execution.amountMinor : null,
      absoluteError: execution.status === "SUCCEEDED" ? Math.abs(predicted.netImpactMinor - execution.amountMinor) : null,
      percentageError: execution.status === "SUCCEEDED" && predicted.netImpactMinor > 0
        ? Math.abs((predicted.netImpactMinor - execution.amountMinor) / predicted.netImpactMinor) * 100
        : null,
      correctPrediction: execution.status === "SUCCEEDED" && Math.abs(predicted.netImpactMinor - execution.amountMinor) / predicted.netImpactMinor < 0.2,
    },
  });
}

export async function getOutcomeForExecution(executionId: string) {
  const execution = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!execution) return null;

  return prisma.decisionOutcome.findFirst({
    where: { merchantId: execution.merchantId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listOutcomesForMerchant(merchantId: string, limit: number = 20) {
  return prisma.decisionOutcome.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
