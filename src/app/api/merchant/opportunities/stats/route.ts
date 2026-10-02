import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard } from "@/lib/errors";
import { getOpportunityStats } from "@/lib/product/opportunity-center";

export async function GET() {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const stats = await getOpportunityStats(merchantId);
    return successResponse({ stats });
  } catch (error) {
    console.error("Opportunity stats error:", error);
    return errorResponse("Failed to load opportunity stats");
  }
}
