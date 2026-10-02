import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, unauthorizedResponse, errorResponse, badRequestResponse } from "@/lib/errors";
import { createCheckout, confirmCheckout } from "@/lib/ai-buyer/checkout";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    if (!user) return unauthorizedResponse();

    let merchantId: string;
    if (user.role === "MERCHANT" && user.merchantId) {
      merchantId = user.merchantId;
    } else {
      return unauthorizedResponse();
    }

    const body = await req.json();
    const { proposalId } = body as { proposalId?: string };

    if (!proposalId || typeof proposalId !== "string") {
      return badRequestResponse("proposalId is required");
    }

    const result = await createCheckout({ proposalId, merchantId });

    return successResponse(result);
  } catch (error) {
    console.error("AI Checkout error:", error);
    return errorResponse("Checkout failed");
  }
}

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

    const result = await confirmCheckout(checkoutId, merchantId);

    return successResponse(result);
  } catch (error) {
    console.error("AI Order Status error:", error);
    return errorResponse("Failed to fetch order status");
  }
}