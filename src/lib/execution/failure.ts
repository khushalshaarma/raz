import { prisma } from "@/lib/prisma";
import type { ExecutionStatus, FailureCategory } from "./types";

export function classifyFailure(failureCode: string | null | undefined): FailureCategory {
  if (!failureCode) {
    return { type: "UNKNOWN", code: "UNKNOWN", recoverable: false, retryAllowed: false };
  }

  const code = failureCode.toUpperCase();

  if (code.includes("CARD_DECLINED") || code.includes("PAYMENT_DECLINED")) {
    return { type: "PAYMENT_DECLINED", code, recoverable: false, retryAllowed: false };
  }
  if (code.includes("INSUFFICIENT")) {
    return { type: "INSUFFICIENT_FUNDS", code, recoverable: false, retryAllowed: false };
  }
  if (code.includes("NETWORK") || code.includes("TIMEOUT") || code.includes("ECONNREFUSED")) {
    return { type: "NETWORK_ERROR", code, recoverable: true, retryAllowed: true };
  }
  if (code.includes("AUTH") || code.includes("UNAUTHORIZED")) {
    return { type: "AUTH_ERROR", code, recoverable: false, retryAllowed: false };
  }
  if (code.includes("VALIDATION") || code.includes("INVALID")) {
    return { type: "VALIDATION_ERROR", code, recoverable: false, retryAllowed: false };
  }
  if (code.includes("DUPLICATE") || code.includes("ALREADY")) {
    return { type: "DUPLICATE", code, recoverable: false, retryAllowed: false };
  }
  if (code.includes("SERVER") || code.includes("INTERNAL")) {
    return { type: "PROVIDER_ERROR", code, recoverable: true, retryAllowed: true };
  }

  return { type: "UNKNOWN", code, recoverable: false, retryAllowed: false };
}

export function mapFailureToStatus(category: FailureCategory): ExecutionStatus {
  switch (category.type) {
    case "NETWORK_ERROR":
    case "PROVIDER_ERROR":
      return "UNKNOWN";
    case "PAYMENT_DECLINED":
    case "INSUFFICIENT_FUNDS":
      return "FAILED";
    case "VALIDATION_ERROR":
    case "AUTH_ERROR":
      return "FAILED";
    case "DUPLICATE":
      return "PENDING";
    default:
      return "FAILED";
  }
}

export async function recordFailure(
  executionId: string,
  attemptId: string,
  failureCode: string | null,
  failureReason: string | null
): Promise<void> {
  const category = classifyFailure(failureCode);
  const newStatus = mapFailureToStatus(category);

  await prisma.executionAttempt.update({
    where: { id: attemptId },
    data: {
      status: "FAILED",
      failureCode,
      failureReason,
      completedAt: new Date(),
    },
  });

  await prisma.execution.update({
    where: { id: executionId },
    data: {
      status: newStatus,
      failureCode,
      failureReason,
      completedAt: newStatus === "UNKNOWN" ? null : new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      merchantId: (await prisma.execution.findUnique({ where: { id: executionId } }))?.merchantId,
      action: "EXECUTION_FAILED",
      resourceType: "EXECUTION",
      resourceId: executionId,
      outcome: "FAILED",
      details: JSON.stringify({ failureCode, failureReason, category: category.type, status: newStatus }),
      severity: "ERROR",
    },
  });
}
