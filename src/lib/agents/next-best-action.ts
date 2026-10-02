import { prisma } from "@/lib/prisma";
import type { NextBestAction } from "./types";

export async function getNextBestAction(merchantId: string): Promise<NextBestAction | null> {
  const recentProposals = await prisma.agentProposal.findMany({
    where: {
      merchantId,
      status: "PROPOSED",
      proposalType: { in: ["OPPORTUNITY", "STRATEGY", "DECISION"] },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (recentProposals.length === 0) return null;

  const ranked = recentProposals
    .map((p) => {
      const financial = p.financialImpact ? JSON.parse(p.financialImpact) as { amountMinor?: number; currency?: string } : null;
      const impactScore = (financial?.amountMinor ?? 0) / 10000;
      const confidenceScore = p.confidence;
      const riskMultiplier = p.riskLevel === "LOW" ? 1.0 : p.riskLevel === "MEDIUM" ? 0.7 : 0.4;
      const score = (impactScore * 0.3 + confidenceScore * 0.4 + (100 - (p.riskLevel === "LOW" ? 20 : p.riskLevel === "MEDIUM" ? 50 : 80)) * 0.3) * riskMultiplier;
      return { ...p, score, financial };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 10) return null;

  const requiresApproval = best.confidence < 70 || best.riskLevel === "HIGH" ||
    (best.financial?.amountMinor ?? 0) > 10000;

  return {
    id: best.id,
    merchantId,
    actionType: best.proposalType,
    title: best.title,
    why: best.description,
    expectedImpact: {
      revenueMinor: best.financial?.amountMinor ?? 0,
      costMinor: Math.round((best.financial?.amountMinor ?? 0) * 0.15),
      netImpactMinor: Math.round((best.financial?.amountMinor ?? 0) * 0.85),
      roi: best.financial?.amountMinor ? Math.round(((best.financial.amountMinor * 0.85) / Math.max(best.financial.amountMinor * 0.15, 1)) * 100) / 100 : 0,
    },
    confidence: best.confidence,
    riskLevel: best.riskLevel,
    requiredApproval: requiresApproval,
    evidence: best.evidence ? JSON.parse(best.evidence) as string[] : [],
    proposedAt: best.createdAt,
  };
}

export async function getExplainability(
  merchantId: string,
  proposalId: string
): Promise<{
  what: string;
  why: string;
  expectedResult: string;
  risk: string;
  confidence: string;
  evidence: string[];
  nextStep: string;
} | null> {
  const proposal = await prisma.agentProposal.findUnique({
    where: { id: proposalId },
  });

  if (!proposal || proposal.merchantId !== merchantId) return null;

  const financial = proposal.financialImpact
    ? JSON.parse(proposal.financialImpact) as { amountMinor?: number; currency?: string }
    : null;

  return {
    what: proposal.title,
    why: proposal.description,
    expectedResult: financial?.amountMinor
      ? `₹${Math.round(financial.amountMinor / 100)} projected revenue`
      : "Revenue impact to be determined",
    risk: `Risk level: ${proposal.riskLevel}`,
    confidence: `Confidence: ${proposal.confidence}%`,
    evidence: proposal.evidence ? JSON.parse(proposal.evidence) as string[] : [],
    nextStep: proposal.status === "PROPOSED"
      ? "Awaiting validation and governance review"
      : `Current status: ${proposal.status}`,
  };
}
