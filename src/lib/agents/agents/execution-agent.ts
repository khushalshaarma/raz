import { prisma } from "@/lib/prisma";
import type { Agent, AgentInput, AgentContextData, AgentOutput, AgentProposalData } from "../types";
import { validateAgentOutput } from "../validator";

export const executionAgent: Agent = {
  agentType: "EXECUTION",
  name: "Execution Agent",
  description: "Executes governance-approved actions through the execution service",

  async execute(input: AgentInput, context: AgentContextData): Promise<AgentOutput> {
    const { merchantId, data } = input;
    const evidence: string[] = [];
    const warnings: string[] = [];

    const governanceResult = data.governanceDecision as string | undefined;
    const actionRequestId = data.actionRequestId as string | undefined;
    const governanceDecisionId = data.governanceDecisionId as string | undefined;

    if (governanceResult !== "ALLOW") {
      return {
        agentType: "EXECUTION",
        agentRunId: input.agentRunId ?? "",
        status: "COMPLETED",
        confidence: 100,
        reasoningSummary: `Execution skipped: governance result is ${governanceResult}`,
        evidence: [`Governance decision: ${governanceResult}`],
        proposals: [],
        warnings: [],
        outputData: { executed: false, reason: governanceResult },
        createdAt: new Date(),
      };
    }

    if (!actionRequestId || !governanceDecisionId) {
      return {
        agentType: "EXECUTION",
        agentRunId: input.agentRunId ?? "",
        status: "FAILED",
        confidence: 0,
        reasoningSummary: "Missing actionRequestId or governanceDecisionId",
        evidence: [],
        proposals: [],
        warnings: ["Missing required identifiers"],
        outputData: { executed: false, error: "MISSING_IDS" },
        createdAt: new Date(),
      };
    }

    const actionRequest = await prisma.actionRequest.findUnique({
      where: { id: actionRequestId },
    });
    if (!actionRequest) {
      return {
        agentType: "EXECUTION",
        agentRunId: input.agentRunId ?? "",
        status: "FAILED",
        confidence: 0,
        reasoningSummary: "ActionRequest not found",
        evidence: [],
        proposals: [],
        warnings: ["ActionRequest not found"],
        outputData: { executed: false, error: "NOT_FOUND" },
        createdAt: new Date(),
      };
    }

    const execution = await prisma.execution.create({
      data: {
        merchantId,
        governanceDecisionId,
        actionRequestId,
        actionType: actionRequest.opportunityType,
        strategyId: actionRequest.strategyId,
        amountMinor: actionRequest.amountMinor,
        currency: actionRequest.currency,
        status: "CREATED",
      },
    });

    evidence.push(`Created execution: ${execution.id}`);

    let executionStatus = "CREATED";

    try {
      const latestHealth = await prisma.systemHealth.findFirst({
        orderBy: { lastCheckedAt: "desc" },
      });
      if (!latestHealth || latestHealth.application !== "ok" || latestHealth.api !== "ok") {
        executionStatus = "BLOCKED";
        evidence.push("Emergency stop active - execution blocked");
      } else {
        executionStatus = "PREFLIGHT_PASSED";
        evidence.push("Preflight checks passed");

        await prisma.execution.update({
          where: { id: execution.id },
          data: { status: "READY" },
        });
        executionStatus = "READY";
      }
    } catch (error) {
      executionStatus = "FAILED";
      evidence.push(`Execution error: ${error instanceof Error ? error.message : "unknown"}`);
      warnings.push("Execution failed during preflight");
    }

    return {
      agentType: "EXECUTION",
      agentRunId: input.agentRunId ?? "",
      status: executionStatus === "FAILED" ? "FAILED" : "COMPLETED",
      confidence: executionStatus === "READY" ? 95 : executionStatus === "BLOCKED" ? 100 : 0,
      reasoningSummary: `Execution ${executionStatus}: ${execution.id}`,
      evidence,
      proposals: [{
        proposalType: "EXECUTION",
        title: `Execution: ${executionStatus}`,
        description: `Execution ${execution.id} status: ${executionStatus}`,
        confidence: executionStatus === "READY" ? 95 : 0,
        riskLevel: executionStatus === "READY" ? "LOW" : "HIGH",
        financialImpact: { amountMinor: actionRequest.amountMinor, currency: actionRequest.currency },
        evidence: [execution.id, executionStatus],
      }],
      warnings,
      outputData: {
        executionId: execution.id,
        executionStatus,
        amountMinor: actionRequest.amountMinor,
      },
      createdAt: new Date(),
    };
  },

  validate(output: AgentOutput) {
    return validateAgentOutput(output);
  },
};
