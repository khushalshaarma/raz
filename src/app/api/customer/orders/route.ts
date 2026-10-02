import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, authorizeRoutes } from "@/lib/errors";

export async function GET() {
  try {
    const user = await getAuthFromCookies();
    const auth = authorizeRoutes(user, ["CUSTOMER"]);
    if ("response" in auth) return auth.response;
    const sessionUser = auth.user;

    const customer = await prisma.customer.findUnique({
      where: { userId: sessionUser.userId },
    });

    if (!customer) {
      return successResponse({ orders: [] });
    }

    const orders = await prisma.order.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: { product: { select: { name: true } } },
        },
        payments: true,
      },
    });

    return successResponse({ orders });
  } catch (error) {
    console.error("Customer orders error:", error);
    return errorResponse("Failed to load orders");
  }
}
