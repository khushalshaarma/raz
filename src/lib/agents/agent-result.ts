import { prisma } from "@/lib/prisma";
import type { AgentType, AgentStatus, AgentOutput } from "./types";

export async function createAgentRun(params: {
  merchantId: string;
  growthCycleId?: string;
  agentType: AgentType;
  input?: Record<string, unknown>;
  maxRetries?: number;
}): Promise<string> {
  const record = await prisma.agentRun.create({
    data: {
      merchantId: params.merchantId,
      growthCycleId: params.growthCycleId,
      agentType: params.agentType,
      input: params.input ? JSON.stringify(params.input) : null,
      maxRetries: params.maxRetries ?? 3,
      status: "PENDING",
    },
  });
  return record.id;
}

export async function startAgentRun(agentRunId: string): Promise<void> {
  await prisma.agentRun.update({
    where: { id: agentRunId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
    },
  });
}

export async function completeAgentRun(
  agentRunId: string,
  output: AgentOutput
): Promise<void> {
  const startedAt = await prisma.agentRun.findUnique({
    where: { id: agentRunId },
    select: { startedAt: true },
  });

  const durationMs = startedAt?.startedAt
    ? Date.now() - startedAt.startedAt.getTime()
    : 0;

  await prisma.agentRun.update({
    where: { id: agentRunId },
    data: {
      status: "COMPLETED",
      output: JSON.stringify(output),
      confidence: output.confidence,
      reasoningSummary: output.reasoningSummary,
      warnings: JSON.stringify(output.warnings),
      completedAt: new Date(),
      durationMs,
    },
  });
}

export async function failAgentRun(
  agentRunId: string,
  error: string
): Promise<void> {
  await prisma.agentRun.update({
    where: { id: agentRunId },
    data: {
      status: "FAILED",
      error,
      completedAt: new Date(),
    },
  });
}

export async function getAgentRun(agentRunId: string) {
  return prisma.agentRun.findUnique({ where: { id: agentRunId } });
}

export async function getAgentRunsForCycle(merchantId: string, growthCycleId: string) {
  return prisma.agentRun.findMany({
    where: { merchantId, growthCycleId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getAgentRunStats(merchantId: string, agentType?: AgentType) {
  const where = { merchantId, ...(agentType ? { agentType } : {}) };

  const total = await prisma.agentRun.count({ where });
  const completed = await prisma.agentRun.count({ where: { ...where, status: "COMPLETED" } });
  const failed = await prisma.agentRun.count({ where: { ...where, status: "FAILED" } });
  const running = await prisma.agentRun.count({ where: { ...where, status: "RUNNING" } });

  const avgDuration = await prisma.agentRun.aggregate({
    where: { ...where, durationMs: { not: null } },
    _avg: { durationMs: true },
  });

  return {
    total,
    completed,
    failed,
    running,
    successRate: total > 0 ? completed / total : 0,
    failureRate: total > 0 ? failed / total : 0,
    averageDurationMs: avgDuration._avg.durationMs ?? 0,
  };
}
