import { prisma } from "@/lib/prisma";
import type { Agent, AgentInput, AgentContextData, AgentOutput, AgentProposalData } from "../types";
import { validateAgentOutput } from "../validator";

export const governanceAgent: Agent = {
  agentType: "GOVERNANCE",
  name: "Governance Agent",
  description: "Translates decisions into ActionRequests and invokes governance pipeline",

  async execute(input: AgentInput, context: AgentContextData): Promise<AgentOutput> {
    const { merchantId, data } = input;
    const evidence: string[] = [];
    const warnings: string[] = [];

    const decisionProposal = (data.proposals as Array<{
      title: string;
      description: string;
      confidence: number;
      riskLevel: string;
      financialImpact?: { amountMinor: number; currency: string };
      evidence?: string[];
    }>)?.[0];

    if (!decisionProposal) {
      return {
        agentType: "GOVERNANCE",
        agentRunId: input.agentRunId ?? "",
        status: "COMPLETED",
        confidence: 20,
        reasoningSummary: "No decision to govern",
        evidence: [],
        proposals: [],
        warnings: ["No decision proposal found"],
        outputData: { governanceResult: "NO_DECISION" },
        createdAt: new Date(),
      };
    }

    const riskScore = decisionProposal.riskLevel === "LOW" ? 20 : decisionProposal.riskLevel === "MEDIUM" ? 50 : 80;

    const actionRequest = await prisma.actionRequest.create({
      data: {
        merchantId,
        // No human requester — this originates from the growth-cycle agent, so
        // `requestedBy` is intentionally left null. See `ai-buyer/buyer.ts`.
        opportunityType: (data.opportunityType as string) ?? "UNKNOWN",
        strategyId: (data.strategyId as string) ?? "auto",
        strategyName: decisionProposal.title,
        recommendedScenario: "EXPECTED",
        decisionScore: decisionProposal.confidence,
        riskLevel: decisionProposal.riskLevel,
        confidence: decisionProposal.confidence,
        status: "PENDING",
        amountMinor: decisionProposal.financialImpact?.amountMinor ?? 0,
        evidence: JSON.stringify(decisionProposal.evidence ?? []),
      },
    });

    evidence.push(`Created ActionRequest: ${actionRequest.id}`);

    let governanceDecision: "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL" = "ALLOW";
    let decisionReason = "All governance checks passed";

    if (riskScore >= 70) {
      governanceDecision = "BLOCK";
      decisionReason = `Risk too high (${riskScore}/100)`;
    } else if (riskScore >= 40 || decisionProposal.confidence < 70) {
      governanceDecision = "REQUIRE_APPROVAL";
      decisionReason = `Requires approval: risk ${riskScore}/100, confidence ${decisionProposal.confidence}%`;
    }

    const healthCheck = await prisma.systemHealth.findFirst({
      orderBy: { lastCheckedAt: "desc" },
    });
    if (!healthCheck || healthCheck.application !== "ok" || healthCheck.api !== "ok") {
      governanceDecision = "BLOCK";
      decisionReason = "Emergency stop active";
    }

    const pausePolicy = await prisma.policy.findFirst({
      where: { merchantId, name: "AUTOMATION_PAUSED", isActive: true },
    });
    if (pausePolicy) {
      governanceDecision = "BLOCK";
      decisionReason = "Automation paused";
    }

    const governanceRecord = await prisma.governanceDecision.create({
      data: {
        merchantId,
        actionRequestId: actionRequest.id,
        decision: governanceDecision,
        decisionReason,
        riskLevel: decisionProposal.riskLevel,
        confidence: decisionProposal.confidence,
        status: governanceDecision === "BLOCK" ? "BLOCKED" : governanceDecision === "REQUIRE_APPROVAL" ? "PENDING" : "APPROVED",
        // Mirrors ActionRequest.requestedBy (null: agent-originated) so the
        // approve/reject routes can run the four-eyes check directly against
        // this row without re-joining the action request.
        requestedBy: null,
      },
    });

    evidence.push(`Governance decision: ${governanceDecision} (${governanceRecord.id})`);

    if (governanceDecision === "BLOCK") {
      warnings.push(`Governance BLOCKED: ${decisionReason}`);
    } else if (governanceDecision === "REQUIRE_APPROVAL") {
      warnings.push(`Governance requires approval: ${decisionReason}`);
    }

    return {
      agentType: "GOVERNANCE",
      agentRunId: input.agentRunId ?? "",
      status: "COMPLETED",
      confidence: decisionProposal.confidence,
      reasoningSummary: `Governance: ${governanceDecision}. ${decisionReason}`,
      evidence,
      proposals: [{
        proposalType: "GOVERNANCE",
        title: `Governance: ${governanceDecision}`,
        description: decisionReason,
        confidence: decisionProposal.confidence,
        riskLevel: decisionProposal.riskLevel,
        evidence: [governanceDecision, decisionReason, actionRequest.id, governanceRecord.id],
      }],
      warnings,
      outputData: {
        governanceDecision,
        actionRequestId: actionRequest.id,
        governanceDecisionId: governanceRecord.id,
        decisionReason,
      },
      createdAt: new Date(),
    };
  },

  validate(output: AgentOutput) {
    return validateAgentOutput(output);
  },
};
