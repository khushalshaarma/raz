import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, merchantGuard } from "@/lib/errors";

export async function GET() {
  try {
    const user = await getAuthFromCookies();
    const guard = merchantGuard(user);
    if ("response" in guard) return guard.response;
    const merchantId = guard.merchantId;

    const [totalRevenue, totalOrders, totalCustomers, recentOrders] =
      await Promise.all([
        prisma.order.aggregate({
          where: { merchantId, status: "COMPLETED" },
          _sum: { totalMinor: true },
        }),
        prisma.order.count({ where: { merchantId } }),
        prisma.customer.count({ where: { merchantId } }),
        prisma.order.findMany({
          where: { merchantId },
          take: 5,
          orderBy: { createdAt: "desc" },
          include: { customer: { select: { name: true, email: true } } },
        }),
      ]);

    const conversionRate =
      totalCustomers > 0
        ? Math.round((totalOrders / Math.max(totalCustomers, 1)) * 100)
        : 0;

    return successResponse({
      stats: {
        totalRevenue: totalRevenue._sum.totalMinor || 0,
        totalOrders,
        totalCustomers,
        conversionRate,
      },
      recentOrders,
    });
  } catch (error) {
    console.error("Merchant dashboard error:", error);
    return errorResponse("Failed to load dashboard");
  }
}
