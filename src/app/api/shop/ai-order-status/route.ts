import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, unauthorizedResponse, errorResponse, badRequestResponse } from "@/lib/errors";
import { getCheckoutStatus } from "@/lib/ai-buyer/checkout";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    if (!user) return unauthorizedResponse();

    let merchantId: string;
    if (user.role === "MERCHANT" && user.merchantId) {
      merchantId = user.merchantId;
    } else {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(req.url);
    const checkoutId = searchParams.get("checkoutId");

    if (!checkoutId) {
      return badRequestResponse("checkoutId is required");
    }

    const status = await getCheckoutStatus(checkoutId, merchantId);

    if (!status) {
      return errorResponse("Checkout not found", 404);
    }

    return successResponse(status);
  } catch (error) {
    console.error("AI Order Status error:", error);
    return errorResponse("Failed to fetch order status");
  }
}