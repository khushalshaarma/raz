import { prisma } from "@/lib/prisma";
import { normalizeMerchantOverview } from "@/lib/product/overview-contract";
import {
  PAYMENT_SUCCESS_STATUSES,
  PAYMENT_FAILURE_STATUSES,
  countByCanonicalStatus,
  totalStatusCount,
} from "@/lib/product/payment-status";
import type {
  MerchantOverview,
  MetricSummary,
  AgentActivity,
  RiskAlert,
} from "@/lib/product/overview-contract";

export type { MerchantOverview, MetricSummary, AgentActivity, RiskAlert };

function formatCurrency(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(2)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export async function getMerchantOverview(merchantId: string): Promise<MerchantOverview> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [
    recentOrders,
    previousOrders,
    recentRevenue,
    previousRevenue,
    totalCustomers,
    recentCustomers,
    paymentStatusGroups,
    activeOpportunities,
    pendingApprovals,
    recentExecutions,
    successfulExecutions,
    totalAgentRuns,
    completedAgentRuns,
    failedAgentRuns,
    lastAgentRun,
    emergencyStop,
    automationPaused,
    recentGovernanceBlocks,
  ] = await Promise.all([
    prisma.order.count({ where: { merchantId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.order.count({ where: { merchantId, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    prisma.order.aggregate({ where: { merchantId, createdAt: { gte: thirtyDaysAgo } }, _sum: { totalMinor: true } }),
    prisma.order.aggregate({ where: { merchantId, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } }, _sum: { totalMinor: true } }),
    prisma.customer.count({ where: { merchantId } }),
    prisma.customer.count({ where: { merchantId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.payment.groupBy({
      by: ["status"],
      where: { merchantId, createdAt: { gte: thirtyDaysAgo } },
      _count: { _all: true },
    }),
    prisma.opportunity.count({ where: { merchantId, status: { in: ["DETECTED", "REVIEWING"] } } }),
    prisma.actionRequest.count({ where: { merchantId, status: "PENDING" } }),
    prisma.execution.count({ where: { merchantId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.execution.count({ where: { merchantId, createdAt: { gte: thirtyDaysAgo }, status: "SUCCEEDED" } }),
    prisma.agentRun.count({ where: { merchantId, startedAt: { gte: thirtyDaysAgo } } }),
    prisma.agentRun.count({ where: { merchantId, startedAt: { gte: thirtyDaysAgo }, status: "COMPLETED" } }),
    prisma.agentRun.count({ where: { merchantId, startedAt: { gte: thirtyDaysAgo }, status: "FAILED" } }),
    prisma.agentRun.findFirst({ where: { merchantId }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    prisma.systemHealth.findFirst({ orderBy: { lastCheckedAt: "desc" }, select: { api: true } }),
    prisma.policy.findFirst({ where: { merchantId, name: "AUTOMATION_PAUSED", isActive: true }, select: { id: true } }),
    // `GovernanceDecision.decision` is a free-form String with no enforced
    // vocabulary, and writers disagree: `lib/agents/agents/governance-agent.ts`
    // writes "BLOCK", while other paths write "BLOCKED". This query previously
    // used "BLOCKED" only, so the governance block alert could not fire for
    // decisions produced by the governance agent. Match both the decision and
    // the status so no real block is missed.
    prisma.governanceDecision.count({
      where: {
        merchantId,
        createdAt: { gte: thirtyDaysAgo },
        OR: [
          { decision: { in: ["BLOCK", "BLOCKED"] } },
          { status: "BLOCKED" },
        ],
      },
    }),
  ]);

  const paymentStatusCounts: Record<string, number> = {};
  for (const group of paymentStatusGroups) {
    paymentStatusCounts[group.status] = group._count._all;
  }
  const recentPayments = totalStatusCount(paymentStatusCounts);
  const successfulPayments = countByCanonicalStatus(paymentStatusCounts, PAYMENT_SUCCESS_STATUSES);
  const failedPayments = countByCanonicalStatus(paymentStatusCounts, PAYMENT_FAILURE_STATUSES);
  // Only settled payments count toward the rate; in-flight payments have not
  // failed. See the note in `getPaymentHealth`.
  const settledPayments = successfulPayments + failedPayments;

  const currentRevenue = recentRevenue._sum.totalMinor || 0;
  const previousRevenueVal = previousRevenue._sum.totalMinor || 0;
  const revenueComparison = previousRevenueVal > 0 ? ((currentRevenue - previousRevenueVal) / previousRevenueVal) * 100 : 0;

  const orderComparison = previousOrders > 0 ? ((recentOrders - previousOrders) / previousOrders) * 100 : 0;

  const currentAOV = recentOrders > 0 ? currentRevenue / recentOrders : 0;
  const previousAOV = previousOrders > 0 ? (previousRevenueVal) / previousOrders : 0;
  const aovComparison = previousAOV > 0 ? ((currentAOV - previousAOV) / previousAOV) * 100 : 0;

  const repeatCustomers = totalCustomers > 0 ? totalCustomers - recentCustomers : 0;
  const repeatRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;

  const paymentSuccessRate = settledPayments > 0 ? (successfulPayments / settledPayments) * 100 : 100;

  const riskAlerts: RiskAlert[] = [];
  if (emergencyStop?.api === "STOPPED") {
    riskAlerts.push({ type: "EMERGENCY_STOP", message: "Emergency stop is active", severity: "HIGH", timestamp: now.toISOString() });
  }
  if (automationPaused) {
    riskAlerts.push({ type: "AUTOMATION_PAUSED", message: "Automation is paused", severity: "MEDIUM", timestamp: now.toISOString() });
  }
  if (recentGovernanceBlocks > 0) {
    riskAlerts.push({ type: "GOVERNANCE_BLOCK", message: `${recentGovernanceBlocks} actions blocked by governance`, severity: "MEDIUM", timestamp: now.toISOString() });
  }
  if (recentPayments > 0 && paymentSuccessRate < 80) {
    riskAlerts.push({ type: "PAYMENT_FAILURE", message: `Payment success rate is ${paymentSuccessRate.toFixed(0)}%`, severity: "HIGH", timestamp: now.toISOString() });
  }

  const payload = {
    revenue: {
      value: currentRevenue,
      formattedValue: formatCurrency(currentRevenue),
      period: "Last 30 days",
      comparison: revenueComparison,
      trend: revenueComparison > 0 ? "UP" : revenueComparison < 0 ? "DOWN" : "FLAT",
      source: recentOrders > 0 ? "REAL" : "INSUFFICIENT_DATA",
    },
    orders: {
      value: recentOrders,
      formattedValue: recentOrders.toLocaleString("en-IN"),
      period: "Last 30 days",
      comparison: orderComparison,
      trend: orderComparison > 0 ? "UP" : orderComparison < 0 ? "DOWN" : "FLAT",
      source: "REAL",
    },
    customers: {
      value: totalCustomers,
      formattedValue: totalCustomers.toLocaleString("en-IN"),
      period: "Total",
      comparison: totalCustomers > 0 ? (recentCustomers / totalCustomers) * 100 : 0,
      trend: recentCustomers > 0 ? "UP" : "FLAT",
      source: "REAL",
    },
    conversion: {
      value: recentOrders > 0 && totalCustomers > 0 ? (recentOrders / totalCustomers) * 100 : 0,
      formattedValue: `${(recentOrders > 0 && totalCustomers > 0 ? (recentOrders / totalCustomers) * 100 : 0).toFixed(1)}%`,
      period: "Last 30 days",
      comparison: 0,
      trend: "FLAT",
      source: totalCustomers > 0 ? "REAL" : "INSUFFICIENT_DATA",
    },
    averageOrderValue: {
      value: Math.round(currentAOV),
      formattedValue: formatCurrency(Math.round(currentAOV)),
      period: "Last 30 days",
      comparison: aovComparison,
      trend: aovComparison > 0 ? "UP" : aovComparison < 0 ? "DOWN" : "FLAT",
      source: recentOrders > 0 ? "REAL" : "INSUFFICIENT_DATA",
    },
    repeatCustomerRate: {
      value: Math.round(repeatRate),
      formattedValue: `${Math.round(repeatRate)}%`,
      period: "All time",
      comparison: 0,
      trend: "FLAT",
      source: totalCustomers > 0 ? "REAL" : "INSUFFICIENT_DATA",
    },
    paymentSuccessRate: {
      value: Math.round(paymentSuccessRate),
      formattedValue: `${Math.round(paymentSuccessRate)}%`,
      period: "Last 30 days",
      comparison: 0,
      trend: paymentSuccessRate >= 90 ? "UP" : "DOWN",
      // Only meaningful once at least one payment has actually settled.
      source: settledPayments > 0 ? "REAL" : "INSUFFICIENT_DATA",
    },
    growthOpportunities: activeOpportunities,
    activeStrategies: activeOpportunities,
    pendingApprovals,
    recentExecutions,
    agentActivity: {
      totalRuns: totalAgentRuns,
      completedRuns: completedAgentRuns,
      failedRuns: failedAgentRuns,
      lastRunAt: lastAgentRun?.startedAt?.toISOString() || null,
      successRate: totalAgentRuns > 0 ? (completedAgentRuns / totalAgentRuns) * 100 : 0,
    },
    riskAlerts,
    // Every agent-run count above is scoped to `merchantId`, so merchant
    // isolation is preserved.
  };

  // Normalize at the source so callers always receive the documented contract
  // with every field present — a merchant with zero agent runs yields
  // legitimate zeros, never `undefined`.
  return normalizeMerchantOverview(payload);
}
