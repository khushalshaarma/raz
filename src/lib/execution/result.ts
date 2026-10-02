import { prisma } from "@/lib/prisma";
import type { ExecutionStatus } from "./types";

export async function recordExecutionEvent(
  executionId: string,
  event: string,
  details: Record<string, unknown> = {},
  severity: string = "INFO"
): Promise<void> {
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
  });

  await prisma.auditLog.create({
    data: {
      merchantId: execution?.merchantId,
      action: event,
      resourceType: "EXECUTION",
      resourceId: executionId,
      outcome: event,
      details: JSON.stringify(details),
      severity,
    },
  });
}

export async function updateExecutionStatus(
  executionId: string,
  status: ExecutionStatus,
  data: Record<string, unknown> = {}
): Promise<void> {
  await prisma.execution.update({
    where: { id: executionId },
    data: {
      status,
      ...data,
      updatedAt: new Date(),
    },
  });
}

export async function createExecutionAttempt(
  executionId: string,
  attemptNumber: number,
  provider: string,
  idempotencyKey?: string
): Promise<string> {
  const attempt = await prisma.executionAttempt.create({
    data: {
      executionId,
      attemptNumber,
      provider,
      idempotencyKey,
      status: "PENDING",
      requestHash: null,
      providerReference: null,
    },
  });

  return attempt.id;
}

export async function updateAttemptStatus(
  attemptId: string,
  status: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  await prisma.executionAttempt.update({
    where: { id: attemptId },
    data: {
      status,
      ...data,
      completedAt: status !== "PENDING" ? new Date() : undefined,
    },
  });
}

export async function getExecutionWithRelations(executionId: string) {
  return prisma.execution.findUnique({
    where: { id: executionId },
    include: {
      executionAttempts: { orderBy: { attemptNumber: "desc" } },
      reconciliation: true,
      governanceDecision: true,
      actionRequest: true,
    },
  });
}

export async function listExecutionsForMerchant(
  merchantId: string,
  options?: { skip?: number; take?: number; status?: string }
) {
  return prisma.execution.findMany({
    where: {
      merchantId,
      ...(options?.status ? { status: options.status } : {}),
    },
    skip: options?.skip,
    take: options?.take,
    orderBy: { createdAt: "desc" },
    include: {
      executionAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
      reconciliation: true,
    },
  });
}
