import type { MemoryType } from "../types";
import { storeMemory, retrieveMemory, listMemory, createMemoryKey } from "./memory";
import type { MemoryCategory } from "../types";

const EXPERIMENT_MEMORY: MemoryType = "EXPERIMENT";

export interface ExperimentRecord {
  experimentId: string;
  merchantId: string;
  strategyType: string;
  opportunityType: string;
  predictedRevenueMinor: number;
  actualRevenueMinor: number | null;
  predictedCostMinor: number;
  actualCostMinor: number | null;
  predictedNetImpactMinor: number;
  actualNetImpactMinor: number | null;
  status: "PREDICTED" | "EXECUTED" | "OBSERVED" | "LEARNED";
  createdAt: string;
}

export async function storeExperiment(
  merchantId: string,
  experimentId: string,
  record: Omit<ExperimentRecord, "experimentId" | "merchantId" | "createdAt">
): Promise<string> {
  const key = createMemoryKey("experiment", experimentId);
  return storeMemory({
    merchantId,
    memoryType: EXPERIMENT_MEMORY,
    category: "STRATEGY_PERFORMANCE",
    key,
    value: {
      experimentId,
      merchantId,
      ...record,
      createdAt: new Date().toISOString(),
    },
    confidence: 0.5,
  });
}

export async function updateExperiment(
  merchantId: string,
  experimentId: string,
  updates: Partial<ExperimentRecord>
): Promise<boolean> {
  const key = createMemoryKey("experiment", experimentId);
  const existing = await retrieveMemory(merchantId, EXPERIMENT_MEMORY, "STRATEGY_PERFORMANCE", key);
  if (!existing) return false;

  const updated = { ...existing.value, ...updates };
  await storeMemory({
    merchantId,
    memoryType: EXPERIMENT_MEMORY,
    category: "STRATEGY_PERFORMANCE",
    key,
    value: updated,
    confidence: existing.confidence,
  });
  return true;
}

export async function getExperiment(
  merchantId: string,
  experimentId: string
): Promise<ExperimentRecord | null> {
  const key = createMemoryKey("experiment", experimentId);
  const memory = await retrieveMemory(merchantId, EXPERIMENT_MEMORY, "STRATEGY_PERFORMANCE", key);
  if (!memory) return null;
  return memory.value as unknown as ExperimentRecord;
}

export async function listExperiments(
  merchantId: string,
  strategyType?: string
): Promise<ExperimentRecord[]> {
  const memories = await listMemory(merchantId, EXPERIMENT_MEMORY, "STRATEGY_PERFORMANCE");
  const experiments = memories
    .map((m) => m.value as unknown as ExperimentRecord)
    .filter((e) => e.experimentId);

  if (strategyType) {
    return experiments.filter((e) => e.strategyType === strategyType);
  }
  return experiments;
}

export async function getStrategyExperimentSummary(
  merchantId: string,
  strategyType: string
): Promise<{
  totalExperiments: number;
  executedCount: number;
  avgRevenueAccuracy: number;
  avgCostAccuracy: number;
}> {
  const experiments = await listExperiments(merchantId, strategyType);
  const executed = experiments.filter((e) => e.status === "OBSERVED" && e.actualRevenueMinor !== null);

  if (executed.length === 0) {
    return { totalExperiments: experiments.length, executedCount: 0, avgRevenueAccuracy: 0, avgCostAccuracy: 0 };
  }

  const revenueAccuracies = executed.map((e) => {
    const error = Math.abs((e.predictedRevenueMinor - (e.actualRevenueMinor ?? 0)) / e.predictedRevenueMinor);
    return 1 - Math.min(error, 1);
  });

  const costAccuracies = executed.map((e) => {
    const error = Math.abs((e.predictedCostMinor - (e.actualCostMinor ?? 0)) / Math.max(e.predictedCostMinor, 1));
    return 1 - Math.min(error, 1);
  });

  return {
    totalExperiments: experiments.length,
    executedCount: executed.length,
    avgRevenueAccuracy: revenueAccuracies.reduce((a, b) => a + b, 0) / revenueAccuracies.length,
    avgCostAccuracy: costAccuracies.reduce((a, b) => a + b, 0) / costAccuracies.length,
  };
}
