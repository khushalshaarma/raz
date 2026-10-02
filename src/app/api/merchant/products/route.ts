import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, badRequestResponse, merchantGuard } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const products = await prisma.product.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });

    return successResponse({ products });
  } catch (error) {
    console.error("Products error:", error);
    return errorResponse("Failed to load products");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const body = await request.json();
    const { name, description, priceMinor, sku, category, stock, imageUrl } = body;

    if (!name || !description || !priceMinor || !sku || !category) {
      return badRequestResponse("Missing required fields: name, description, priceMinor, sku, category");
    }

    if (!Number.isInteger(priceMinor) || priceMinor <= 0) {
      return badRequestResponse("priceMinor must be a positive integer");
    }

    const product = await prisma.product.create({
      data: {
        merchantId,
        name,
        description,
        priceMinor,
        sku,
        category,
        stock: stock || 0,
        imageUrl,
      },
    });

    return successResponse({ product }, 201);
  } catch (error: any) {
    if (error.code === "P2002") {
      return badRequestResponse("A product with this SKU already exists");
    }
    console.error("Product creation error:", error);
    return errorResponse("Failed to create product");
  }
}
