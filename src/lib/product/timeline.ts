import { prisma } from "@/lib/prisma";

export interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  status: "SUCCESS" | "PENDING" | "FAILED" | "INFO";
  metadata?: Record<string, unknown>;
}

export async function getGrowthTimeline(merchantId: string, limit: number = 50): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  const [opportunities, decisions, executions, agentEvents, growthCycles] = await Promise.all([
    prisma.opportunity.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, type: true, status: true, estimatedRevenueMinor: true, createdAt: true },
    }),
    prisma.decision.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, decisionCategory: true, decisionScore: true, explanation: true, createdAt: true },
    }),
    prisma.execution.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, actionType: true, status: true, amountMinor: true, createdAt: true },
    }),
    prisma.agentEvent.findMany({
      where: { merchantId },
      orderBy: { timestamp: "desc" },
      take: limit,
      select: { id: true, eventType: true, agentType: true, details: true, timestamp: true },
    }),
    prisma.growthCycle.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, status: true, startedAt: true, completedAt: true, createdAt: true },
    }),
  ]);

  for (const opp of opportunities) {
    events.push({
      id: `opp-${opp.id}`,
      type: "OPPORTUNITY_DETECTED",
      title: `Growth opportunity: ${opp.type}`,
      description: `Potential value: ₹${((opp.estimatedRevenueMinor || 0) / 100).toLocaleString("en-IN")}`,
      timestamp: (opp.createdAt || new Date()).toISOString(),
      status: opp.status === "ACTIONED" ? "SUCCESS" : opp.status === "DISMISSED" ? "FAILED" : "PENDING",
    });
  }

  for (const dec of decisions) {
    events.push({
      id: `dec-${dec.id}`,
      type: "DECISION_MADE",
      title: `Decision: ${dec.decisionCategory}`,
      description: dec.explanation || `Score: ${dec.decisionScore}`,
      timestamp: (dec.createdAt || new Date()).toISOString(),
      status: dec.decisionCategory?.includes("RECOMMEND") ? "SUCCESS" : "INFO",
    });
  }

  for (const exec of executions) {
    events.push({
      id: `exec-${exec.id}`,
      type: "EXECUTION",
      title: `Execution: ${exec.actionType}`,
      description: `₹${((exec.amountMinor || 0) / 100).toLocaleString("en-IN")} - ${exec.status}`,
      timestamp: (exec.createdAt || new Date()).toISOString(),
      status: exec.status === "SUCCEEDED" ? "SUCCESS" : exec.status === "FAILED" ? "FAILED" : "PENDING",
    });
  }

  for (const cycle of growthCycles) {
    events.push({
      id: `cycle-${cycle.id}`,
      type: "GROWTH_CYCLE",
      title: `Growth cycle: ${cycle.status}`,
      description: cycle.completedAt ? `Completed in ${Math.round((new Date(cycle.completedAt).getTime() - new Date(cycle.startedAt || cycle.createdAt).getTime()) / 60000)}min` : "In progress",
      timestamp: (cycle.startedAt || cycle.createdAt || new Date()).toISOString(),
      status: cycle.status === "COMPLETED" ? "SUCCESS" : cycle.status === "FAILED" ? "FAILED" : "PENDING",
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events.slice(0, limit);
}
