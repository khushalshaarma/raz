import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromRequest } from "@/lib/auth";
import { merchantGuard } from "@/lib/errors";

/**
 * POST /api/policies/[id]/toggle
 *
 * Toggling a policy mutates the governance rules that gate automated actions,
 * so the ownership check is mandatory: the previous implementation updated
 * `where: { id }` with no merchant scoping, letting any authenticated user
 * enable or disable any policy — including the `AUTOMATION_PAUSED` kill
 * switch, which the governance agent reads to block all automation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthFromRequest(request);
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const { id } = await params;

    const existing = await prisma.policy.findFirst({
      where: { id, merchantId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

    const body = await request.json();
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
    }
    const { isActive } = body;

    await prisma.policy.update({
      where: { id },
      data: { isActive },
    });

    await prisma.auditLog.create({
      data: {
        merchantId,
        action: isActive ? "POLICY_ENABLED" : "POLICY_DISABLED",
        resourceType: "POLICY",
        resourceId: id,
        outcome: isActive ? "ENABLED" : "DISABLED",
        details: JSON.stringify({ policyId: id, isActive }),
        severity: "INFO",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to toggle policy" }, { status: 500 });
  }
}
