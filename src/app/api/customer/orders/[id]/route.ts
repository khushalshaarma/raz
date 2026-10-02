import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, unauthorizedResponse, errorResponse, notFoundResponse, forbiddenResponse } from "@/lib/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthFromCookies();
    if (!user) {
      return unauthorizedResponse();
    }

    const { id } = await params;

    // Customer can only access their own orders
    let where: any = { id };
    if (user.role === "CUSTOMER") {
      const customer = await prisma.customer.findUnique({
        where: { userId: user.userId },
      });
      if (!customer) {
        return notFoundResponse("Customer account not found");
      }
      where.customerId = customer.id;
    } else if (user.role === "MERCHANT" && user.merchantId) {
      where.merchantId = user.merchantId;
    } else if (user.role === "ADMIN") {
      // Admin can view any order (read-only)
    } else {
      return forbiddenResponse();
    }

    const order = await prisma.order.findUnique({
      where,
      include: {
        items: {
          include: { product: { select: { name: true, priceMinor: true } } },
        },
        payments: true,
      },
    });

    if (!order) {
      return notFoundResponse("Order not found");
    }

    return successResponse({ order });
  } catch (error) {
    console.error("Order detail error:", error);
    return errorResponse("Failed to load order");
  }
}
