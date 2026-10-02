import { prisma } from "@/lib/prisma";

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  components: Record<string, ComponentHealth>;
}

export interface ComponentHealth {
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs?: number;
  error?: string;
}

async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "healthy", latencyMs: Date.now() - start };
  } catch (error) {
    return { status: "unhealthy", latencyMs: Date.now() - start, error: "Database connection failed" };
  }
}

async function checkRazorpay(): Promise<ComponentHealth> {
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!razorpayKeyId || !razorpayKeySecret) {
    return { status: "degraded", error: "Razorpay credentials not configured" };
  }
  return { status: "healthy" };
}

async function checkAgents(): Promise<ComponentHealth> {
  try {
    const agentCount = await prisma.agent.count();
    return { status: agentCount > 0 ? "healthy" : "degraded" };
  } catch {
    return { status: "unhealthy", error: "Agent table inaccessible" };
  }
}

async function checkGovernance(): Promise<ComponentHealth> {
  try {
    const policyCount = await prisma.policy.count({ where: { isActive: true } });
    return { status: "healthy" };
  } catch {
    return { status: "unhealthy", error: "Governance tables inaccessible" };
  }
}

async function checkExecution(): Promise<ComponentHealth> {
  try {
    await prisma.execution.count();
    return { status: "healthy" };
  } catch {
    return { status: "unhealthy", error: "Execution table inaccessible" };
  }
}

async function checkWebhooks(): Promise<ComponentHealth> {
  try {
    const recentFailed = await prisma.webhookEvent.count({
      where: {
        status: "FAILED",
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentFailed > 10) {
      return { status: "degraded", error: `${recentFailed} webhook failures in last hour` };
    }
    return { status: "healthy" };
  } catch {
    return { status: "unhealthy", error: "Webhook table inaccessible" };
  }
}

export async function getSystemHealth(): Promise<HealthStatus> {
  const [database, razorpay, agents, governance, execution, webhooks] = await Promise.all([
    checkDatabase(),
    checkRazorpay(),
    checkAgents(),
    checkGovernance(),
    checkExecution(),
    checkWebhooks(),
  ]);

  const components = { database, razorpay, agents, governance, execution, webhooks };
  const statuses = Object.values(components).map((c) => c.status);

  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
  if (statuses.includes("unhealthy")) overallStatus = "unhealthy";
  else if (statuses.includes("degraded")) overallStatus = "degraded";

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    components,
  };
}

export async function getLiveness(): Promise<{ status: string; timestamp: string }> {
  return { status: "alive", timestamp: new Date().toISOString() };
}

export async function getReadiness(): Promise<{ ready: boolean; components: Record<string, ComponentHealth> }> {
  const [database] = await Promise.all([checkDatabase()]);
  return {
    ready: database.status === "healthy",
    components: { database },
  };
}
