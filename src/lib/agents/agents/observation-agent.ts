import { prisma } from "@/lib/prisma";
import type { Agent, AgentInput, AgentContextData, AgentOutput, AgentProposalData } from "../types";
import { validateAgentOutput } from "../validator";

export const observationAgent: Agent = {
  agentType: "OBSERVATION",
  name: "Observation Agent",
  description: "Observes actual outcomes and compares predicted vs actual",

  async execute(input: AgentInput, context: AgentContextData): Promise<AgentOutput> {
    const { merchantId, data } = input;
    const evidence: string[] = [];

    const executionId = data.executionId as string | undefined;

    if (!executionId) {
      return {
        agentType: "OBSERVATION",
        agentRunId: input.agentRunId ?? "",
        status: "COMPLETED",
        confidence: 50,
        reasoningSummary: "No execution to observe",
        evidence: [],
        proposals: [],
        warnings: [],
        outputData: { observed: false },
        createdAt: new Date(),
      };
    }

    const execution = await prisma.execution.findUnique({
      where: { id: executionId },
      include: { reconciliation: true, executionAttempts: true },
    });

    if (!execution) {
      return {
        agentType: "OBSERVATION",
        agentRunId: input.agentRunId ?? "",
        status: "COMPLETED",
        confidence: 0,
        reasoningSummary: "Execution not found",
        evidence: [],
        proposals: [],
        warnings: ["Execution not found"],
        outputData: { observed: false, error: "NOT_FOUND" },
        createdAt: new Date(),
      };
    }

    const predictedMinor = execution.amountMinor;
    const actualMinor = execution.status === "SUCCEEDED" ? execution.amountMinor : 0;
    const outcome = execution.status === "SUCCEEDED" ? "SUCCESS" : execution.status === "FAILED" ? "FAILED" : "PENDING";

    evidence.push(`Execution ${executionId}: ${execution.status}`);
    evidence.push(`Predicted: ₹${Math.round(predictedMinor / 100)}, Actual: ₹${Math.round(actualMinor / 100)}`);

    if (execution.reconciliation) {
      evidence.push(`Reconciliation: ${execution.reconciliation.status}`);
      if (execution.reconciliation.mismatchReason) {
        evidence.push(`Mismatch: ${execution.reconciliation.mismatchReason}`);
      }
    }

    const proposals: AgentProposalData[] = [{
      proposalType: "OBSERVATION",
      title: `Observation: ${outcome}`,
      description: `Execution ${executionId} resulted in ${outcome}. Status: ${execution.status}`,
      confidence: execution.status === "SUCCEEDED" || execution.status === "FAILED" ? 95 : 50,
      riskLevel: "LOW",
      financialImpact: { amountMinor: actualMinor, currency: execution.currency },
      evidence,
    }];

    return {
      agentType: "OBSERVATION",
      agentRunId: input.agentRunId ?? "",
      status: "COMPLETED",
      confidence: 90,
      reasoningSummary: `Observed execution ${executionId}: ${outcome}`,
      evidence,
      proposals,
      warnings: [],
      outputData: {
        executionId,
        status: execution.status,
        predictedMinor,
        actualMinor,
        outcome,
        reconciliationStatus: execution.reconciliation?.status ?? "N/A",
      },
      createdAt: new Date(),
    };
  },

  validate(output: AgentOutput) {
    return validateAgentOutput(output);
  },
};
