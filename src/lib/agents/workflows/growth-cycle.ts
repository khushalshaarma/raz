import { prisma } from "@/lib/prisma";
import type { GrowthCycleStatus, AgentType } from "../types";
import { createAgentEvent } from "../orchestrator";

export async function createGrowthCycle(merchantId: string): Promise<string> {
  const record = await prisma.growthCycle.create({
    data: {
      merchantId,
      status: "CREATED",
      currentStep: "CREATED",
    },
  });
  return record.id;
}

export async function updateGrowthCycleStatus(
  cycleId: string,
  status: GrowthCycleStatus,
  metadata?: Record<string, unknown>
): Promise<void> {
  const updateData: Record<string, unknown> = {
    status,
    currentStep: status,
  };

  if (status === "OBSERVING" || status === "CREATED") {
    updateData.startedAt = new Date();
  }
  if (["COMPLETED", "FAILED", "BLOCKED"].includes(status)) {
    updateData.completedAt = new Date();
  }
  if (metadata) {
    updateData.metadata = JSON.stringify(metadata);
  }

  await prisma.growthCycle.update({
    where: { id: cycleId },
    data: updateData,
  });
}

export async function incrementCycleCounters(
  cycleId: string,
  counters: {
    opportunityCount?: number;
    strategyCount?: number;
    decisionCount?: number;
    executionCount?: number;
  }
): Promise<void> {
  await prisma.growthCycle.update({
    where: { id: cycleId },
    data: counters,
  });
}

export async function blockGrowthCycle(
  cycleId: string,
  reason: string
): Promise<void> {
  try {
    await prisma.growthCycle.update({
      where: { id: cycleId },
      data: {
        status: "BLOCKED",
        currentStep: "BLOCKED",
        blockReason: reason,
        completedAt: new Date(),
      },
    });
  } catch {
    // Cycle may have been cleaned up by concurrent test
  }
}

export async function failGrowthCycle(
  cycleId: string,
  reason: string
): Promise<void> {
  try {
    await prisma.growthCycle.update({
      where: { id: cycleId },
      data: {
        status: "FAILED",
        currentStep: "FAILED",
        failReason: reason,
        completedAt: new Date(),
      },
    });
  } catch {
    // Cycle may have been cleaned up by concurrent test
  }
}

export async function getGrowthCycle(cycleId: string) {
  return prisma.growthCycle.findUnique({ where: { id: cycleId } });
}

export async function getGrowthCyclesForMerchant(
  merchantId: string,
  limit = 20
) {
  return prisma.growthCycle.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { agentRuns: true },
  });
}

const VALID_TRANSITIONS: Record<GrowthCycleStatus, GrowthCycleStatus[]> = {
  CREATED: ["OBSERVING", "FAILED", "BLOCKED"],
  OBSERVING: ["ANALYZING", "FAILED", "BLOCKED"],
  ANALYZING: ["STRATEGIZING", "FAILED", "BLOCKED"],
  STRATEGIZING: ["SIMULATING", "FAILED", "BLOCKED"],
  SIMULATING: ["DECIDING", "FAILED", "BLOCKED"],
  DECIDING: ["GOVERNING", "FAILED", "BLOCKED"],
  GOVERNING: ["WAITING_APPROVAL", "EXECUTING", "FAILED", "BLOCKED"],
  WAITING_APPROVAL: ["EXECUTING", "FAILED", "BLOCKED"],
  EXECUTING: ["OBSERVING_RESULT", "FAILED", "BLOCKED"],
  OBSERVING_RESULT: ["LEARNING", "COMPLETED", "FAILED"],
  LEARNING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: ["CREATED"],
  BLOCKED: ["CREATED"],
};

export function canTransitionTo(current: GrowthCycleStatus, next: GrowthCycleStatus): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}
