import { prisma } from "@/lib/prisma";
import type { Agent, AgentInput, AgentContextData, AgentOutput, AgentProposalData } from "../types";
import { validateAgentOutput } from "../validator";
import { containsPromptInjection } from "../validator";

export const securityAgent: Agent = {
  agentType: "SECURITY",
  name: "Security Agent",
  description: "Validates proposals for security, merchant isolation, and prompt injection",

  async execute(input: AgentInput, context: AgentContextData): Promise<AgentOutput> {
    const { merchantId, data } = input;
    const warnings: string[] = [];
    const evidence: string[] = [];
    let blocked = false;

    const proposals = (data.proposals as Array<{
      title: string;
      description: string;
      financialImpact?: { amountMinor: number; currency: string };
      riskLevel: string;
    }>) ?? [];

    for (const proposal of proposals) {
      if (containsPromptInjection(proposal.title) || containsPromptInjection(proposal.description)) {
        blocked = true;
        evidence.push(`BLOCKED: Prompt injection detected in "${proposal.title}"`);
        warnings.push("Prompt injection attempt blocked");
      }
    }

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) {
      blocked = true;
      evidence.push("BLOCKED: Merchant not found");
    }

    if (merchant && merchant.status !== "ACTIVE") {
      blocked = true;
      evidence.push(`BLOCKED: Merchant status is ${merchant.status}`);
    }

    const recentExecutions = await prisma.execution.count({
      where: {
        merchantId,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentExecutions > 10) {
      warnings.push(`High execution velocity: ${recentExecutions} in last hour`);
    }

    const todaySpend = await prisma.execution.aggregate({
      where: {
        merchantId,
        status: { in: ["SUCCEEDED", "SUBMITTED", "PENDING"] },
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      _sum: { amountMinor: true },
    });
    const dailySpend = todaySpend._sum.amountMinor ?? 0;
    if (dailySpend > 1000000) {
      warnings.push(`High daily spend: ₹${Math.round(dailySpend / 100)}`);
    }

    for (const proposal of proposals) {
      const amount = proposal.financialImpact?.amountMinor ?? 0;
      if (amount > 500000) {
        warnings.push(`High value action: ₹${Math.round(amount / 100)} for "${proposal.title}"`);
      }
    }

    const existingActionRequests = await prisma.actionRequest.findMany({
      where: {
        merchantId,
        status: { in: ["PENDING", "APPROVED"] },
      },
    });
    const duplicateRisk = existingActionRequests.some((ar) =>
      proposals.some((p) => p.title.toLowerCase().includes(ar.strategyId.toLowerCase()))
    );
    if (duplicateRisk) {
      warnings.push("Similar action already pending/approved");
    }

    const securityScore = blocked ? 0 : Math.max(100 - warnings.length * 15, 20);

    return {
      agentType: "SECURITY",
      agentRunId: input.agentRunId ?? "",
      status: blocked ? "BLOCKED" : "COMPLETED",
      confidence: securityScore,
      reasoningSummary: blocked
        ? "Security check BLOCKED: critical violations detected"
        : `Security check passed (score: ${securityScore}) with ${warnings.length} warnings`,
      evidence,
      proposals: proposals.map((p) => ({
        proposalType: "SECURITY",
        title: `Security: ${p.title}`,
        description: blocked ? "BLOCKED by security" : "Passed security check",
        confidence: securityScore,
        riskLevel: blocked ? "HIGH" : "LOW",
      })),
      warnings,
      outputData: { securityScore, blocked },
      createdAt: new Date(),
    };
  },

  validate(output: AgentOutput) {
    return validateAgentOutput(output);
  },
};
