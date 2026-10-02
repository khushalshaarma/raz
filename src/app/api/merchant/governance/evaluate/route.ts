/**
 * POST /api/merchant/governance/evaluate
 *
 * Main governance evaluation endpoint.
 * Evaluates all gates and returns the governance decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { evaluateGovernance } from "@/lib/governance/governance";
import { getAuthFromCookies } from "@/lib/auth";

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

    const result = await evaluateGovernance(
      {
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
        customerId: body.customerId,
      },
      merchantId,
      // The authenticated user is the human requester, so four-eyes can be
      // enforced when this request later comes up for approval.
      session.userId
    );

    return NextResponse.json({ governance: result });
  } catch (error) {
    return NextResponse.json(
      { error: "Governance evaluation failed", details: (error as Error).message },
      { status: 500 }
    );
  }
}
