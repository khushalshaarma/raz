import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await getAuthFromCookies();
  if (!auth || auth.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const failedRuns = await prisma.agentRun.findMany({
    where: { status: "FAILED" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const blockedRuns = await prisma.agentRun.findMany({
    where: { status: "BLOCKED" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const runningRuns = await prisma.agentRun.findMany({
    where: { status: "RUNNING" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const longRunning = await prisma.agentRun.findMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: new Date(Date.now() - 300000) },
    },
    orderBy: { startedAt: "asc" },
    take: 20,
  });

  const securityEvents = await prisma.agentEvent.findMany({
    where: { severity: { in: ["WARNING", "ERROR", "CRITICAL"] } },
    orderBy: { timestamp: "desc" },
    take: 50,
  });

  const totalRuns = await prisma.agentRun.count();
  const completedRuns = await prisma.agentRun.count({ where: { status: "COMPLETED" } });
  const failedRunCount = await prisma.agentRun.count({ where: { status: "FAILED" } });

  return NextResponse.json({
    failedRuns,
    blockedRuns,
    runningRuns,
    longRunning,
    securityEvents,
    stats: {
      totalRuns,
      completedRuns,
      failedRuns: failedRunCount,
      successRate: totalRuns > 0 ? completedRuns / totalRuns : 0,
    },
  });
}
