import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, unauthorizedResponse, errorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const user = await getAuthFromCookies();
    if (!user) {
      return unauthorizedResponse();
    }

    let merchantId: string;

    if (user.role === "MERCHANT" && user.merchantId) {
      merchantId = user.merchantId;
    } else if (user.role === "CUSTOMER") {
      const customer = await prisma.customer.findUnique({
        where: { userId: user.userId },
      });
      if (!customer) {
        return successResponse({ products: [] });
      }
      merchantId = customer.merchantId;
    } else {
      return unauthorizedResponse();
    }

    const products = await prisma.product.findMany({
      where: { merchantId, active: true },
      orderBy: { createdAt: "desc" },
    });

    return successResponse({ products });
  } catch (error) {
    console.error("Shop products error:", error);
    return errorResponse("Failed to load products");
  }
}
