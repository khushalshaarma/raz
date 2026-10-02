import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import type { ExecutionResult, ExecutionStatus, PreflightResult } from "./types";

export async function runExecutionPreflight(
  executionId: string,
  merchantId: string
): Promise<PreflightResult> {
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
  });

  if (!execution) {
    return { status: "BLOCKED", reason: "EXECUTION_NOT_FOUND" };
  }

  if (execution.merchantId !== merchantId) {
    return { status: "BLOCKED", reason: "MERCHANT_ISOLATION_VIOLATION" };
  }

  if (execution.status === "SUCCEEDED" || execution.status === "CANCELLED" || execution.status === "EXPIRED") {
    return { status: "ALREADY_EXECUTED", reason: `Execution already ${execution.status}` };
  }

  if (execution.status === "UNKNOWN") {
    return { status: "BLOCKED", reason: "UNKNOWN_STATE_REQUIRES_RECONCILIATION" };
  }

  const governanceDecision = await prisma.governanceDecision.findUnique({
    where: { id: execution.governanceDecisionId },
  });

  if (!governanceDecision || governanceDecision.status !== "APPROVED") {
    return { status: "GOVERNANCE_INVALID", reason: "Governance decision not approved" };
  }

  if (governanceDecision.approvedAt && governanceDecision.approvedAt < new Date(Date.now() - 3600000)) {
    return { status: "EXPIRED", reason: "Approval expired" };
  }

  const actionRequest = await prisma.actionRequest.findUnique({
    where: { id: execution.actionRequestId },
  });

  if (!actionRequest || actionRequest.status !== "APPROVED") {
    return { status: "GOVERNANCE_INVALID", reason: "Action request not approved" };
  }

  const latestHealth = await prisma.systemHealth.findFirst({
    orderBy: { lastCheckedAt: "desc" },
  });

  if (!latestHealth || latestHealth.application !== "ok" || latestHealth.api !== "ok") {
    return { status: "EMERGENCY_STOP", reason: "Emergency stop active" };
  }

  const pausedAutomation = await prisma.policy.findFirst({
    where: {
      merchantId,
      name: "AUTOMATION_PAUSED",
      isActive: true,
    },
  });

  if (pausedAutomation) {
    return { status: "AUTOMATION_PAUSED", reason: "Automation paused" };
  }

  const existingAttempt = await prisma.executionAttempt.findFirst({
    where: { executionId, status: "ACCEPTED" },
  });

  if (existingAttempt) {
    return { status: "ALREADY_EXECUTED", reason: "Already submitted to provider" };
  }

  if (execution.idempotencyKey) {
    const existingByIdempotency = await prisma.execution.findFirst({
      where: {
        merchantId,
        idempotencyKey: execution.idempotencyKey,
        NOT: { id: executionId },
        status: { in: ["SUCCEEDED", "SUBMITTED", "PENDING"] },
      },
    });

    if (existingByIdempotency) {
      return { status: "IDEMPOTENCY_CONFLICT", reason: "Duplicate idempotency key" };
    }
  }

  return { status: "READY" };
}

export async function acquireExecutionLock(executionId: string): Promise<boolean> {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 30000);

    const updated = await prisma.execution.update({
      where: {
        id: executionId,
        status: { in: ["CREATED", "PREFLIGHT", "READY", "EXECUTING"] },
        OR: [{ startedAt: null }, { startedAt: { lte: cutoff } }],
      },
      data: { status: "EXECUTING", startedAt: now },
    });

    return true;
  } catch {
    return false;
  }
}

export function classifyRetry(failureCode: string | null): "SAFE_TO_RETRY" | "NOT_SAFE_TO_RETRY" | "UNKNOWN" {
  if (!failureCode) return "UNKNOWN";

  const safeCodes = ["TIMEOUT", "RATE_LIMIT", "NETWORK_ERROR", "SERVER_ERROR"];
  const notSafeCodes = ["VALIDATION_ERROR", "AUTH_ERROR", "PAYMENT_DECLINED", "INSUFFICIENT_FUNDS", "CARD_DECLINED", "INVALID_REQUEST"];

  if (safeCodes.includes(failureCode)) return "SAFE_TO_RETRY";
  if (notSafeCodes.includes(failureCode)) return "NOT_SAFE_TO_RETRY";
  return "UNKNOWN";
}
