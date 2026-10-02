import type { AgentType, AutopilotMode, MerchantAgentConfig, AgentContextData } from "./types";

export type { AgentContextData };

export function createAgentContext(
  merchantId: string,
  growthCycleId?: string,
  previousResults?: Record<string, unknown>
): AgentContextData {
  return {
    merchantId,
    growthCycleId,
    previousResults: previousResults ?? {},
  };
}

export function getContextForAgent(
  context: AgentContextData,
  agentType: AgentType,
  stepName: string
): AgentContextData {
  return {
    ...context,
    currentStep: stepName,
    previousResults: {
      ...context.previousResults,
      [`lastAgent`]: agentType,
      [`lastStep`]: stepName,
    },
  };
}

export function getSafeContext(context: AgentContextData): Record<string, unknown> {
  return {
    merchantId: context.merchantId,
    growthCycleId: context.growthCycleId,
    currentStep: context.currentStep,
    autopilotMode: context.autopilotMode,
  };
}
