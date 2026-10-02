import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface IdempotencyRecord {
  isNew: boolean;
  executionId: string;
  wasRetrieved: boolean;
}

export async function createExecutionIdempotencyRecord(
  merchantId: string,
  executionId: string,
  idempotencyKey: string
): Promise<IdempotencyRecord> {
  if (!merchantId || !executionId || !idempotencyKey) {
    throw new Error("Missing required idempotency fields");
  }

  const existing = await prisma.execution.findFirst({
    where: {
      merchantId,
      idempotencyKey,
      id: executionId,
    },
  });

  if (existing) {
    return { isNew: false, executionId, wasRetrieved: true };
  }

  const existingByKey = await prisma.execution.findFirst({
    where: {
      merchantId,
      idempotencyKey,
    },
  });

  if (existingByKey && existingByKey.status !== "CREATED" && existingByKey.status !== "PREFLIGHT") {
    return { isNew: false, executionId: existingByKey.id, wasRetrieved: true };
  }

  await prisma.execution.create({
    data: {
      id: executionId,
      merchantId,
      idempotencyKey,
      status: "CREATED",
    },
  });

  return { isNew: true, executionId, wasRetrieved: false };
}

export async function isDuplicateExecution(
  merchantId: string,
  executionId: string
): Promise<boolean> {
  const existing = await prisma.execution.findFirst({
    where: {
      merchantId,
      id: executionId,
    },
  });

  return existing !== null;
}

export async function cleanupExpiredExecutions(): Promise<number> {
  const cutoff = new Date(Date.now() - 86400000);
  const result = await prisma.execution.deleteMany({
    where: {
      status: { in: ["CREATED", "PREFLIGHT"] },
      createdAt: { lt: cutoff },
    },
  });

  return result.count;
}
