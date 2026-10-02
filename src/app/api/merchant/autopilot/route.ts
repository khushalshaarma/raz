import { NextRequest, NextResponse } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAutopilotConfig, updateAutopilotConfig, stopAutopilot } from "@/lib/agents/autopilot";

export async function GET() {
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

  const config = await getAutopilotConfig(merchant.id);
  return NextResponse.json({ config });
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

  if (body.action === "stop") {
    await stopAutopilot(merchant.id);
    return NextResponse.json({ stopped: true });
  }

  await updateAutopilotConfig(merchant.id, {
    mode: body.mode,
    maxDailySpendMinor: body.maxDailySpendMinor,
    maxCampaignSpendMinor: body.maxCampaignSpendMinor,
    maxCustomerSpendMinor: body.maxCustomerSpendMinor,
    maxActionsPerHour: body.maxActionsPerHour,
    maxActionsPerDay: body.maxActionsPerDay,
    minimumConfidence: body.minimumConfidence,
    maximumRisk: body.maximumRisk,
    approvalRequiredAboveMinor: body.approvalRequiredAboveMinor,
    isActive: body.isActive,
  });

  const config = await getAutopilotConfig(merchant.id);
  return NextResponse.json({ config });
}
