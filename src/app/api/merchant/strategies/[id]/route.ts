import { NextRequest } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard, notFoundResponse } from "@/lib/errors";
import { getSimulationDetail, compareStrategies } from "@/lib/product/strategy-workspace";

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
    const detail = await getSimulationDetail(merchantId, id);
    if (!detail) return notFoundResponse("Strategy not found");

    return successResponse({ strategy: detail });
  } catch (error) {
    console.error("Strategy detail error:", error);
    return errorResponse("Failed to load strategy");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const body = await request.json();
    const { strategyIds } = body as { strategyIds?: string[] };

    if (!strategyIds || !Array.isArray(strategyIds) || strategyIds.length < 2) {
      return errorResponse("Provide at least 2 strategy IDs to compare", 400);
    }

    const comparison = await compareStrategies(merchantId, strategyIds);
    return successResponse({ comparison });
  } catch (error) {
    console.error("Strategy comparison error:", error);
    return errorResponse("Failed to compare strategies");
  }
}
