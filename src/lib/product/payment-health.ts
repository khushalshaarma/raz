import { prisma } from "@/lib/prisma";
import {
  PAYMENT_SUCCESS_STATUSES,
  PAYMENT_FAILURE_STATUSES,
  PAYMENT_REFUND_STATUSES,
  countByCanonicalStatus,
  totalStatusCount,
} from "./payment-status";

export interface PaymentHealthMetrics {
  successRate: number;
  failureRate: number;
  unknownCount: number;
  refundRate: number;
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  totalRefunds: number;
  failureBreakdown: FailureCategory[];
  /**
   * Provider-wide count of rejected Razorpay webhooks. Not merchant-scoped:
   * `WebhookEvent` has no `merchantId` column.
   */
  webhookFailures: number;
  reconciliationBacklog: number;
}

export interface FailureCategory {
  category: string;
  count: number;
  percentage: number;
}

export async function getPaymentHealth(merchantId: string): Promise<PaymentHealthMetrics> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [paymentStatusGroups, webhookFailures, reconciliationBacklog, recentExecutions] = await Promise.all([
    prisma.payment.groupBy({
      by: ["status"],
      where: { merchantId, createdAt: { gte: thirtyDaysAgo } },
      _count: { _all: true },
    }),
    // Merchant-scoped now that `WebhookEvent.merchantId` exists: the webhook
    // handler resolves the merchant by joining `Payment.providerPaymentId`.
    //
    // `REJECTED` is the real failure signal (bad signature / unparseable
    // body). The previous filter used `status: "FAILED"`, which is not in the
    // model's vocabulary
    // (PENDING | VERIFIED | REJECTED | PROCESSED | DUPLICATE | UNHANDLED),
    // so it always returned 0. `UNHANDLED` is counted too: a verified payload
    // that matched no local payment is an operational fault, not a rejection.
    //
    // Rows with merchantId = null could not be attributed to a merchant and are
    // deliberately excluded rather than leaking into every merchant's count.
    prisma.webhookEvent.count({
      where: {
        merchantId,
        provider: "razorpay",
        status: { in: ["REJECTED", "UNHANDLED"] },
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.reconciliation.count({
      where: { merchantId, status: "MISMATCH" },
    }),
    prisma.execution.findMany({
      where: { merchantId, createdAt: { gte: thirtyDaysAgo }, status: "FAILED" },
      select: { failureReason: true },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const group of paymentStatusGroups) {
    statusCounts[group.status] = group._count._all;
  }

  const totalPayments = totalStatusCount(statusCounts);
  const successfulPayments = countByCanonicalStatus(statusCounts, PAYMENT_SUCCESS_STATUSES);
  const failedPayments = countByCanonicalStatus(statusCounts, PAYMENT_FAILURE_STATUSES);
  const totalRefunds = countByCanonicalStatus(statusCounts, PAYMENT_REFUND_STATUSES);

  // Rates are computed over SETTLED payments only (captured + failed).
  //
  // Payments still in flight (CREATED, PENDING, AUTHORIZED) have not failed,
  // so including them in the denominator understates collection. On the seeded
  // dataset that produced a "51% success rate" HIGH alert on a merchant with
  // zero failed payments. Unsettled payments are reported separately via
  // `unknownCount`, and refunds via `refundRate`.
  const settledPayments = successfulPayments + failedPayments;
  const successRate = settledPayments > 0 ? (successfulPayments / settledPayments) * 100 : 100;
  const failureRate = settledPayments > 0 ? (failedPayments / settledPayments) * 100 : 0;
  const refundRate = totalPayments > 0 ? (totalRefunds / totalPayments) * 100 : 0;

  const failureCounts: Record<string, number> = {};
  for (const exec of recentExecutions) {
    const reason = exec.failureReason || "UNKNOWN";
    failureCounts[reason] = (failureCounts[reason] || 0) + 1;
  }

  const totalFailures = recentExecutions.length || 1;
  const failureBreakdown: FailureCategory[] = Object.entries(failureCounts).map(([category, count]) => ({
    category,
    count,
    percentage: Math.round((count / totalFailures) * 100),
  }));

  return {
    successRate: Math.round(successRate),
    failureRate: Math.round(failureRate),
    unknownCount: totalPayments - successfulPayments - failedPayments - totalRefunds,
    refundRate: Math.round(refundRate),
    totalPayments,
    successfulPayments,
    failedPayments,
    totalRefunds,
    failureBreakdown,
    webhookFailures,
    reconciliationBacklog,
  };
}
