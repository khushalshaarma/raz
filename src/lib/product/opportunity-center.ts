import { prisma } from "@/lib/prisma";
import { formatINR, formatRelativeTime, formatConfidencePercent } from "./format";

export type OpportunityWithType = {
  id: string;
  merchantId: string;
  title: string;
  description: string;
  type: string;
  estimatedRevenueMinor: number;
  confidence: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  formattedRevenue: string;
  typeLabel: string;
  statusLabel: string;
  statusColor: string;
  daysOpen: number;
  isExpiringSoon: boolean;
  expiresInDays: number | null;
  relatedActions: { id: string; status: string; strategyName: string | null }[];
};

export type OpportunityDetail = OpportunityWithType & {
  evidence: string;
  actionCount: number;
  lastActivity: Date | null;
  timeline: { timestamp: Date; event: string; detail: string }[];
};

export const TYPE_LABELS: Record<string, string> = {
  INACTIVE_CUSTOMERS: "Inactive Customers",
  CART_ABANDONMENT: "Cart Abandonment",
  UPSELL: "Upsell",
  CROSS_SELL: "Cross-Sell",
  LOW_CONVERSION: "Low Conversion",
  PAYMENT_RECOVERY: "Payment Recovery",
  HIGH_VALUE_CUSTOMER: "High Value Customer",
};

export const STATUS_LABELS: Record<string, string> = {
  DETECTED: "New",
  REVIEWING: "In Review",
  ACTIONED: "Actioned",
  DISMISSED: "Dismissed",
  EXPIRED: "Expired",
};

export const STATUS_COLORS: Record<string, string> = {
  DETECTED: "blue",
  REVIEWING: "yellow",
  ACTIONED: "green",
  DISMISSED: "gray",
  EXPIRED: "red",
};

const OPPORTUNITY_EXPIRY_DAYS = 30;

function enrichOpportunity(opp: {
  id: string;
  merchantId: string;
  title: string;
  description: string;
  type: string;
  estimatedRevenueMinor: number;
  confidence: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): OpportunityWithType {
  const now = new Date();
  const daysOpen = Math.floor(
    (now.getTime() - opp.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  const createdAtMs = opp.createdAt.getTime();
  const expiryMs = createdAtMs + OPPORTUNITY_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const expiresInDays = Math.max(
    0,
    Math.floor((expiryMs - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  return {
    ...opp,
    formattedRevenue: formatINR(opp.estimatedRevenueMinor),
    typeLabel: TYPE_LABELS[opp.type] || opp.type,
    statusLabel: STATUS_LABELS[opp.status] || opp.status,
    statusColor: STATUS_COLORS[opp.status] || "gray",
    daysOpen,
    isExpiringSoon: expiresInDays <= 7 && opp.status !== "EXPIRED",
    expiresInDays: opp.status === "EXPIRED" ? null : expiresInDays,
    relatedActions: [],
  };
}

export async function getMerchantOpportunities(
  merchantId: string,
  options?: { status?: string; type?: string; limit?: number }
): Promise<OpportunityWithType[]> {
  const where: Record<string, unknown> = { merchantId };
  if (options?.status) where.status = options.status;
  if (options?.type) where.type = options.type;

  const opportunities = await prisma.opportunity.findMany({
    where,
    orderBy: [{ estimatedRevenueMinor: "desc" }, { createdAt: "desc" }],
    take: options?.limit ?? 50,
  });

  const enriched = opportunities.map(enrichOpportunity);

  // Fetch related action requests. `merchantId` is required here: without it
  // the `opportunityType` filter would also match other merchants' action
  // requests and leak their strategy names and statuses.
  const actionRequests = await prisma.actionRequest.findMany({
    where: {
      merchantId,
      opportunityType: { in: opportunities.map((o) => o.type) },
    },
    select: { id: true, status: true, strategyName: true, opportunityType: true },
  });

  return enriched.map((opp) => ({
    ...opp,
    relatedActions: actionRequests
      .filter((a) => a.opportunityType === opp.type)
      .map((a) => ({ id: a.id, status: a.status, strategyName: a.strategyName })),
  }));
}

export async function getOpportunityDetail(
  merchantId: string,
  opportunityId: string
): Promise<OpportunityDetail | null> {
  const opp = await prisma.opportunity.findFirst({
    where: { id: opportunityId, merchantId },
  });
  if (!opp) return null;

  const enriched = enrichOpportunity(opp);

  // The opportunity itself is merchant-scoped, but the related action
  // requests must be scoped independently — `opportunityType` alone is not
  // unique to this merchant and would leak other merchants' strategies,
  // reasons and evidence into this detail view.
  const actionRequests = await prisma.actionRequest.findMany({
    where: { merchantId, opportunityType: opp.type },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      strategyName: true,
      reason: true,
      evidence: true,
      createdAt: true,
    },
  });

  const lastActivity =
    actionRequests.length > 0 ? actionRequests[0].createdAt : null;

  const timeline = [
    {
      timestamp: opp.createdAt,
      event: "Opportunity Detected",
      detail: `${enriched.typeLabel} opportunity identified with ${formatConfidencePercent(opp.confidence)} confidence`,
    },
    ...actionRequests.map((ar) => ({
      timestamp: ar.createdAt,
      event: `Action ${ar.status}`,
      detail: ar.strategyName
        ? `Strategy "${ar.strategyName}" — ${ar.status}`
        : ar.reason || `Status: ${ar.status}`,
    })),
  ].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  return {
    ...enriched,
    evidence: actionRequests.find((ar) => ar.evidence)?.evidence || "",
    actionCount: actionRequests.length,
    lastActivity,
    timeline,
    relatedActions: actionRequests.map((ar) => ({
      id: ar.id,
      status: ar.status,
      strategyName: ar.strategyName,
    })),
  };
}

export async function transitionOpportunityStatus(
  merchantId: string,
  opportunityId: string,
  newStatus: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const validTransitions: Record<string, string[]> = {
    DETECTED: ["REVIEWING", "DISMISSED"],
    REVIEWING: ["ACTIONED", "DISMISSED"],
    ACTIONED: [],
    DISMISSED: [],
    EXPIRED: [],
  };

  const opp = await prisma.opportunity.findFirst({
    where: { id: opportunityId, merchantId },
  });
  if (!opp) return { success: false, error: "Opportunity not found" };

  const allowed = validTransitions[opp.status] || [];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot transition from ${opp.status} to ${newStatus}`,
    };
  }

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { status: newStatus, updatedAt: new Date() },
  });

  return { success: true };
}

export async function getOpportunityStats(merchantId: string) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [total, byStatus, byType, recentCount, recentRevenue] =
    await Promise.all([
      prisma.opportunity.count({ where: { merchantId } }),
      prisma.opportunity.groupBy({
        by: ["status"],
        where: { merchantId },
        _count: true,
        _sum: { estimatedRevenueMinor: true },
      }),
      prisma.opportunity.groupBy({
        by: ["type"],
        where: { merchantId },
        _count: true,
        _sum: { estimatedRevenueMinor: true },
      }),
      prisma.opportunity.count({
        where: { merchantId, createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.opportunity.aggregate({
        where: { merchantId, status: "ACTIONED", updatedAt: { gte: thirtyDaysAgo } },
        _sum: { estimatedRevenueMinor: true },
      }),
    ]);

  return {
    total,
    recentCount,
    actionedRevenue30d: recentRevenue._sum.estimatedRevenueMinor || 0,
    formattedActionedRevenue30d: formatINR(
      recentRevenue._sum.estimatedRevenueMinor || 0
    ),
    byStatus: byStatus.map((s) => ({
      status: s.status,
      label: STATUS_LABELS[s.status] || s.status,
      color: STATUS_COLORS[s.status] || "gray",
      count: s._count,
      totalRevenue: s._sum.estimatedRevenueMinor || 0,
      formattedRevenue: formatINR(s._sum.estimatedRevenueMinor || 0),
    })),
    byType: byType.map((t) => ({
      type: t.type,
      label: TYPE_LABELS[t.type] || t.type,
      count: t._count,
      totalRevenue: t._sum.estimatedRevenueMinor || 0,
      formattedRevenue: formatINR(t._sum.estimatedRevenueMinor || 0),
    })),
  };
}
