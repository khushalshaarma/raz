import { NextRequest } from "next/server";
import { getMerchantOpportunities } from "@/lib/product/opportunity-center";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;
    const opportunities = await getMerchantOpportunities(merchantId, { status });

    return successResponse({ opportunities });
  } catch (error) {
    console.error("Opportunities error:", error);
    return errorResponse("Failed to load opportunities");
  }
}
