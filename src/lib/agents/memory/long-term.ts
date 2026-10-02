import type { MemoryType } from "../types";
import { storeMemory, retrieveMemory, listMemory, createMemoryKey } from "./memory";
import type { MemoryCategory } from "../types";

const LONG_TERM_MEMORY: MemoryType = "LONG_TERM";

export async function storeLongTermMemory(
  merchantId: string,
  category: MemoryCategory,
  key: string,
  value: Record<string, unknown>,
  confidence?: number
): Promise<string> {
  return storeMemory({
    merchantId,
    memoryType: LONG_TERM_MEMORY,
    category,
    key,
    value,
    confidence,
  });
}

export async function getLongTermMemory(
  merchantId: string,
  category: MemoryCategory,
  key: string
) {
  return retrieveMemory(merchantId, LONG_TERM_MEMORY, category, key);
}

export async function listLongTermMemory(
  merchantId: string,
  category?: MemoryCategory
) {
  return listMemory(merchantId, LONG_TERM_MEMORY, category);
}

export async function recordStrategyPerformance(
  merchantId: string,
  strategyType: string,
  result: {
    success: boolean;
    revenueMinor: number;
    costMinor: number;
    roi: number;
  }
): Promise<void> {
  const key = createMemoryKey("strategy", strategyType, "performance");
  const existing = await getLongTermMemory(merchantId, "STRATEGY_PERFORMANCE", key);

  const prev = (existing?.value as Record<string, unknown>) ?? {
    totalRuns: 0,
    successCount: 0,
    totalRevenueMinor: 0,
    totalCostMinor: 0,
    avgRoi: 0,
  };

  const totalRuns = ((prev.totalRuns as number) ?? 0) + 1;
  const successCount = ((prev.successCount as number) ?? 0) + (result.success ? 1 : 0);
  const totalRevenueMinor = ((prev.totalRevenueMinor as number) ?? 0) + result.revenueMinor;
  const totalCostMinor = ((prev.totalCostMinor as number) ?? 0) + result.costMinor;
  const avgRoi = (((prev.avgRoi as number) ?? 0) * (totalRuns - 1) + result.roi) / totalRuns;

  await storeLongTermMemory(merchantId, "STRATEGY_PERFORMANCE", key, {
    totalRuns,
    successCount,
    successRate: successCount / totalRuns,
    totalRevenueMinor,
    totalCostMinor,
    avgRoi,
    lastRunAt: new Date().toISOString(),
  });
}

export async function recordPredictionAccuracy(
  merchantId: string,
  strategyType: string,
  predictedMinor: number,
  actualMinor: number
): Promise<void> {
  const key = createMemoryKey("strategy", strategyType, "prediction");
  const existing = await getLongTermMemory(merchantId, "PREDICTION_ACCURACY", key);

  const prev = (existing?.value as Record<string, unknown>) ?? {
    totalPredictions: 0,
    totalAbsoluteError: 0,
    avgAbsoluteError: 0,
  };

  const totalPredictions = ((prev.totalPredictions as number) ?? 0) + 1;
  const absoluteError = Math.abs(predictedMinor - actualMinor);
  const totalAbsoluteError = ((prev.totalAbsoluteError as number) ?? 0) + absoluteError;
  const avgAbsoluteError = totalAbsoluteError / totalPredictions;

  await storeLongTermMemory(merchantId, "PREDICTION_ACCURACY", key, {
    totalPredictions,
    totalAbsoluteError,
    avgAbsoluteError,
    lastPredictionAt: new Date().toISOString(),
  });
}
