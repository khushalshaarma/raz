import { NextRequest } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard } from "@/lib/errors";
import { getMerchantSimulations, getStrategyStats } from "@/lib/product/strategy-workspace";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const { searchParams } = new URL(request.url);
    const opportunityType = searchParams.get("opportunityType") || undefined;
    const riskLevel = searchParams.get("riskLevel") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

    const [strategies, stats] = await Promise.all([
      getMerchantSimulations(merchantId, { opportunityType, riskLevel, limit }),
      getStrategyStats(merchantId),
    ]);

    return successResponse({ strategies, stats });
  } catch (error) {
    console.error("Strategies error:", error);
    return errorResponse("Failed to load strategies");
  }
}
