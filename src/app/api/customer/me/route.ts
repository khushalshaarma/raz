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
    if (customer) {
      return successResponse({ customer });
    }

    return successResponse({ customer: null });
  } catch (error) {
    console.error("Customer detail error:", error);
    return errorResponse("Failed to load customer");
  }
}