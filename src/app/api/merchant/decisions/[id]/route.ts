import { NextRequest } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard, notFoundResponse } from "@/lib/errors";
import { getDecisionById } from "@/lib/product/decision-center";

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
    const detail = await getDecisionById(merchantId, id);
    if (!detail) return notFoundResponse("Decision not found");

    return successResponse({ decision: detail });
  } catch (error) {
    console.error("Decision detail error:", error);
    return errorResponse("Failed to load decision");
  }
}
