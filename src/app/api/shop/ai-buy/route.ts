import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, unauthorizedResponse, errorResponse, badRequestResponse } from "@/lib/errors";
import { createBuyerSession } from "@/lib/ai-buyer/buyer";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    if (!user) return unauthorizedResponse();

    let merchantId: string;

    if (user.role === "MERCHANT" && user.merchantId) {
      merchantId = user.merchantId;
    } else if (user.role === "CUSTOMER") {
      const customer = await prisma.customer.findUnique({ where: { userId: user.userId } });
      if (!customer) return unauthorizedResponse();
      merchantId = customer.merchantId;
    } else {
      return unauthorizedResponse();
    }

    const body = await req.json();
    const { query, quantity } = body as { query?: string; quantity?: number };

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return badRequestResponse("Query is required and must be a non-empty string");
    }

    if (query.length > 5000) {
      return badRequestResponse("Query too long (max 5000 characters)");
    }

    const safeQuantity = Math.max(1, Math.min(Number(quantity) || 1, 100));

    const result = await createBuyerSession({
      merchantId,
      query: query.trim(),
      quantity: safeQuantity,
    });

    return successResponse(result);
  } catch (error) {
    console.error("AI Buy error:", error);
    return errorResponse("AI Buyer processing failed");
  }
}