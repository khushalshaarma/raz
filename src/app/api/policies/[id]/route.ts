import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromRequest } from "@/lib/auth";
import { merchantGuard } from "@/lib/errors";

/**
 * GET/PUT /api/policies/[id]
 *
 * A policy is only addressable by the merchant that owns it. The previous
 * implementation used `prisma.policy.findUnique({ where: { id } })` and
 * `prisma.policy.update({ where: { id } })` with no ownership check, so any
 * authenticated user — including a CUSTOMER-role session — could read or
 * rewrite any policy in the system, including other merchants' policies.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthFromRequest(request);
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;

    const { id } = await params;

    // `findFirst` with an explicit merchantId — `findUnique` cannot express
    // the ownership constraint.
    const policy = await prisma.policy.findFirst({
      where: { id, merchantId: guard.merchantId },
    });
    if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

    return NextResponse.json({ policy });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch policy" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthFromRequest(request);
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;

    const { id } = await params;
    const merchantId = guard.merchantId;

    // Ownership must be verified before any write.
    const existing = await prisma.policy.findFirst({
      where: { id, merchantId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

    const body = await request.json();

    // Only forward fields the client actually supplied, so a partial update
    // does not blank out unrelated columns with `undefined`.
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name;
    if (typeof body.conditionType === "string") data.conditionType = body.conditionType;
    if (typeof body.conditionOperator === "string") data.conditionOperator = body.conditionOperator;
    if (typeof body.conditionValue === "number") data.conditionValue = body.conditionValue;
    if (typeof body.action === "string") data.action = body.action;
    if (typeof body.priority === "number") data.priority = body.priority;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const policy = await prisma.policy.update({
      where: { id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        merchantId,
        action: "POLICY_UPDATED",
        resourceType: "POLICY",
        resourceId: id,
        outcome: "UPDATED",
        details: JSON.stringify({ policyId: id, fields: Object.keys(data) }),
        severity: "INFO",
      },
    });

    return NextResponse.json({ policy });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update policy" }, { status: 500 });
  }
}
