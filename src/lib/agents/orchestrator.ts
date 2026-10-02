import { prisma } from "@/lib/prisma";
import type {
  AgentType,
  AgentInput,
  AgentContextData,
  AgentOutput,
  GrowthCycleStatus,
} from "./types";
import { getAgentRegistry } from "./agent-registry";
import { createAgentRun, startAgentRun, completeAgentRun, failAgentRun } from "./agent-result";
import { createAgentMessage } from "./agent-message";
import { validateAgentOutput } from "./validator";
import {
  createGrowthCycle,
  updateGrowthCycleStatus,
  incrementCycleCounters,
  blockGrowthCycle,
  failGrowthCycle,
  canTransitionTo,
} from "./workflows/growth-cycle";
import { opportunityAgent } from "./agents/opportunity-agent";
import { strategyAgent } from "./agents/strategy-agent";
import { simulationAgent } from "./agents/simulation-agent";
import { decisionAgent } from "./agents/decision-agent";
import { securityAgent } from "./agents/security-agent";
import { governanceAgent } from "./agents/governance-agent";
import { executionAgent } from "./agents/execution-agent";
import { observationAgent } from "./agents/observation-agent";
import { learningAgent } from "./agents/learning-agent";

export async function createAgentEvent(params: {
  merchantId: string;
  growthCycleId?: string;
  eventType: string;
  agentType?: string;
  agentRunId?: string;
  title: string;
  details?: Record<string, unknown>;
  severity?: string;
}): Promise<void> {
  await prisma.agentEvent.create({
    data: {
      merchantId: params.merchantId,
      growthCycleId: params.growthCycleId,
      eventType: params.eventType,
      agentType: params.agentType,
      agentRunId: params.agentRunId,
      title: params.title,
      details: params.details ? JSON.stringify(params.details) : null,
      severity: params.severity ?? "INFO",
    },
  });
}

export async function getAgentEventsForCycle(
  merchantId: string,
  growthCycleId: string
) {
  return prisma.agentEvent.findMany({
    where: { merchantId, growthCycleId },
    orderBy: { timestamp: "asc" },
  });
}

function registerDefaultAgents(): void {
  const registry = getAgentRegistry();
  if (!registry.has("OPPORTUNITY")) {
    registry.register(opportunityAgent, 1, true);
    registry.register(strategyAgent, 2, true);
    registry.register(simulationAgent, 3, true);
    registry.register(decisionAgent, 4, true);
    registry.register(securityAgent, 5, true);
    registry.register(governanceAgent, 6, true);
    registry.register(executionAgent, 7, true);
    registry.register(observationAgent, 8, false);
    registry.register(learningAgent, 9, false);
  }
}

export interface GrowthCycleResult {
  cycleId: string;
  status: GrowthCycleStatus;
  agentResults: AgentOutput[];
  blockReason?: string;
}

export async function runGrowthCycle(
  merchantId: string,
  cycleId?: string,
  options?: { autopilotMode?: string; skipExecution?: boolean }
): Promise<GrowthCycleResult> {
  registerDefaultAgents();
  const registry = getAgentRegistry();

  if (!cycleId) {
    cycleId = await createGrowthCycle(merchantId);
  }

  const context: AgentContextData = {
    merchantId,
    growthCycleId: cycleId,
    autopilotMode: (options?.autopilotMode as "OFF" | "REVIEW" | "LIMITED" | "FULL") ?? "FULL",
  };

  const agentResults: AgentOutput[] = [];
  let previousOutput: Record<string, unknown> = {};

  await createAgentEvent({
    merchantId,
    growthCycleId: cycleId,
    eventType: "CYCLE_STARTED",
    title: "Growth cycle started",
  });

  try {
    // Step 1: OBSERVE
    await safeTransition(cycleId, "OBSERVING");
    await createAgentEvent({
      merchantId, growthCycleId: cycleId,
      eventType: "OPPORTUNITY_FOUND", title: "Observing merchant data",
    });

    // Step 2: OPPORTUNITY
    const oppResult = await runAgent("OPPORTUNITY", merchantId, cycleId, {}, previousOutput);
    agentResults.push(oppResult);
    previousOutput = { ...previousOutput, opportunities: oppResult.proposals };
    await incrementCycleCounters(cycleId, { opportunityCount: oppResult.proposals.length });

    if (oppResult.status === "BLOCKED") {
      await blockGrowthCycle(cycleId, "Security blocked opportunity agent");
      return { cycleId, status: "BLOCKED", agentResults, blockReason: "Security blocked" };
    }

    // Step 3: ANALYZE
    await safeTransition(cycleId, "ANALYZING");
    await createAgentEvent({
      merchantId, growthCycleId: cycleId,
      eventType: "ANALYZING", title: "Analyzing opportunities",
    });

    // Step 4: STRATEGY
    await safeTransition(cycleId, "STRATEGIZING");
    const stratResult = await runAgent("STRATEGY", merchantId, cycleId, { proposals: oppResult.proposals }, previousOutput);
    agentResults.push(stratResult);
    previousOutput = { ...previousOutput, strategies: stratResult.proposals };
    await incrementCycleCounters(cycleId, { strategyCount: stratResult.proposals.length });

    // Step 5: SIMULATION
    await safeTransition(cycleId, "SIMULATING");
    const simResult = await runAgent("SIMULATION", merchantId, cycleId, { proposals: stratResult.proposals }, previousOutput);
    agentResults.push(simResult);
    previousOutput = { ...previousOutput, simulations: simResult.proposals };

    // Step 6: DECISION
    await safeTransition(cycleId, "DECIDING");
    const decResult = await runAgent("DECISION", merchantId, cycleId, { proposals: simResult.proposals }, previousOutput);
    agentResults.push(decResult);
    previousOutput = { ...previousOutput, decision: decResult.proposals[0] };
    await incrementCycleCounters(cycleId, { decisionCount: 1 });

    // Step 7: SECURITY
    const secResult = await runAgent("SECURITY", merchantId, cycleId, { proposals: decResult.proposals }, previousOutput);
    agentResults.push(secResult);

    if (secResult.status === "BLOCKED") {
      await blockGrowthCycle(cycleId, "Security agent blocked");
      return { cycleId, status: "BLOCKED", agentResults, blockReason: "Security blocked" };
    }

    // Step 8: GOVERNANCE
    await safeTransition(cycleId, "GOVERNING");
    const govResult = await runAgent("GOVERNANCE", merchantId, cycleId, {
      proposals: decResult.proposals,
      opportunityType: oppResult.proposals[0]?.proposalType ?? "UNKNOWN",
      strategyId: "auto",
    }, previousOutput);
    agentResults.push(govResult);
    previousOutput = { ...previousOutput, governance: govResult.outputData };

    const govDecision = govResult.outputData?.governanceDecision as string | undefined;

    if (govDecision === "BLOCK") {
      await blockGrowthCycle(cycleId, `Governance blocked: ${govResult.outputData?.decisionReason}`);
      return { cycleId, status: "BLOCKED", agentResults, blockReason: govResult.outputData?.decisionReason as string };
    }

    if (govDecision === "REQUIRE_APPROVAL" || options?.autopilotMode === "REVIEW") {
      await updateGrowthCycleStatus(cycleId, "WAITING_APPROVAL");
      await createAgentEvent({
        merchantId, growthCycleId: cycleId,
        eventType: "APPROVAL_REQUESTED",
        title: "Waiting for merchant approval",
        details: { governanceDecision: govDecision },
      });
      return { cycleId, status: "WAITING_APPROVAL", agentResults };
    }

    if (options?.skipExecution) {
      await updateGrowthCycleStatus(cycleId, "COMPLETED");
      return { cycleId, status: "COMPLETED", agentResults };
    }

    // Step 9: EXECUTION
    await safeTransition(cycleId, "EXECUTING");
    const execResult = await runAgent("EXECUTION", merchantId, cycleId, {
      governanceDecision: govDecision,
      actionRequestId: govResult.outputData?.actionRequestId,
      governanceDecisionId: govResult.outputData?.governanceDecisionId,
    }, previousOutput);
    agentResults.push(execResult);
    await incrementCycleCounters(cycleId, { executionCount: 1 });

    if (execResult.status === "FAILED") {
      await failGrowthCycle(cycleId, "Execution failed");
      return { cycleId, status: "FAILED", agentResults };
    }

    // Step 10: OBSERVATION
    await safeTransition(cycleId, "OBSERVING_RESULT");
    const obsResult = await runAgent("OBSERVATION", merchantId, cycleId, {
      executionId: execResult.outputData?.executionId,
    }, previousOutput);
    agentResults.push(obsResult);
    previousOutput = { ...previousOutput, observation: obsResult.outputData };

    // Step 11: LEARNING
    await safeTransition(cycleId, "LEARNING");
    const learnResult = await runAgent("LEARNING", merchantId, cycleId, {
      executionId: execResult.outputData?.executionId,
      predictedMinor: decResult.proposals[0]?.financialImpact?.amountMinor ?? 0,
      actualMinor: (obsResult.outputData?.actualMinor as number) ?? 0,
      strategyType: decResult.outputData?.selectedStrategy ?? "UNKNOWN",
      outcome: (obsResult.outputData?.outcome as string) ?? "UNKNOWN",
    }, previousOutput);
    agentResults.push(learnResult);

    await updateGrowthCycleStatus(cycleId, "COMPLETED");
    await createAgentEvent({
      merchantId, growthCycleId: cycleId,
      eventType: "LEARNING_COMPLETED",
      title: "Growth cycle completed",
      details: { totalAgents: agentResults.length },
    });

    return { cycleId, status: "COMPLETED", agentResults };

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await failGrowthCycle(cycleId, msg);
    await createAgentEvent({
      merchantId, growthCycleId: cycleId,
      eventType: "AGENT_FAILED",
      title: `Cycle failed: ${msg}`,
      severity: "ERROR",
    });
    return { cycleId, status: "FAILED", agentResults, blockReason: msg };
  }
}

async function runAgent(
  agentType: AgentType,
  merchantId: string,
  cycleId: string,
  data: Record<string, unknown>,
  previousResults: Record<string, unknown>
): Promise<AgentOutput> {
  const registry = getAgentRegistry();
  const registration = registry.get(agentType);

  if (!registration) {
    throw new Error(`Agent ${agentType} not registered`);
  }

  const runId = await createAgentRun({
    merchantId,
    growthCycleId: cycleId,
    agentType,
    input: data,
  });

  await startAgentRun(runId);

  try {
    const input: AgentInput = {
      merchantId,
      growthCycleId: cycleId,
      agentRunId: runId,
      taskType: "EXECUTE",
      data,
      context: {
        merchantId,
        growthCycleId: cycleId,
        previousResults,
      },
    };

    const output = await registration.agent.execute(input, {
      merchantId,
      growthCycleId: cycleId,
      previousResults,
    });

    output.agentRunId = runId;

    const validation = registration.agent.validate(output);
    if (!validation.valid) {
      await failAgentRun(runId, `Validation failed: ${validation.errors.join(", ")}`);
      throw new Error(`Agent ${agentType} output validation failed: ${validation.errors.join(", ")}`);
    }

    await completeAgentRun(runId, output);

    await createAgentMessage({
      merchantId,
      growthCycleId: cycleId,
      senderAgent: agentType,
      receiverAgent: agentType,
      messageType: "EVENT",
      payload: {
        status: output.status,
        confidence: output.confidence,
        proposalCount: output.proposals.length,
      },
      agentRunId: runId,
    });

    await createAgentEvent({
      merchantId,
      growthCycleId: cycleId,
      eventType: `${agentType}_COMPLETED`,
      agentType,
      agentRunId: runId,
      title: `${agentType} agent completed: ${output.status}`,
      details: { confidence: output.confidence, proposals: output.proposals.length },
    });

    return output;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await failAgentRun(runId, msg);

    await createAgentEvent({
      merchantId,
      growthCycleId: cycleId,
      eventType: "AGENT_FAILED",
      agentType,
      agentRunId: runId,
      title: `${agentType} agent failed: ${msg}`,
      severity: "ERROR",
    });

    if (registration.isCritical) {
      throw error;
    }

    return {
      agentType,
      agentRunId: runId,
      status: "FAILED",
      confidence: 0,
      reasoningSummary: `Agent failed: ${msg}`,
      evidence: [],
      proposals: [],
      warnings: [`${agentType} agent failed: ${msg}`],
      createdAt: new Date(),
    };
  }
}

async function safeTransition(cycleId: string, newStatus: GrowthCycleStatus): Promise<void> {
  const cycle = await prisma.growthCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) throw new Error(`Growth cycle ${cycleId} not found`);

  if (!canTransitionTo(cycle.status as GrowthCycleStatus, newStatus)) {
    throw new Error(`Invalid transition: ${cycle.status} -> ${newStatus}`);
  }

  await updateGrowthCycleStatus(cycleId, newStatus);
}
