import { prisma } from "@/lib/prisma";
import { getRazorpayConfig } from "./providers/razorpay/config";
import { createRazorpayOrder } from "./providers/razorpay/orders";
import { classifyFailure, recordFailure } from "./failure";
import { acquireExecutionLock, runExecutionPreflight } from "./preflight";
import { recordExecutionEvent, updateExecutionStatus, createExecutionAttempt, updateAttemptStatus, getExecutionWithRelations } from "./result";

export interface ExecutionInput {
  executionId: string;
  merchantId: string;
}

export interface ExecutionOutput {
  success: boolean;
  status: string;
  executionId: string;
  providerReference?: string;
  error?: string;
}

export async function executeProviderAction(input: ExecutionInput): Promise<ExecutionOutput> {
  const { executionId, merchantId } = input;

  const preflight = await runExecutionPreflight(executionId, merchantId);
  if (preflight.status !== "READY") {
    return {
      success: false,
      status: preflight.status,
      executionId,
      error: preflight.reason,
    };
  }

  const locked = await acquireExecutionLock(executionId);
  if (!locked) {
    return {
      success: false,
      status: "LOCK_FAILED",
      executionId,
      error: "Could not acquire execution lock",
    };
  }

  await updateExecutionStatus(executionId, "EXECUTING");
  await recordExecutionEvent(executionId, "EXECUTION_STARTED", { merchantId });

  const execution = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!execution) {
    return { success: false, status: "EXECUTION_NOT_FOUND", executionId, error: "Execution record not found" };
  }

  let attemptNumber = 1;
  const existingAttempts = await prisma.executionAttempt.findMany({
    where: { executionId },
    orderBy: { attemptNumber: "desc" },
  });
  if (existingAttempts.length > 0) {
    attemptNumber = existingAttempts[0].attemptNumber + 1;
  }

  const attemptId = await createExecutionAttempt(executionId, attemptNumber, "razorpay", execution.idempotencyKey || undefined);
  await recordExecutionEvent(executionId, "PROVIDER_REQUESTED", { attemptId, attemptNumber });

  try {
    const config = getRazorpayConfig();
    const receipt = `exec_${executionId.slice(0, 16)}`;

    const order = await createRazorpayOrder({
      amountMinor: execution.amountMinor,
      currency: execution.currency,
      receipt,
      notes: {
        growthosExecutionId: executionId,
        governanceDecisionId: execution.governanceDecisionId,
        actionRequestId: execution.actionRequestId,
        merchantId: execution.merchantId,
        strategyId: execution.strategyId,
      },
    });

    await updateAttemptStatus(attemptId, "ACCEPTED", {
      providerReference: order.id,
    });

    await updateExecutionStatus(executionId, "SUBMITTED", {
      providerReference: order.id,
    });

    await recordExecutionEvent(executionId, "PROVIDER_ACCEPTED", {
      attemptId,
      providerReference: order.id,
      orderId: order.id,
    });

    return {
      success: true,
      status: "SUBMITTED",
      executionId,
      providerReference: order.id,
    };
  } catch (error: any) {
    const failureCode = error?.code || error?.message?.substring(0, 50) || "PROVIDER_ERROR";
    const failureReason = error?.message || "Unknown provider error";

    await recordFailure(executionId, attemptId, failureCode, failureReason);
    await recordExecutionEvent(executionId, "PROVIDER_REJECTED", { attemptId, failureCode, failureReason }, "ERROR");

    const category = classifyFailure(failureCode);
    const newStatus = category.type === "NETWORK_ERROR" || category.type === "PROVIDER_ERROR" ? "UNKNOWN" : "FAILED";

    return {
      success: false,
      status: newStatus,
      executionId,
      error: failureReason,
    };
  }
}
