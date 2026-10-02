import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, unauthorizedResponse, errorResponse, badRequestResponse } from "@/lib/errors";
import { getAICatalog } from "@/lib/ai-buyer/catalog";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    if (!user) return unauthorizedResponse();

    let merchantId: string;

    if (user.role === "MERCHANT" && user.merchantId) {
      merchantId = user.merchantId;
    } else if (user.role === "CUSTOMER") {
      const customer = await prisma.customer.findUnique({ where: { userId: user.userId } });
      if (!customer) return successResponse({ products: [] });
      merchantId = customer.merchantId;
    } else {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const category = searchParams.get("category") || undefined;
    const minPrice = searchParams.get("minPrice") ? parseFloat(searchParams.get("minPrice")!) : undefined;
    const maxPrice = searchParams.get("maxPrice") ? parseFloat(searchParams.get("maxPrice")!) : undefined;
    const availability = searchParams.get("availability") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;

    const constraints = {
      ...(search ? { search } : {}),
      ...(category ? { category } : {}),
      ...(minPrice !== undefined ? { minPrice } : {}),
      ...(maxPrice !== undefined ? { maxPrice } : {}),
      ...(availability ? { inStockOnly: availability !== "out_of_stock" } : {}),
      ...(limit ? { limit } : {}),
    };

    const catalog = await getAICatalog(merchantId, constraints);

    return successResponse(catalog);
  } catch (error) {
    console.error("AI Catalog error:", error);
    return errorResponse("Failed to load AI catalog");
  }
}