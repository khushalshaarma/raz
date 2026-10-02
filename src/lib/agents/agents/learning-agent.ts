import { prisma } from "@/lib/prisma";
import type { Agent, AgentInput, AgentContextData, AgentOutput, AgentProposalData } from "../types";
import { validateAgentOutput } from "../validator";
import { recordStrategyPerformance, recordPredictionAccuracy } from "../memory/long-term";
import { storeExperiment, updateExperiment } from "../memory/experiment-memory";

export const learningAgent: Agent = {
  agentType: "LEARNING",
  name: "Learning Agent",
  description: "Records outcomes and updates learning memory for future improvements",

  async execute(input: AgentInput, context: AgentContextData): Promise<AgentOutput> {
    const { merchantId, data } = input;
    const evidence: string[] = [];

    const executionId = data.executionId as string | undefined;
    const predictedMinor = (data.predictedMinor as number) ?? 0;
    const actualMinor = (data.actualMinor as number) ?? 0;
    const strategyType = (data.strategyType as string) ?? "UNKNOWN";
    const outcome = (data.outcome as string) ?? "UNKNOWN";

    if (executionId) {
      const execution = await prisma.execution.findUnique({
        where: { id: executionId },
      });

      if (execution) {
        const absError = Math.abs(predictedMinor - actualMinor);
        const pctError = predictedMinor > 0 ? (absError / predictedMinor) * 100 : 0;
        const correct = pctError < 20;

        evidence.push(`Prediction error: ${absError} paise (${Math.round(pctError)}%)`);
        evidence.push(`Correct prediction: ${correct}`);

        try {
          await recordStrategyPerformance(merchantId, strategyType, {
            success: outcome === "SUCCESS",
            revenueMinor: actualMinor,
            costMinor: 0,
            roi: actualMinor > 0 && predictedMinor > 0 ? actualMinor / predictedMinor : 0,
          });

          await recordPredictionAccuracy(merchantId, strategyType, predictedMinor, actualMinor);

          await storeExperiment(merchantId, executionId, {
            strategyType,
            opportunityType: execution.actionType,
            predictedRevenueMinor: predictedMinor,
            actualRevenueMinor: actualMinor,
            predictedCostMinor: 0,
            actualCostMinor: 0,
            predictedNetImpactMinor: predictedMinor,
            actualNetImpactMinor: actualMinor,
            status: "OBSERVED",
          });

          evidence.push("Updated long-term memory and experiment records");
        } catch (error) {
          evidence.push(`Memory update error: ${error instanceof Error ? error.message : "unknown"}`);
        }
      }
    }

    const accuracy = predictedMinor > 0
      ? Math.max(0, 100 - Math.abs(predictedMinor - actualMinor) / predictedMinor * 100)
      : 0;

    return {
      agentType: "LEARNING",
      agentRunId: input.agentRunId ?? "",
      status: "COMPLETED",
      confidence: accuracy,
      reasoningSummary: `Learning recorded: predicted ₹${Math.round(predictedMinor / 100)}, actual ₹${Math.round(actualMinor / 100)}, accuracy ${Math.round(accuracy)}%`,
      evidence,
      proposals: [{
        proposalType: "LEARNING",
        title: `Learning: ${outcome}`,
        description: `Recorded outcome for ${strategyType}: predicted ₹${Math.round(predictedMinor / 100)}, actual ₹${Math.round(actualMinor / 100)}`,
        confidence: accuracy,
        riskLevel: "LOW",
        financialImpact: { amountMinor: actualMinor, currency: "INR" },
        evidence,
      }],
      warnings: accuracy < 50 ? ["Low prediction accuracy detected"] : [],
      outputData: {
        predictedMinor,
        actualMinor,
        accuracy,
        strategyType,
        outcome,
      },
      createdAt: new Date(),
    };
  },

  validate(output: AgentOutput) {
    return validateAgentOutput(output);
  },
};
