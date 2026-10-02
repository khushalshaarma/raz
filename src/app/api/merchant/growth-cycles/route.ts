import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runGrowthCycle, getAgentEventsForCycle } from "@/lib/agents/orchestrator";
import { getGrowthCyclesForMerchant, getGrowthCycle } from "@/lib/agents/workflows/growth-cycle";

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

  const { searchParams } = new URL(request.url);
  const cycleId = searchParams.get("id");

  if (cycleId) {
    const cycle = await getGrowthCycle(cycleId);
    if (!cycle || cycle.merchantId !== merchant.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const events = await getAgentEventsForCycle(merchant.id, cycleId);
    const agentRuns = await prisma.agentRun.findMany({
      where: { growthCycleId: cycleId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ cycle, events, agentRuns });
  }

  const cycles = await getGrowthCyclesForMerchant(merchant.id, 50);
  return NextResponse.json({ cycles });
}

export async function POST(request: NextRequest) {
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

  const body = await request.json();
  const action = body.action as string;

  if (action === "start") {
    const result = await runGrowthCycle(merchant.id, body.cycleId, {
      autopilotMode: body.autopilotMode ?? "FULL",
      skipExecution: body.skipExecution ?? false,
    });
    return NextResponse.json(result);
  }

  if (action === "create") {
    const { createGrowthCycle } = await import("@/lib/agents/workflows/growth-cycle");
    const cycleId = await createGrowthCycle(merchant.id);
    return NextResponse.json({ cycleId });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
