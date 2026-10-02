import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { Policy } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthFromCookies();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const merchantId = session.merchantId;
    if (!merchantId) return NextResponse.json({ error: "No merchant" }, { status: 400 });

    const policies = await prisma.policy.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ policies });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch policies" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthFromCookies();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const merchantId = session.merchantId;
    if (!merchantId) return NextResponse.json({ error: "No merchant" }, { status: 400 });

    const body = await request.json();
    const policy = await prisma.policy.create({
      data: {
        merchantId,
        name: body.name,
        conditionType: body.conditionType,
        conditionOperator: body.conditionOperator,
        conditionValue: body.conditionValue,
        action: body.action,
        priority: body.priority || 0,
        isActive: true,
        conditionExpression: JSON.stringify(body),
      },
    });

    await prisma.auditLog.create({
      data: {
        merchantId,
        action: "POLICY_CREATED",
        resourceType: "POLICY",
        resourceId: policy.id,
        outcome: "CREATED",
        details: JSON.stringify({ policyId: policy.id }),
        severity: "INFO",
      },
    });

    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create policy" }, { status: 500 });
  }
}
