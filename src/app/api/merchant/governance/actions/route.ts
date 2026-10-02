/**
 * GET /api/merchant/governance/actions
 * POST /api/merchant/governance/actions
 *
 * List and create action requests for the authenticated merchant.
 * All requests are scoped by the authenticated merchantId.
 */

import { NextRequest, NextResponse } from "next/server";
import { createActionRequest, listActionRequests } from "@/lib/governance/action";
import { getAuthFromCookies } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthFromCookies();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const merchantId = session.merchantId;
    if (!merchantId) {
      return NextResponse.json({ error: "No merchant associated" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const actionType = searchParams.get("actionType") || undefined;
    const skip = parseInt(searchParams.get("skip") || "0", 10);
    const take = parseInt(searchParams.get("take") || "20", 10);

    const actions = await listActionRequests(
      merchantId,
      merchantId,
      { skip, take, status, actionType }
    );

    return NextResponse.json({ actions });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch action requests" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthFromCookies();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const merchantId = session.merchantId;
    if (!merchantId) {
      return NextResponse.json({ error: "No merchant associated" }, { status: 400 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.actionType || !body.strategyId || !body.amountMinor) {
      return NextResponse.json(
        { error: "Missing required fields: actionType, strategyId, amountMinor" },
        { status: 400 }
      );
    }

    const input = {
      actionType: body.actionType,
      strategyId: body.strategyId,
      recommendedScenario: body.recommendedScenario,
      decisionScore: body.decisionScore,
      riskLevel: body.riskLevel,
      confidence: body.confidence,
      amountMinor: body.amountMinor,
      currency: body.currency || "INR",
      rationale: body.rationale,
      evidence: body.evidence,
      policyId: body.policyId,
      customerCount: body.customerCount || 0,
      orderCount: body.orderCount || 0,
      historicalSpanDays: body.historicalSpanDays || 0,
      // Attribute the request to the authenticated human so approval can
      // enforce four-eyes.
      requestedBy: session.userId,
    };

    const result = await createActionRequest(input, merchantId);

    return NextResponse.json({ actionRequest: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create action request" },
      { status: 500 }
    );
  }
}
