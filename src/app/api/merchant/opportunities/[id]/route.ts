import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard, notFoundResponse, badRequestResponse } from "@/lib/errors";
import { getOpportunityDetail, transitionOpportunityStatus } from "@/lib/product/opportunity-center";
import {
  generateStrategiesForHighValueInactive,
  generateStrategiesForCartAbandonment,
  generateStrategiesForUpsell,
  generateStrategiesForCrossSell,
} from "@/lib/intelligence/strategy/generator";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const { id } = await params;
    const detail = await getOpportunityDetail(merchantId, id);
    if (!detail) return notFoundResponse("Opportunity not found");

    return successResponse({ opportunity: detail });
  } catch (error) {
    console.error("Opportunity detail error:", error);
    return errorResponse("Failed to load opportunity");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const { id } = await params;
    const body = await request.json();
    const { status, reason } = body as { status?: string; reason?: string };

    if (!status) return badRequestResponse("Status is required");

    const result = await transitionOpportunityStatus(merchantId, id, status, reason);
    if (!result.success) return badRequestResponse(result.error || "Transition failed");

    return successResponse({ success: true });
  } catch (error) {
    console.error("Opportunity transition error:", error);
    return errorResponse("Failed to update opportunity");
  }
}

/** POST: Generate strategy candidates from an opportunity */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const { id } = await params;
    const opp = await prisma.opportunity.findFirst({
      where: { id, merchantId },
    });
    if (!opp) return notFoundResponse("Opportunity not found");

    // Generate strategies based on opportunity type
    let candidates;
    switch (opp.type) {
      case "HIGH_VALUE_INACTIVE":
      case "INACTIVE_CUSTOMERS":
        candidates = generateStrategiesForHighValueInactive(
          "HIGH_VALUE_INACTIVE", 50, 45, 10
        );
        break;
      case "CART_ABANDONMENT":
        candidates = generateStrategiesForCartAbandonment(15, 200000);
        break;
      case "UPSELL":
        candidates = generateStrategiesForUpsell(
          "ACTIVE_GROWING", 300000, 5000000, 20
        );
        break;
      case "CROSS_SELL":
        candidates = generateStrategiesForCrossSell(
          ["Accessories", "Complementary"], 300000, 5000000, 20
        );
        break;
      default:
        candidates = generateStrategiesForHighValueInactive(
          "HIGH_VALUE_INACTIVE", 50, 45, 10
        );
    }

    // Persist strategy experiments
    const saved = [];
    for (const c of candidates) {
      const exp = await prisma.strategyExperiment.create({
        data: {
          merchantId,
          opportunityType: opp.type,
          strategyId: c.id,
          strategyName: c.name,
          scenarioType: "EXPECTED",
          predictedNetImpactMinor: c.financials.estimatedNetImpactMinor,
          isCalibrated: false,
          calibrationCount: 0,
        },
      });
      saved.push({ ...exp, financials: c.financials, description: c.description });
    }

    // Transition opportunity to REVIEWING
    await transitionOpportunityStatus(merchantId, id, "REVIEWING");

    return successResponse({ strategies: saved });
  } catch (error) {
    console.error("Strategy generation error:", error);
    return errorResponse("Failed to generate strategies");
  }
}
