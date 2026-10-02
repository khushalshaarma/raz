import { prisma } from "@/lib/prisma";

export interface GrowthScoreResult {
  growthScore: number;
  growthLevel: "EXCELLENT" | "HEALTHY" | "WATCH" | "AT_RISK" | "CRITICAL";
  dimensions: GrowthDimension[];
  evidence: string[];
}

export interface GrowthDimension {
  name: string;
  score: number;
  weight: number;
  evidence: string;
  trend: "IMPROVING" | "STABLE" | "DECLINING";
}

function getGrowthLevel(score: number): GrowthScoreResult["growthLevel"] {
  if (score >= 80) return "EXCELLENT";
  if (score >= 60) return "HEALTHY";
  if (score >= 40) return "WATCH";
  if (score >= 20) return "AT_RISK";
  return "CRITICAL";
}

function getLevelColor(level: string): string {
  switch (level) {
    case "EXCELLENT": return "#22c55e";
    case "HEALTHY": return "#22c55e";
    case "WATCH": return "#eab308";
    case "AT_RISK": return "#f97316";
    case "CRITICAL": return "#ef4444";
    default: return "#6b7280";
  }
}

export async function calculateGrowthScore(merchantId: string): Promise<GrowthScoreResult> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const [
    totalOrders,
    recentOrders,
    previousOrders,
    totalCustomers,
    recentCustomers,
    totalRevenue,
    recentRevenue,
    previousRevenue,
    activeOpportunities,
    pendingApprovals,
    recentExecutions,
    successfulExecutions,
  ] = await Promise.all([
    prisma.order.count({ where: { merchantId } }),
    prisma.order.count({ where: { merchantId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.order.count({ where: { merchantId, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    prisma.customer.count({ where: { merchantId } }),
    prisma.customer.count({ where: { merchantId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.order.aggregate({ where: { merchantId }, _sum: { totalMinor: true } }),
    prisma.order.aggregate({ where: { merchantId, createdAt: { gte: thirtyDaysAgo } }, _sum: { totalMinor: true } }),
    prisma.order.aggregate({ where: { merchantId, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } }, _sum: { totalMinor: true } }),
    prisma.opportunity.count({ where: { merchantId, status: { in: ["DETECTED", "REVIEWING"] } } }),
    prisma.actionRequest.count({ where: { merchantId, status: "PENDING" } }),
    prisma.execution.count({ where: { merchantId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.execution.count({ where: { merchantId, createdAt: { gte: thirtyDaysAgo }, status: "SUCCEEDED" } }),
  ]);

  const currentRevenue = recentRevenue._sum.totalMinor || 0;
  const previousRevenueVal = previousRevenue._sum.totalMinor || 0;
  const totalRevenueVal = totalRevenue._sum.totalMinor || 0;

  const dimensions: GrowthDimension[] = [];
  const evidence: string[] = [];

  const revenueScore = previousRevenueVal > 0
    ? Math.min(100, Math.max(0, 50 + ((currentRevenue - previousRevenueVal) / Math.max(previousRevenueVal, 1)) * 100))
    : currentRevenue > 0 ? 60 : 0;
  const revenueTrend = currentRevenue > previousRevenueVal ? "IMPROVING" : currentRevenue < previousRevenueVal ? "DECLINING" : "STABLE";
  dimensions.push({
    name: "Revenue Health",
    score: Math.round(revenueScore),
    weight: 0.30,
    evidence: previousRevenueVal > 0
      ? `₹${(currentRevenue / 100).toLocaleString("en-IN")} vs ₹${(previousRevenueVal / 100).toLocaleString("en-IN")} previous period`
      : `Total revenue: ₹${(totalRevenueVal / 100).toLocaleString("en-IN")}`,
    trend: revenueTrend,
  });
  if (revenueTrend === "IMPROVING") evidence.push("Revenue is growing");
  if (revenueTrend === "DECLINING") evidence.push("Revenue has declined vs previous period");

  const orderGrowth = previousOrders > 0
    ? ((recentOrders - previousOrders) / previousOrders) * 100
    : recentOrders > 0 ? 20 : 0;
  const orderScore = Math.min(100, Math.max(0, 50 + orderGrowth));
  const orderTrend = recentOrders > previousOrders ? "IMPROVING" : recentOrders < previousOrders ? "DECLINING" : "STABLE";
  dimensions.push({
    name: "Order Health",
    score: Math.round(orderScore),
    weight: 0.25,
    evidence: `${recentOrders} orders this period vs ${previousOrders} previous`,
    trend: orderTrend,
  });

  const customerGrowth = totalCustomers > 0 ? (recentCustomers / totalCustomers) * 100 : 0;
  const customerScore = Math.min(100, Math.max(0, customerGrowth > 10 ? 70 + customerGrowth : customerGrowth > 5 ? 50 + customerGrowth : customerGrowth * 5));
  dimensions.push({
    name: "Customer Growth",
    score: Math.round(customerScore),
    weight: 0.20,
    evidence: `${recentCustomers} new customers out of ${totalCustomers} total`,
    trend: customerGrowth > 5 ? "IMPROVING" : customerGrowth > 0 ? "STABLE" : "DECLINING",
  });

  const paymentSuccessRate = recentExecutions > 0 ? (successfulExecutions / recentExecutions) * 100 : 100;
  const paymentScore = Math.round(paymentSuccessRate);
  dimensions.push({
    name: "Payment Health",
    score: paymentScore,
    weight: 0.15,
    evidence: `${successfulExecutions}/${recentExecutions} executions succeeded (${paymentSuccessRate.toFixed(0)}%)`,
    trend: paymentSuccessRate >= 90 ? "STABLE" : "DECLINING",
  });

  const opportunityScore = activeOpportunities > 3 ? 80 : activeOpportunities > 0 ? 60 : 30;
  dimensions.push({
    name: "Growth Opportunity",
    score: opportunityScore,
    weight: 0.10,
    evidence: `${activeOpportunities} active opportunities detected`,
    trend: activeOpportunities > 0 ? "IMPROVING" : "STABLE",
  });

  const governanceScore = pendingApprovals > 5 ? 40 : pendingApprovals > 0 ? 60 : 80;
  dimensions.push({
    name: "Governance",
    score: governanceScore,
    weight: 0.05,
    evidence: `${pendingApprovals} pending approvals`,
    trend: pendingApprovals === 0 ? "STABLE" : "DECLINING",
  });

  let growthScore = 0;
  for (const dim of dimensions) {
    growthScore += dim.score * dim.weight;
  }
  growthScore = Math.round(Math.max(0, Math.min(100, growthScore)));

  return {
    growthScore,
    growthLevel: getGrowthLevel(growthScore),
    dimensions,
    evidence,
  };
}
