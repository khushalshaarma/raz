import { prisma } from "@/lib/prisma";
import { executeProviderAction } from "./executor";
import { runExecutionPreflight } from "./preflight";
import { createExecutionIdempotencyRecord } from "./idempotency";
import { recordExecutionEvent, updateExecutionStatus, getExecutionWithRelations, listExecutionsForMerchant } from "./result";
import { reconcileExecution, getReconciliationStatus, listReconciliationAlerts } from "./reconciliation";
import { recordExecutionOutcome, getOutcomeForExecution, listOutcomesForMerchant } from "./outcome";
import type { ExecutionResultOut } from "./types";

export interface ExecuteActionInput {
  executionReadyActionId: string;
  merchantId: string;
}

export interface ExecuteActionResult {
  success: boolean;
  executionId: string;
  status: string;
  providerReference?: string;
  error?: string;
}

export async function executeAction(input: ExecuteActionInput): Promise<ExecuteActionResult> {
  const { executionReadyActionId, merchantId } = input;

  const execution = await prisma.execution.findUnique({
    where: { id: executionReadyActionId },
  });

  if (!execution) {
    return { success: false, executionId: "", status: "NOT_FOUND", error: "Execution not found" };
  }

  if (execution.merchantId !== merchantId) {
    return { success: false, executionId: execution.id, status: "MERCHANT_ISOLATION_VIOLATION", error: "Merchant isolation violation" };
  }

  const governanceDecision = await prisma.governanceDecision.findUnique({
    where: { id: execution.governanceDecisionId },
  });

  if (!governanceDecision || governanceDecision.status !== "APPROVED") {
    return { success: false, executionId: execution.id, status: "GOVERNANCE_INVALID", error: "Governance decision not approved" };
  }

  const actionRequest = await prisma.actionRequest.findUnique({
    where: { id: execution.actionRequestId },
  });

  if (!actionRequest || actionRequest.status !== "APPROVED") {
    return { success: false, executionId: execution.id, status: "GOVERNANCE_INVALID", error: "Action request not approved" };
  }

  const preflight = await runExecutionPreflight(execution.id, merchantId);
  if (preflight.status !== "READY") {
    return { success: false, executionId: execution.id, status: preflight.status, error: preflight.reason };
  }

  const result = await executeProviderAction({ executionId: execution.id, merchantId });

  if (result.success) {
    await recordExecutionOutcome(execution.id, {
      revenueMinor: execution.amountMinor,
      costMinor: 0,
      netImpactMinor: execution.amountMinor,
      roi: 0,
      conversion: 0,
    });
  }

  return {
    success: result.success,
    executionId: execution.id,
    status: result.status,
    providerReference: result.providerReference,
    error: result.error,
  };
}

export async function getExecutionDetails(executionId: string, merchantId: string) {
  const execution = await getExecutionWithRelations(executionId);
  if (!execution || execution.merchantId !== merchantId) return null;
  return execution;
}

export async function listMerchantExecutions(merchantId: string, options?: { skip?: number; take?: number; status?: string }) {
  return listExecutionsForMerchant(merchantId, options);
}

export async function reconcileAndRecord(executionId: string) {
  const result = await reconcileExecution(executionId);
  if (!result) return null;

  if (result.status === "MATCHED" && result.providerStatus === "SUCCEEDED") {
    await recordExecutionOutcome(executionId, {
      revenueMinor: result.amountMinor || 0,
      costMinor: 0,
      netImpactMinor: result.amountMinor || 0,
      roi: 0,
      conversion: 0,
    });
  }

  return result;
}
