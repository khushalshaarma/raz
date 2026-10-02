import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAgentRunStats } from "@/lib/agents/agent-result";

export async function GET(request: NextRequest) {
  const auth = await getAuthFromCookies();
  if (!auth || auth.role !== "MERCHANT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const merchant = await prisma.merchant.findUnique({
    where: { ownerId: auth.userId },
  });
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  const agents = await prisma.agent.findMany({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "desc" },
  });

  const stats = await getAgentRunStats(merchant.id);

  const recentRuns = await prisma.agentRun.findMany({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ agents, stats, recentRuns });
}
