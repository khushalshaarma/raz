import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthFromCookies } from "@/lib/auth";
import { successResponse, errorResponse, authorizeRoutes } from "@/lib/errors";

export async function GET() {
  try {
    const user = await getAuthFromCookies();
    const auth = authorizeRoutes(user, ["ADMIN"]);
    if ("response" in auth) return auth.response;

    const [merchants, users, recentAuditLogs, systemHealth] =
      await Promise.all([
        prisma.merchant.findMany({
          include: {
            owner: { select: { name: true, email: true } },
            _count: {
              select: {
                products: true,
                orders: true,
                customers: true,
              },
            },
          },
        }),
        prisma.user.count(),
        // `AuditLog` is canonical; `AuditEvent` only ever had a dead writer.
        prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.systemHealth.findFirst({
          orderBy: { lastCheckedAt: "desc" },
        }),
      ]);

    const stats = {
      totalMerchants: merchants.length,
      activeUsers: users,
      totalProducts: await prisma.product.count(),
      totalOrders: await prisma.order.count(),
      totalCustomers: await prisma.customer.count(),
      totalRevenue: (
        await prisma.order.aggregate({
          where: { status: "COMPLETED" },
          _sum: { totalMinor: true },
        })
      )._sum.totalMinor || 0,
    };

    return successResponse({
      stats,
      merchants,
      recentAuditLogs,
      // Kept under the old key so the admin dashboard page keeps working.
      recentAuditEvents: recentAuditLogs,
      systemHealth,
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    return errorResponse("Failed to load admin dashboard");
  }
}