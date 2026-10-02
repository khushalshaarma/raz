import { prisma } from "@/lib/prisma";
import type { ReconciliationResult } from "./types";
import { fetchRazorpayOrder } from "./providers/razorpay/orders";
import { fetchRazorpayPayment } from "./providers/razorpay/payments";

const RAZORPAY_STATUS_MAP: Record<string, string> = {
  created: "PENDING",
  attempted: "PENDING",
  paid: "SUCCEEDED",
  failed: "FAILED",
};

export async function reconcileExecution(executionId: string): Promise<ReconciliationResult | null> {
  const execution = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!execution) return null;

  if (!execution.providerReference) {
    return createReconciliationRecord(executionId, execution.merchantId, "razorpay", null, null, execution.status, null, null, "MISSING", "No provider reference");
  }

  let providerStatus: string | null = null;
  let providerAmount: number | null = null;
  let providerCurrency: string | null = null;

  try {
    const order = await fetchRazorpayOrder(execution.providerReference);
    providerStatus = RAZORPAY_STATUS_MAP[order.status] || order.status.toUpperCase();
    providerAmount = order.amount;
    providerCurrency = order.currency;
  } catch {
    return createReconciliationRecord(executionId, execution.merchantId, "razorpay", execution.providerReference, null, execution.status, null, null, "UNKNOWN", "Could not fetch provider status");
  }

  const amountMatch = providerAmount !== null ? providerAmount === execution.amountMinor : null;
  const statusMatch = providerStatus !== null ? providerStatus === execution.status : null;

  let status: string;
  let mismatchReason: string | null = null;

  if (amountMatch && statusMatch) {
    status = "MATCHED";
  } else if (amountMatch === false) {
    status = "MISMATCH";
    mismatchReason = `Amount mismatch: GrowthOS=${execution.amountMinor}, Provider=${providerAmount}`;
  } else if (statusMatch === false) {
    status = "MISMATCH";
    mismatchReason = `Status mismatch: GrowthOS=${execution.status}, Provider=${providerStatus}`;
  } else {
    status = "UNKNOWN";
  }

  if (providerStatus === "SUCCEEDED" && execution.status !== "SUCCEEDED") {
    await prisma.execution.update({
      where: { id: executionId },
      data: { status: "SUCCEEDED", completedAt: new Date() },
    });
  }

  return createReconciliationRecord(executionId, execution.merchantId, "razorpay", execution.providerReference, providerStatus, execution.status, providerAmount, providerCurrency, status, mismatchReason);
}

async function createReconciliationRecord(
  executionId: string,
  merchantId: string,
  provider: string,
  providerReference: string | null,
  providerStatus: string | null,
  growthOSStatus: string | null,
  amountMinor: number | null,
  currency: string | null,
  status: string,
  mismatchReason: string | null
): Promise<ReconciliationResult> {
  const existing = await prisma.reconciliation.findFirst({ where: { executionId } });
  const amountMatch = amountMinor !== null ? amountMinor === (await prisma.execution.findUnique({ where: { id: executionId } }))?.amountMinor : null;
  const statusMatch = providerStatus !== null ? providerStatus === growthOSStatus : null;

  if (existing) {
    await prisma.reconciliation.update({
      where: { id: existing.id },
      data: { providerStatus, growthOSStatus, amountMinor, currency, amountMatch, statusMatch, status, mismatchReason },
    });
    return { ...existing, providerStatus, growthOSStatus, amountMinor, currency, amountMatch, statusMatch, status, mismatchReason };
  }

  const record = await prisma.reconciliation.create({
    data: {
      executionId, merchantId, provider, providerReference, providerStatus, growthOSStatus, amountMinor, currency, amountMatch, statusMatch, status, mismatchReason,
    },
  });

  return record;
}

export async function getReconciliationStatus(executionId: string): Promise<ReconciliationResult | null> {
  return prisma.reconciliation.findFirst({ where: { executionId } });
}

export async function listReconciliationAlerts(merchantId?: string) {
  return prisma.reconciliation.findMany({
    where: {
      ...(merchantId ? { merchantId } : {}),
      status: { in: ["MISMATCH", "ALERT", "UNKNOWN"] },
    },
    orderBy: { createdAt: "desc" },
    include: { execution: true },
  });
}
