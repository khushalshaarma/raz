import { NextRequest } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard } from "@/lib/errors";
import { listDecisions, getDecisionStats } from "@/lib/product/decision-center";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || undefined;
    const opportunityType = searchParams.get("opportunityType") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

    const [decisions, stats] = await Promise.all([
      listDecisions(merchantId, { category, opportunityType, limit }),
      getDecisionStats(merchantId),
    ]);

    return successResponse({ decisions, stats });
  } catch (error) {
    console.error("Decisions error:", error);
    return errorResponse("Failed to load decisions");
  }
}
