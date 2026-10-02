import { NextRequest } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard, notFoundResponse } from "@/lib/errors";
import { getSimulationById } from "@/lib/product/simulation-center";

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
    const detail = await getSimulationById(merchantId, id);
    if (!detail) return notFoundResponse("Simulation not found");

    return successResponse({ simulation: detail });
  } catch (error) {
    console.error("Simulation detail error:", error);
    return errorResponse("Failed to load simulation");
  }
}
